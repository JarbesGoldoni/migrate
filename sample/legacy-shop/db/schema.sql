CREATE TABLE products (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  stock INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE coupons (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed', 'shipping')),
  value NUMERIC(10, 2) NOT NULL DEFAULT 0,
  min_subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_email TEXT NOT NULL,
  status TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  charge_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  order_id INTEGER NOT NULL REFERENCES orders (id),
  sku TEXT NOT NULL REFERENCES products (sku),
  qty INTEGER NOT NULL,
  total_cents INTEGER NOT NULL
);

INSERT INTO products (sku, name, category, price_cents, stock, active) VALUES
  ('KEY-001', 'Mechanical keyboard', 'peripherals', 8999, 12, TRUE),
  ('MOU-002', 'Wireless mouse', 'peripherals', 2499, 40, TRUE),
  ('MON-003', '27 inch monitor', 'displays', 32900, 3, TRUE),
  ('CAB-004', 'USB-C cable', 'accessories', 999, 200, TRUE),
  ('HUB-005', 'USB hub', 'accessories', 2999, 0, TRUE),
  ('DOC-006', 'Legacy dock', 'accessories', 4999, 5, FALSE);

INSERT INTO coupons (code, kind, value, min_subtotal, active, expires_at) VALUES
  ('SAVE10', 'percent', 10, 50, TRUE, '2099-12-31T23:59:59Z'),
  ('FIVEOFF', 'fixed', 5, 20, TRUE, NULL),
  ('FREESHIP', 'shipping', 0, 0, TRUE, NULL),
  ('SUMMER20', 'percent', 20, 0, TRUE, '2020-09-01T00:00:00Z'),
  ('PAUSED', 'percent', 15, 0, FALSE, NULL);

INSERT INTO orders (id, customer_email, status, total_cents, currency, charge_id, created_at) VALUES
  (1, 'ada@example.com', 'shipped', 10725, 'USD', 'ch_test_10725', '2024-03-01T10:00:00Z'),
  (2, 'grace@example.com', 'cancelled', 1071, 'USD', 'ch_test_1071', '2024-03-02T11:30:00Z');

INSERT INTO order_items (order_id, sku, qty, total_cents) VALUES
  (1, 'MOU-002', 4, 9996),
  (2, 'CAB-004', 1, 999);

SELECT setval('orders_id_seq', 2);
