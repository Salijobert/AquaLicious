# AquaLicious REST API Specification (v2.0)

The AquaLicious API provides modern REST endpoints (`/api/*`) as well as backward-compatible legacy PHP aliases (`/backend/api/*.php` and `/*.php`) for smooth integration with existing clients and tooling.

---

## Headers & Authentication

- `Content-Type: application/json`
- `Authorization: Bearer <Firebase_ID_Token_or_JWT>`
- `X-AquaLicious-Cluster-Id`: Returns `aqualicious-cluster-primary` on all cluster nodes for failover validation.

Errors return standard JSON:
```json
{
  "error": "Error description"
}
```

HTTP Status Codes:
- `200 OK` / `201 Created`: Request succeeded
- `400 Bad Request` / `422 Unprocessable`: Validation failure (Zod)
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Insufficient role or access to another user's data
- `404 Not Found`: Resource not found
- `409 Conflict`: Stale prices, insufficient stock, duplicate idempotency key with modified payload
- `429 Too Many Requests`: Rate limiter triggered

---

## Endpoint Summary

| Modern Path | Legacy Alias | Method | Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/api/auth` | `/backend/api/auth.php` | GET | Authenticated | Get current user profile and role |
| `/api/auth/login` | `/backend/api/auth.php` | POST | Public | User authentication; returns JWT and user profile |
| `/api/auth/register`| `/backend/api/auth.php` | POST | Public | Customer registration (strictly provisions `Customer`) |
| `/api/products` | `/backend/api/products.php`| GET | Public / All | Active catalog; cost fields visible to Administrator only |
| `/api/products` | `/backend/api/products.php`| POST | Administrator | Create product with initial threshold and safety stock |
| `/api/products/:id` | `/backend/api/products.php`| PATCH | Administrator | Update product details, prices, or soft-delete (`active: 0`) |
| `/api/inventory` | `/backend/api/inventory.php`| GET | Staff, Admin | Real-time stock levels, 7-day usage, ROP; `?ledger=1` for history |
| `/api/inventory` | `/backend/api/inventory.php`| POST | Administrator | Restock (`RESTOCK`) or physical count correction (`ADJUSTMENT`) |
| `/api/sales` | `/backend/api/sales.php` | GET | Staff, Admin | Recent sales receipts; `?id=123` for line items |
| `/api/sales` | `/backend/api/sales.php` | POST | Staff, Admin | POS checkout: atomic pessimistic row locking, change calculation |
| `/api/sales/:id/void` | `/backend/api/sales.php`| PATCH | Administrator | Void sale with admin re-auth; restores stock exactly once |
| `/api/orders` | `/backend/api/orders.php` | GET | Customer/Staff | Customers view own orders; Staff views recent orders |
| `/api/orders` | `/backend/api/orders.php` | POST | Customer | Create order; reserves stock immediately under row locks |
| `/api/orders/:id` | `/backend/api/orders.php` | PATCH | Multiple | Actions: `claim` (QR proof), `verify`, `reject`, `status`, `refunded` |
| `/api/reports` | `/backend/api/reports.php` | GET | Staff, Admin | 7-day SMA, linear regression, gross profit margin |
| `/api/users` | `/backend/api/users.php` | GET / POST / PATCH | Administrator | Provision and manage Staff & Administrator profiles |
| `/api/config` | `/backend/api/config.php` | GET | Public | Station metadata, merchant QR codes, cluster identification |

---

## POS Checkout Payload (`POST /api/sales`)
```json
{
  "items": [
    { "product_id": 1, "qty": 2 },
    { "product_id": 2, "qty": 1 }
  ],
  "cash_tendered": 350.00,
  "expected_total": 310.00,
  "request_key": "7b09c5a1-42e1-4c2f-a9db-938b81cf7123"
}
```

## Customer Order Payload (`POST /api/orders`)
```json
{
  "items": [
    { "product_id": 2, "qty": 1 }
  ],
  "fulfillment": "DELIVERY",
  "address": "123 Water Station Way, Metro Manila",
  "method": "GCASH_QR",
  "expected_total": 250.00,
  "request_key": "123e4567-e89b-12d3-a456-426614174000"
}
```
