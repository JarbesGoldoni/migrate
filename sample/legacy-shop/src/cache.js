const Redis = require("ioredis")

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: 1 })
redis.on("error", () => {})

// Cache failures must never break a request: fall back to the loader.
async function remember(key, ttlSeconds, load) {
  try {
    const hit = await redis.get(key)
    if (hit) return JSON.parse(hit)
  } catch (err) {}
  const value = await load()
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds)
  } catch (err) {}
  return value
}

module.exports = { redis, remember }
