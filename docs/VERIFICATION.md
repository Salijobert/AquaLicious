# Verification checklist

Automated tests modify a disposable database. Never point them at a live station.

## Executed checks

- PHP syntax checks for all application PHP files and JavaScript syntax checks.
- Six analytics checks: zero history, increasing/decreasing trends, inclusive ±5% boundaries, zero days in SMA.
- 36 API integration checks: roles, registration, cost privacy, opening stock, multi-line checkout, idempotent retries, stale-price rejection, cost snapshots, void approval/reversal, order reservation/completion/cancellation, two-process final-unit race, rollback, zero-day reporting and CORS.
- Six direct database invariants: inventory/audit UPDATE and DELETE rejected, balances reconcile, bcrypt cost 12.
- 15 QR/security checks: ownership, receipt MIME validation, reference uniqueness, review, fulfillment gating, refund state and JWT tampering.
- Browser automation using installed Chrome: desktop login/navigation, POS change and receipt, ROP calculation, mobile catalog/cart/login/registration/order. No JavaScript page errors. Screenshots inspected in `runtime/screenshots`.
- Android `assembleDebug` and signed `assembleRelease` completed successfully with Java 21, Gradle 8.14.3 and Android API 36. Release signature verified with Android apksigner (APK Signature Scheme v2, RSA 3072). Certificate SHA-256: `990771cc53f8ff60f85129c0f7cb4db18ad16c4f145e620f57cf84d58f0dc4bb`.
- Composer production dependency audit and npm production dependency audit returned no known advisories after upgrading Firebase JWT to 7.2.1. Docker Compose syntax validated; containers were not run.

The API tests used isolated MariaDB 10.4 on port 3307, with two PHP processes on ports 8088/8089 for the checkout race. They do not certify every behavior on a production MySQL deployment; rerun against the target MySQL version before launch.

## Reproduce locally

`tools/start-test-environment.ps1` imports the schema into a fresh isolated local database, provisions temporary accounts and runs analytics/API checks. It expects the XAMPP MariaDB binaries and an initialized disposable server at port 3307. Start it only against a new database. `tools/run-ui-tests.ps1` requires `npm ci --prefix tools`, the previous API processes, installed Chrome and the generated `mobile/www` assets. `tools/run-payment-tests.ps1` starts a separate PHP process with a fake HTTPS merchant QR URL; it tests evidence review only, without sending money. Credentials are generated per run and never printed.

## Device acceptance

- [x] Verify APK signature using `apksigner verify --verbose`.
- [ ] Install on a physical Android phone and confirm splash, rotation and soft keyboard behavior.
- [ ] Confirm release blocks cleartext HTTP and accepts the station's trusted HTTPS certificate.
- [ ] Confirm server settings, login, role views and token expiry.
- [ ] Run the web/Android synchronization smoke test from DEPLOYMENT.md.
- [ ] Upload a real test receipt image from the Android picker; reject and resubmit it.
- [ ] Verify external merchant QR image rendering and reference entry.
- [ ] Print a receipt on the intended printer. Mobile uses the native Android print service through ReceiptPrinterPlugin; printer compatibility must be tested on the device.
- [ ] Verify background/resume refresh and offline error handling.
- [ ] Confirm physical barcode reader behavior if used (keyboard-wedge SKU search; no camera barcode decoder is included).
- [ ] Verify database backups and restore, TLS, service startup, monitoring and signing-key backups.

Operational lists currently show recent 500 receipts/ledger entries and 200 orders; reports aggregate full selected periods. There is no offline queue, automated wallet settlement, refund transfer, tax-invoice certification, supplier purchasing, or bill of materials for shared container/refill ingredients.
