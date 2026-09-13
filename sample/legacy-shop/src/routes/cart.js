const express = require("express")
const { buildQuote, CheckoutError } = require("../lib/checkout")

const router = express.Router()

router.post("/quote", async (req, res, next) => {
  try {
    const { result } = await buildQuote(req.body || {})
    res.json(result)
  } catch (err) {
    if (err instanceof CheckoutError) return res.status(err.status).json(err.body)
    next(err)
  }
})

module.exports = router
