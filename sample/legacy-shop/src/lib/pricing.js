const TAX_RATES = {
  "US-CA": 0.0725,
  "US-NY": 0.08875,
  "US-TX": 0.0625,
  "BR-SP": 0.18,
}

const FREE_SHIPPING_THRESHOLD = 100
const SHIPPING_FEE = 7.99
const VOLUME_DISCOUNT_QTY = 10
const VOLUME_DISCOUNT_RATE = 0.05

function roundCents(value) {
  return Math.round(value * 100) / 100
}

function priceLine(product, qty) {
  const gross = (product.price_cents / 100) * qty
  const discount = qty >= VOLUME_DISCOUNT_QTY ? gross * VOLUME_DISCOUNT_RATE : 0
  return {
    sku: product.sku,
    name: product.name,
    qty,
    unitPrice: product.price_cents / 100,
    discount: roundCents(discount),
    total: roundCents(gross - discount),
  }
}

function applyCoupon(subtotal, coupon, now) {
  if (!coupon) return { discount: 0, freeShipping: false }
  if (!coupon.active) return { error: "coupon_inactive" }
  if (coupon.expires_at && new Date(coupon.expires_at) < now) return { error: "coupon_expired" }
  if (subtotal < Number(coupon.min_subtotal)) return { error: "coupon_min_subtotal", minSubtotal: Number(coupon.min_subtotal) }
  if (coupon.kind === "percent") return { discount: roundCents((subtotal * Number(coupon.value)) / 100), freeShipping: false }
  if (coupon.kind === "fixed") return { discount: Math.min(Number(coupon.value), subtotal), freeShipping: false }
  return { discount: 0, freeShipping: true }
}

function quote({ products, lines, coupon, region, now = new Date() }) {
  const rate = TAX_RATES[region]
  if (rate === undefined) return { error: "unsupported_region" }

  const items = lines.map((line) => priceLine(products[line.sku], line.qty))
  const subtotal = roundCents(items.reduce((sum, item) => sum + item.total, 0))

  const couponResult = applyCoupon(subtotal, coupon, now)
  if (couponResult.error) return couponResult

  const discounted = roundCents(subtotal - couponResult.discount)
  const shipping = couponResult.freeShipping || discounted >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE
  const tax = roundCents(discounted * rate)
  const total = roundCents(discounted + shipping + tax)

  return {
    items,
    subtotal,
    discount: couponResult.discount,
    coupon: coupon ? coupon.code : null,
    shipping,
    tax,
    taxRate: rate,
    total,
    currency: "USD",
  }
}

module.exports = { quote, roundCents, TAX_RATES }
