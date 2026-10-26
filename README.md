# AquaLicious

A shared PHP/MySQL API, an upgraded web management client, and a Capacitor Android client based on the supplied mobile mockups.

## Start here

Built packages are in `deliverables/`: a signed release APK, a debug APK for LAN testing, a web/API ZIP including installed PHP dependencies, a complete source ZIP, and SHA-256 checksums. Installation and production hosting still require the station's server settings, credentials, merchant QR images and device acceptance checks.

- [Deployment and networking](docs/DEPLOYMENT.md)
- [Architecture and resolved business rules](docs/ARCHITECTURE.md)
- [API contract](docs/API.md)
- [Verification checklist](docs/VERIFICATION.md)
- [Database schema](aqualicious%20website/backend/schema.sql)
- [Android source](mobile/)

The original prototype is preserved in `prototype-backup.zip`. Do not deploy that archive. The active application has no demo accounts or seeded sales. Product seed records start with zero stock; record opening balances through Inventory.

The backend uses PHP 8.2+, PDO MySQL, and the locked Firebase JWT library. The web app retains the supplied `shared.css` palette, sidebar, tables, cards and forms. Shared application logic is in `frontend/js/shared.js`; mobile overrides mirror the supplied navy/cyan mockups. Android uses Capacitor 8.5.3, Java 21 and Android API 36.

Business transactions require a live connection. The clients poll every five seconds; this is near-real-time synchronization, not a WebSocket push service. Wallet claims are manually verified; no wallet integration or automatic settlement is claimed. A configured merchant QR image is required for QR ordering.

All source and configuration are in the workspace. Generated dependencies, local test databases, SDK downloads, signing secrets and build output are excluded from version control.
