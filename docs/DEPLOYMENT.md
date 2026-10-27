# AquaLicious Deployment Guide (v2.0)

This guide documents deploying the migrated AquaLicious system (React 18, Express, PostgreSQL 18, Prisma, and Capacitor Android).

---

## 1. Prerequisites

- **Node.js**: v22.x or later (LTS recommended)
- **PostgreSQL**: v16+ (tested on PostgreSQL 18)
- **Java JDK**: 21+ (for Android builds)
- **Android SDK**: API 34+ with platform-tools and build-tools
- **PM2**: `npm install -g pm2` (for production server process management)
- **Docker**: (optional) Docker Engine 24+ and Docker Compose v2

---

## 2. Database Setup (PostgreSQL)

1. Create a dedicated database:
   ```sql
   CREATE DATABASE aqualicious_pg;
   CREATE USER aqualicious WITH ENCRYPTED PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE aqualicious_pg TO aqualicious;
   ```

2. Configure `DATABASE_URL` in `backend/.env`:
   ```env
   DATABASE_URL="postgresql://aqualicious:your_secure_password@localhost:5432/aqualicious_pg?schema=public"
   ```

3. Deploy Prisma Schema:
   ```bash
   cd backend
   npx prisma db push
   ```

4. Seed Catalog & Initial Administrator:
   ```bash
   # In backend/
   npx tsx src/seed.ts admin "Station Owner"
   ```

---

## 3. Backend Deployment

### Configuration (`backend/.env`)
```env
PORT=8088
DATABASE_URL="postgresql://aqualicious:your_secure_password@localhost:5432/aqualicious_pg?schema=public"
JWT_SECRET="generate-a-random-32-byte-hex-string"
CLUSTER_ID="aqualicious-cluster-primary"
CORS_ORIGINS="http://localhost:5173,http://localhost:8088,http://localhost:8090,https://localhost,capacitor://localhost"
GCASH_QR_URL="https://your-domain.example/merchant/gcash.png"
MAYA_QR_URL="https://your-domain.example/merchant/maya.png"
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
```

### Production Build & PM2 Process Supervision
```bash
cd backend
npm install
npm run build

# Start cluster with PM2
pm2 start dist/server.js --name "aqualicious-api" -i max
pm2 save
pm2 startup
```

---

## 4. Frontend Web Deployment

1. Install dependencies & build:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
2. The compiled assets (`frontend/dist/`) are served directly by the Express backend as static assets and SPA fallback, or can be deployed behind Nginx.

---

## 5. Android Mobile App Deployment

1. Synchronize React web build to Capacitor:
   ```bash
   node tools/sync-mobile.mjs
   cd mobile
   npx cap sync android
   ```

2. **Build Debug APK**:
   ```powershell
   powershell -File tools/build-android.ps1
   # Output: deliverables/AquaLicious-debug.apk
   ```

3. **Build Signed Release APK**:
   ```powershell
   powershell -File tools/build-local-release.ps1
   # Output: deliverables/AquaLicious-release.apk
   ```

---

## 6. Docker Compose Deployment (Single Command)

To run the full stack in isolated containers:
```bash
docker compose up -d --build
```
`compose.yaml` provisions:
- Node.js 22 runtime running the Express API and React client
- PostgreSQL database with persistent volume
- Health checks and automatic restart policies

---

## 7. Data Migration & Rollback Procedure

### Migrating from Legacy MySQL
If migrating existing data from the PHP/MySQL prototype:
1. Export existing catalog and user data:
   ```bash
   mysqldump -u aqualicious -p aqualicious_db products users > legacy_backup.sql
   ```
2. Clean and import products:
   - Match categories to `Slim`, `Round`, `Purified`, `Mineral`.
   - Ensure opening stock movements are logged: never insert raw stock without a corresponding `OPENING_STOCK` movement record.
3. User Passwords:
   - Do NOT attempt to port bcrypt password hashes to PostgreSQL. Provision customer and administrator identities through Firebase Authentication and link profiles via email/UID.

### Safe Rollback
1. Keep the legacy PHP/MySQL repository directory (`aqualicious website/`) and MySQL database intact.
2. In the event of an unexpected rollback requirement, re-point DNS / reverse proxy upstream back to the PHP/Apache port.
3. Mobile clients continue to work with legacy endpoints due to the Multi-Server Resolver's backward-compatible endpoint negotiation.
