const express = require("express")
const { pool } = require("./db")
const catalog = require("./routes/catalog")
const cart = require("./routes/cart")
const orders = require("./routes/orders")

const app = express()
app.disable("x-powered-by")
app.use(express.json({ limit: "100kb" }))

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1")
    res.json({ status: "ok" })
  } catch (err) {
    res.status(503).json({ status: "degraded" })
  }
})

app.use("/api/products", catalog)
app.use("/api/cart", cart)
app.use("/api/orders", orders)

app.use((req, res) => {
  res.status(404).json({ error: "not_found" })
})

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "invalid_json" })
  console.error(err)
  res.status(500).json({ error: "internal_error" })
})

const port = Number(process.env.PORT || 3000)
app.listen(port, () => console.log(`legacy-shop listening on ${port}`))
