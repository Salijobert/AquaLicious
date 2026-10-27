# AquaLicious Architecture & System Design (v2.0)

## Overview & Technology Stack

AquaLicious has transitioned from the legacy PHP 8.2 / MySQL stack to a high-concurrency, modern TypeScript architecture:

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18 + TypeScript | Single Page Application with component modularity |
| **Routing** | React Router DOM v7 | Unified routing supporting modern `/sales` and legacy `.html` route aliases |
| **Styling** | Tailwind CSS v3 + DaisyUI v4 | Responsive mobile-first design with water station theme |
| **State & Fetching** | TanStack Query v5 | Reactive cache, automatic revalidation, mutation state |
| **Authentication** | Firebase Web SDK + Admin SDK | Identity management, Firebase ID JWTs, zero plain/hashed passwords in PostgreSQL |
| **Dates & Calendars** | `date-fns` + `react-datepicker` | Timezone-aware date modeling (`Asia/Manila`) |
| **Networking & Failover** | Custom Multi-Server Resolver | Automatic node health check, cluster ID verification (`aqualicious-cluster-primary`), failover |
| **Mobile Runtime** | Capacitor 7 (Android) | Native Android packaging for web assets, hardware back button, native camera/photo access |
| **Backend Runtime** | Node.js 22 (`node:22-alpine` in Docker) | Asynchronous I/O, strict TypeScript execution |
| **Web Framework** | Express 4 | REST API with dual routing (`/api/*` and legacy `/backend/api/*.php`) |
| **Database** | PostgreSQL 18 | ACID compliance, row-level locking (`SELECT ... FOR UPDATE`), transactional isolation |
| **ORM Client** | Prisma 6 (`@prisma/client`, `@prisma/adapter-pg`)| Type-safe schema migrations, queries, and connection pooling |
| **Security & Validation**| Helmet, express-rate-limit, sanitize-html, Zod | Defense-in-depth against XSS, injection, brute force, and payload tampering |
| **Process Execution** | PM2 for production; `tsx` for development | Zero-downtime cluster clustering and daemon supervision |

---

## Core Business Invariants Preserved

1. **Atomic Checkout & Pessimistic Row Locking**:
   - Every POS checkout and Customer order locks affected product rows in ascending ID order (`SELECT ... FOR UPDATE`) to prevent deadlocks and prevent overselling down to the final unit.
   - Validates client `expected_total` against authoritative server prices before charging.
   - Multi-item checkout transactions are all-or-nothing: if any product has insufficient stock, the entire cart rolls back.

2. **Immutable Stock Ledger (`stock_movements`)**:
   - Direct stock modifications are strictly prohibited. Every change writes an audit record storing `quantity_change`, `previous_stock`, `resulting_stock`, `movement_type` (`OPENING_STOCK`, `RESTOCK`, `ADJUSTMENT`, `SALE`, `SALE_VOID`, `ORDER_RESERVE`, `ORDER_CANCEL`), `user_id`, and `reason`.
   - Running ledger balance reconciles exactly with `products.stock`.

3. **Historical Cost Snapshots**:
   - `sales_order_items` captures `unit_cost_snapshot` at the exact millisecond of checkout.
   - Future supplier price edits or inventory cost changes never alter past profit margins or historical financial reports.

4. **Idempotent Checkout & Replay Protection**:
   - Every checkout and order submission includes a unique `request_key`.
   - SHA-256 payload digests are cached in `idempotency_logs`. Retries with identical payload return the original receipt; retrying a used key with modified payload is rejected with `409 Conflict`.

5. **Void Approvals & Re-authentication**:
   - Only Administrators can void transactions.
   - Voiding requires an explicit reason and re-authentication (Firebase ID token / credential verification).
   - Voiding restores inventory exactly once and excludes the transaction from gross sales.

6. **Order Reservation & QR Payment Review**:
   - Customer orders immediately reserve stock under row locks.
   - For GCash/Maya QR payments, reference claims and uploaded payment proofs are treated as claims, never automated settlement.
   - Administrators review proofs against the station's merchant wallet, approving to advance fulfillment or rejecting to release reserved stock.

7. **Analytics, SMA, & ROP Forecasting**:
   - 7-day Simple Moving Average (SMA) analyzes the last 7 completed calendar days in `Asia/Manila` time, preserving zero-sales days.
   - Linear regression calculates daily least-squares slope and percentage growth (`daily_slope / mean_revenue * 100`).
   - Dynamic Reorder Point: `ROP = ceil(daily_usage * lead_time + safety_stock)`.

---

## Identity & Role-Based Access Control (RBAC)

- Identity is decoupled from the database: user passwords never touch PostgreSQL.
- Roles:
  - `Administrator`: Full access (products, stock adjustments, POS sales, order management, voiding, users, financial analytics).
  - `Customer`: Catalog browsing, cart checkout, tracking own orders (cannot view admin analytics, restock, or view other customers' orders).
- Public registration (`/api/auth/register`) strictly provisions `Customer` role. `Administrator` accounts must be provisioned through trusted administrative channels.
