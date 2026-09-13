const { pool } = require("../db")
const { quote } = require("./pricing")

const MAX_LINES = 25
const MAX_QTY_PER_LINE = 20

class CheckoutError extends Error {
  constructor(status, body) {
    super(body.error)
    this.status = status
    this.body = body
  }
}

function normalizeLines(items) {
  if (!Array.isArray(items) || items.length === 0) throw new CheckoutError(400, { error: "items_required" })
  if (items.length > MAX_LINES) throw new CheckoutError(400, { error: "too_many_items", max: MAX_LINES })

  const merged = new Map()
  for (const item of items) {
    if (!item || typeof item.sku !== "string") throw new CheckoutError(400, { error: "invalid_sku" })
    if (!Number.isInteger(item.qty) || item.qty < 1) throw new CheckoutError(400, { error: "invalid_quantity", sku: item.sku })
    const sku = item.sku.toUpperCase()
    merged.set(sku, (merged.get(sku) || 0) + item.qty)
  }

  const lines = []
  for (const [sku, qty] of merged) {
    if (qty > MAX_QTY_PER_LINE) throw new CheckoutError(400, { error: "invalid_quantity", sku, max: MAX_QTY_PER_LINE })
    lines.push({ sku, qty })
  }
  return lines
}

async function buildQuote(body) {
  const lines = normalizeLines(body.items)
  const region = body.region || "US-CA"

  const { rows } = await pool.query(
    "SELECT sku, name, price_cents, stock FROM products WHERE sku = ANY($1) AND active",
    [lines.map((l) => l.sku)],
  )
  const products = Object.fromEntries(rows.map((r) => [r.sku, r]))

  for (const line of lines) {
    const product = products[line.sku]
    if (!product) throw new CheckoutError(422, { error: "unknown_sku", sku: line.sku })
    if (line.qty > product.stock) {
      throw new CheckoutError(409, { error: "insufficient_stock", sku: line.sku, available: product.stock })
    }
  }

  let coupon = null
  if (body.coupon) {
    const found = await pool.query("SELECT * FROM coupons WHERE code = $1", [String(body.coupon).trim().toUpperCase()])
    coupon = found.rows[0]
    if (!coupon) throw new CheckoutError(422, { error: "coupon_not_found" })
  }

  const result = quote({ products, lines, coupon, region })
  if (result.error) throw new CheckoutError(422, result)
  return { lines, result }
}

module.exports = { buildQuote, CheckoutError }
