# API contract

Base: `https://your-domain/backend/api`. Endpoints retain `.php` so Apache does not need URL rewriting. JSON requests and responses; errors return `{ "error": "message" }`. Supply `Authorization: Bearer <token>`. Status codes: 401 authentication, 403 role/ownership, 404 missing resource, 409 conflict/stock/idempotency, 422 invalid input, 429 throttled.

| Endpoint | Method | Permission and payload |
|---|---|---|
| auth.php | POST | `{action:login,username,password}` or `{action:register,name,username,password}`. Registration always creates Customer. Returns token/user/expires_in. |
| auth.php | GET / PATCH | Current user / edit `{name,address,phone}`. |
| products.php | GET | Public active catalog; cost data and archived products only for Administrator. |
| products.php | POST / PATCH | Administrator: sku, name, product_type, volume_label, image_url, production_cost, selling_price, reorder_pt, lead_time_days, safety_stock, active; PATCH also id. Stock changes use inventory only. |
| inventory.php | GET | Staff/Admin: current stock, 7-day usage, effective ROP. `?ledger=1` returns latest 500 immutable movements. |
| inventory.php | POST | Administrator: `{product_id,type:RESTOCK or ADJUSTMENT,quantity,notes}`. RESTOCK adds units; ADJUSTMENT sets the counted balance. |
| sales.php | GET | Staff/Admin latest 500 headers, `?id=123` for receipt lines. |
| sales.php | POST | Staff/Admin: `{items:[{product_id,qty}],cash_tendered,request_key}`. Prices/costs always server-derived. |
| sales.php | PATCH | Staff/Admin plus active Administrator credentials: `{id,admin_username,admin_password,reason}`. Repeated void is harmless. |
| orders.php | GET | Customer sees own orders; employees see latest 200. `?id=123` for detail, `?proof=123` for authorized base64 receipt (Customer owner or Administrator). |
| orders.php | POST | Customer: `{items:[{product_id,qty}],fulfillment:PICKUP or DELIVERY,address,method:CASH or GCASH_QR or MAYA_QR,request_key}`. Reserves stock. |
| orders.php | PATCH | See actions below. |
| reports.php | GET | Staff: daily KPIs. Administrator: revenue, profit, trend, daily series and top products. `?days=30`, range 7–365. |
| users.php | GET / POST / PATCH | Administrator only. POST name/username/password/role/active. PATCH id/name/role/active and optional password. Last active Administrator cannot be removed. |
| config.php | GET | Public merchant QR URLs, timezone and polling interval. |

Order PATCH actions:

- `claim`: own pending QR order, `{id,action,reference_number,proof_base64}`. PNG/JPEG <= 2 MB, stored privately in the database. Status becomes SUBMITTED, not VERIFIED.
- `verify`, `reject`: Administrator, `{id,action,notes}`; compares claim to the actual wallet transaction outside the system. Staff cannot approve payment.
- `status`: `{id,action,status,notes,cash_received}`. Employees advance allowed states. Customers may cancel their own PENDING order. CASH completion requires boolean `cash_received:true`. A QR payment must be VERIFIED before fulfillment.
- `refunded`: Administrator, `{id,action,notes}`, records an external refund after REFUND_REQUIRED. This does not call a wallet API.

Client request keys must be random 16–80-character alphanumeric/hyphen/underscore strings (UUID works). Preserve the same key and identical payload on retry. The key is unique per user; a changed payload returns 409. Product locks are acquired in ascending ID order. Duplicate product lines are aggregated. There is no trust in submitted prices, costs or totals.

Both clients also send `expected_total` on checkout. The server compares it to its own calculation and rejects a stale-price cart with 409; it never uses this value as the charged amount. Remove/re-add items to acknowledge refreshed prices before retrying.

Inventory state changes and ledger inserts commit together. Customers reserve stock at order placement; completion creates one receipt without deducting again. Cancellation and void restore once. Product deletion is implemented as `active:0`, preserving historical snapshots.

Lists are bounded operational views. Reports aggregate the chosen date range over the full sales table. Add cursor pagination before an operational workflow needs to browse beyond those limits.
