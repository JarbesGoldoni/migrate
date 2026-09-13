# Legacy Shop

The shop API that has powered checkout since 2017. Node + Express, PostgreSQL for the catalog and orders, Redis for caching and idempotency, and an external payment provider.

## Run

```
DATABASE_URL=postgres://shop:shop@localhost:5432/shop \
REDIS_URL=redis://localhost:6379 \
PAYMENT_API_URL=http://localhost:9090 \
PORT=3000 npm start
```

The schema and seed data live in `db/schema.sql`. The payment provider contract is described in `docs/payment-provider.md`.
