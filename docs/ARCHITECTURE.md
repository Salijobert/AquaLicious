# AquaLicious implementation decisions

The supplied request takes precedence over contradictory thesis passages. Airline, classroom and flight-booking artifacts are excluded. Public registration creates Customers only. Administrators are provisioned by CLI; subsequent employee accounts require an Administrator. All clients share one PHP API and MySQL InnoDB database.

Inventory is sellable SKU quantity, including refill capacity in the labeled unit. A 5-Gallon SKU is not a 5L SKU. Container-with-water is a separate SKU; there is no implicit bill-of-materials deduction. Container deposits are recorded as product sales; refundable deposit accounting requires a separate liability module.

Orders reserve stock immediately under row locks. Cancellation returns it once. Completion converts the reserved order into a sale without deducting it twice. QR claims are evidence, never proof of settlement; an Administrator verifies against the merchant wallet. Confirmed orders mean refilling; pickup orders move directly to Completed at handover, delivery orders pass through Out for delivery. Pending reservations remain until staff cancel them (no silent expiry).

Seven-day SMA uses the last seven completed Asia/Manila calendar days, including zeros. Regression uses the same days: percentage slope = daily least-squares slope / mean daily revenue × 100. A zero mean is Stable. ROP = ceil(seven-day average units × lead time days + safety stock); configured reorder_pt is a minimum floor. Critical is stock <= effective ROP; Warning is stock < 1.5 × ROP; otherwise Normal. Gross profit uses sale-time cost snapshots and excludes voided sales. Reports are management reports, not tax invoices.

Bearer JWTs expire after 30 minutes and stay in memory on mobile; web page navigation uses sessionStorage for the JWT only, never passwords. Logout clears it. Active status and role are checked on each API request. Passwords use bcrypt cost 12 and are limited to 12–72 bytes. CORS is an explicit origin allowlist. HTTPS is required in production. Polling every five seconds provides near-real-time sync while connected; no offline sales are accepted.

The schema is for a fresh database. Back up an existing installation and migrate explicitly; do not import it over the prototype schema. The old prototype sales cannot yield historically reliable cost snapshots, so preserve them as a read-only archive rather than inventing historical costs.
