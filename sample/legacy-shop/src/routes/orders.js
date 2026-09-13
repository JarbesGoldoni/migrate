const express = require("express")
const { pool } = require("../db")
const { redis } = require("../cache")
const { buildQuote, CheckoutError } = require("../lib/checkout")

const router = express.Router()
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const IDEMPOTENCY_TTL = 24 * 60 * 60

async function charge(amountCents, currency, source, email) {
  let response
  try {
    response = await fetch(`${process.env.PAYMENT_API_URL}/charges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: amountCents, currency, source, description: `Order for ${email}` }),
    })
  } catch (err) {
    throw new CheckoutError(502, { error: "payment_unavailable" })
  }
  const body = await response.json().catch(() => ({}))
  if (response.status === 402) throw new CheckoutError(402, { error: "payment_declined", reason: body.reason || "unknown" })
  if (!response.ok) throw new CheckoutError(400, { error: "payment_failed" })
  return body.id
}

router.post("/", async (req, res, next) => {
  const idempotencyKey = req.get("Idempotency-Key")
  try {
    if (idempotencyKey) {
      const previous = await redis.get(`idem:${idempotencyKey}`).catch(() => null)
      if (previous) return res.status(200).json({ ...JSON.parse(previous), replayed: true })
    }

    const body = req.body || {}
    if (!body.customerEmail || !EMAIL.test(body.customerEmail)) return res.status(400).json({ error: "invalid_email" })
    if (!body.paymentToken) return res.status(400).json({ error: "payment_token_required" })

    const { lines, result } = await buildQuote(body)
    const totalCents = Math.round(result.total * 100)
    const chargeId = await charge(totalCents, result.currency, body.paymentToken, body.customerEmail)

    const client = await pool.connect()
    let order
    try {
      await client.query("BEGIN")
      for (const line of lines) {
        const updated = await client.query("UPDATE products SET stock = stock - $1 WHERE sku = $2 AND stock >= $1", [
          line.qty,
          line.sku,
        ])
        if (updated.rowCount === 0) throw new CheckoutError(409, { error: "insufficient_stock", sku: line.sku })
      }
      const inserted = await client.query(
        "INSERT INTO orders (customer_email, status, total_cents, currency, charge_id) VALUES ($1, 'paid', $2, $3, $4) RETURNING id",
        [body.customerEmail.toLowerCase(), totalCents, result.currency, chargeId],
      )
      order = { id: inserted.rows[0].id }
      for (const item of result.items) {
        await client.query("INSERT INTO order_items (order_id, sku, qty, total_cents) VALUES ($1, $2, $3, $4)", [
          order.id,
          item.sku,
          item.qty,
          Math.round(item.total * 100),
        ])
      }
      await client.query("COMMIT")
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    } finally {
      client.release()
    }

    const response = {
      id: order.id,
      status: "paid",
      total: result.total,
      currency: result.currency,
      chargeId,
      items: result.items.map((i) => ({ sku: i.sku, qty: i.qty, total: i.total })),
    }
    if (idempotencyKey) {
      await redis.set(`idem:${idempotencyKey}`, JSON.stringify(response), "EX", IDEMPOTENCY_TTL).catch(() => {})
    }
    res.status(201).json(response)
  } catch (err) {
    if (err instanceof CheckoutError) return res.status(err.status).json(err.body)
    next(err)
  }
})

async function loadOrder(id) {
  const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [id])
  if (!rows[0]) return null
  const items = await pool.query("SELECT sku, qty, total_cents FROM order_items WHERE order_id = $1 ORDER BY sku", [id])
  return { order: rows[0], items: items.rows }
}

function parseId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: "invalid_order_id" })
    const found = await loadOrder(id)
    if (!found) return res.status(404).json({ error: "order_not_found" })
    res.json({
      id: found.order.id,
      status: found.order.status,
      customerEmail: found.order.customer_email,
      total: found.order.total_cents / 100,
      currency: found.order.currency,
      items: found.items.map((i) => ({ sku: i.sku, qty: i.qty, total: i.total_cents / 100 })),
      createdAt: found.order.created_at,
    })
  } catch (err) {
    next(err)
  }
})

router.post("/:id/cancel", async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (!id) return res.status(400).json({ error: "invalid_order_id" })
    const found = await loadOrder(id)
    if (!found) return res.status(404).json({ error: "order_not_found" })
    if (found.order.status === "shipped") return res.status(409).json({ error: "order_already_shipped" })
    if (found.order.status === "cancelled") return res.status(409).json({ error: "order_already_cancelled" })

    await pool.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [id])
    for (const item of found.items) {
      await pool.query("UPDATE products SET stock = stock + $1 WHERE sku = $2", [item.qty, item.sku])
    }
    res.json({ id, status: "cancelled", refund: found.order.total_cents / 100 })
  } catch (err) {
    next(err)
  }
})

module.exports = router
