# AquaLicious (v2.0)

A high-concurrency, modern enterprise stack for AquaLicious Water Refilling Station & POS, connecting a responsive React management website, a Node.js 22/Express/PostgreSQL backend with Prisma ORM, and a native Capacitor Android application.

---

## Deliverables

Pre-built, cryptographically verified packages are available in `deliverables/`:
- **`deliverables/AquaLicious-release.apk`**: Production Android APK signed with station key.
- **`deliverables/AquaLicious-debug.apk`**: Debug Android APK for LAN / emulator testing.
- **`deliverables/AquaLicious-Web-API.zip`**: Complete production web client and API bundle.
- **`deliverables/AquaLicious-Source.zip`**: Clean source archive excluding local node_modules/build caches.
- **`deliverables/SHA256SUMS.json`**: Authoritative SHA-256 checksums for all packages.

---

## Technology Stack

| Layer | Architecture |
| :--- | :--- |
| **Frontend Web** | React 18, TypeScript, Tailwind CSS, DaisyUI, TanStack Query, Firebase Web SDK, `date-fns` |
| **Mobile Client** | Capacitor 7 (Android), React Native responsive bundle, Multi-Server Resolver |
| **Backend API** | Node.js 22, Express, TypeScript, Prisma ORM, Helmet, Rate Limiter, Zod |
| **Database** | PostgreSQL 18 with ACID transactions and pessimistic row locking (`SELECT ... FOR UPDATE`) |
| **Identity & Security**| Firebase Admin SDK + JWT Bearer verification, zero password hashes in PostgreSQL |
| **Networking** | Multi-Server Resolver with automatic health checks and cluster ID verification (`aqualicious-cluster-primary`) |
| **Process Execution** | PM2 for production; `tsx` for development |

---

## Quick Start (Development)

### 1. Database & Backend
```bash
# In backend/
npm install
npx prisma db push
npx tsx src/seed.ts admin "Station Owner"
npm run dev
```

### 2. Frontend
```bash
# In frontend/
npm install
npm run dev
```

### 3. Mobile Build & Testing
```powershell
# Sync React build to Capacitor and build APKs:
node tools/sync-mobile.mjs
powershell -File tools/build-android.ps1
powershell -File tools/build-local-release.ps1

# Run the complete test suite:
node tools/test-migrated-system.mjs
powershell -File tools/run-ui-tests.ps1
```

---

## Documentation

- [System Architecture & Business Invariants](docs/ARCHITECTURE.md)
- [REST API Contract & Schemas](docs/API.md)
- [Deployment, PM2 & Docker Guide](docs/DEPLOYMENT.md)
- [Verification & Test Checklist](docs/VERIFICATION.md)
