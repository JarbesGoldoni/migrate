const express = require("express")
const { pool } = require("../db")
const { remember } = require("../cache")

const router = express.Router()

function toProduct(row) {
  return {
    sku: row.sku,
    name: row.name,
    category: row.category,
    price: row.price_cents / 100,
    inStock: row.stock > 0,
    stock: row.stock,
  }
}

router.get("/", async (req, res, next) => {
  try {
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return res.status(400).json({ error: "invalid_limit" })
    const category = req.query.category ? String(req.query.category).toLowerCase() : null

    const items = await remember(`products:${category || "all"}:${limit}`, 60, async () => {
      const { rows } = category
        ? await pool.query(
            "SELECT * FROM products WHERE active AND category = $1 ORDER BY sku LIMIT $2",
            [category, limit],
          )
        : await pool.query("SELECT * FROM products WHERE active ORDER BY sku LIMIT $1", [limit])
      return rows.map(toProduct)
    })

    res.json({ items, count: items.length })
  } catch (err) {
    next(err)
  }
})

router.get("/:sku", async (req, res, next) => {
  try {
    const sku = req.params.sku.toUpperCase()
    if (!/^[A-Z]{3}-\d{3}$/.test(sku)) return res.status(400).json({ error: "invalid_sku" })
    const { rows } = await pool.query("SELECT * FROM products WHERE sku = $1", [sku])
    const row = rows[0]
    if (!row || !row.active) return res.status(404).json({ error: "product_not_found" })
    res.json(toProduct(row))
  } catch (err) {
    next(err)
  }
})

module.exports = router
