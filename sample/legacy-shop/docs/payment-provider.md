# Payment provider (PayFlux) contract

`POST {PAYMENT_API_URL}/charges`

Request body:

```json
{ "amount": 12345, "currency": "USD", "source": "tok_visa", "description": "Order for ada@example.com" }
```

`amount` is in cents.

Responses:

| Source token     | Status | Body                                                        |
|------------------|--------|-------------------------------------------------------------|
| `tok_visa`       | 201    | `{ "id": "ch_<random>", "status": "succeeded" }`            |
| `tok_declined`   | 402    | `{ "error": "card_declined", "reason": "insufficient_funds" }` |
| `tok_fraud`      | 402    | `{ "error": "card_declined", "reason": "suspected_fraud" }` |
| anything else    | 400    | `{ "error": "invalid_source" }`                             |

In the sandbox, charge ids are `ch_test_<amount>`.
