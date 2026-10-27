-- ==============================================================================
-- AQUALICIOUS PRODUCTION DATABASE READ-ONLY AUDIT SCRIPT
-- ==============================================================================
-- INSTRUCTIONS FOR OPERATOR:
-- Run this script using psql or your preferred PostgreSQL client against the
-- production database:
--   psql "postgresql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DATABASE>" -f tools/production-data-audit.sql
--
-- This script contains 100% READ-ONLY queries (SELECT only).
-- It will NOT modify, lock, or delete any data.
-- ==============================================================================

\echo '=============================================================================='
\echo '1. AUDIT: USERS WITH ROLE "STAFF"'
\echo '=============================================================================='
-- Reports all Staff accounts, their activity dates, and order/ledger counts.
-- Any account listed here must be resolved before applying migration 20261027200000.
SELECT 
    u.id,
    u.username,
    u.email,
    u.name,
    u.active,
    u."createdAt",
    u."updatedAt" AS "lastUpdatedAt",
    COALESCE(sales_count.count, 0)::int AS sales_orders_handled,
    COALESCE(ledger_count.count, 0)::int AS stock_movements_logged
FROM users u
LEFT JOIN (
    SELECT "userId", COUNT(*) AS count
    FROM sales_orders
    GROUP BY "userId"
) sales_count ON sales_count."userId" = u.id
LEFT JOIN (
    SELECT "userId", COUNT(*) AS count
    FROM stock_movements
    GROUP BY "userId"
) ledger_count ON ledger_count."userId" = u.id
WHERE u.role::text = 'STAFF'
ORDER BY u.id ASC;

SELECT COUNT(*) AS total_staff_accounts FROM users WHERE role::text = 'STAFF';


\echo '=============================================================================='
\echo '2. AUDIT: DUPLICATE PRODUCTS (CASE-INSENSITIVE & TRIMMED NAME + VOLUME)'
\echo '=============================================================================='
-- Reports products sharing the exact same normalized (trimmed, lowercase) name and volumeLabel.
-- Must return 0 rows before applying migration 20261027200001.
SELECT 
    lower(trim("name")) AS normalized_name,
    lower(trim("volumeLabel")) AS normalized_volume,
    COUNT(*) AS duplicate_count,
    array_agg(id ORDER BY id) AS product_ids,
    array_agg(sku ORDER BY id) AS product_skus,
    array_agg("sellingPrice" ORDER BY id) AS selling_prices
FROM products
GROUP BY lower(trim("name")), lower(trim("volumeLabel"))
HAVING COUNT(*) > 1;


\echo '=============================================================================='
\echo '3. AUDIT: STOCK-VS-LEDGER MISMATCHES (STOCK DRIFT)'
\echo '=============================================================================='
-- Compares cached product stock (products.stock) against the sum of stock_movements ledger.
-- Difference must be 0 for perfect ledger integrity.
SELECT 
    p.id,
    p.sku,
    p.name,
    p."volumeLabel",
    p.stock AS cached_stock,
    COALESCE(ledger.sum_change, 0)::int AS ledger_sum,
    (p.stock - COALESCE(ledger.sum_change, 0))::int AS drift
FROM products p
LEFT JOIN (
    SELECT "productId", SUM("quantityChange") AS sum_change
    FROM stock_movements
    GROUP BY "productId"
) ledger ON ledger."productId" = p.id
ORDER BY p.id ASC;

-- Summary of drifting products:
SELECT COUNT(*) AS products_with_drift
FROM products p
LEFT JOIN (
    SELECT "productId", SUM("quantityChange") AS sum_change
    FROM stock_movements
    GROUP BY "productId"
) ledger ON ledger."productId" = p.id
WHERE p.stock != COALESCE(ledger.sum_change, 0);


\echo '=============================================================================='
\echo '4. AUDIT: ORPHANED ROWS'
\echo '=============================================================================='
-- Checks for orphan records across stock_movements, sales_orders, and sales_order_items.

-- 4a. Stock movements referencing non-existent products
SELECT sm.id, sm."productId", sm."quantityChange", sm."createdAt"
FROM stock_movements sm
LEFT JOIN products p ON p.id = sm."productId"
WHERE p.id IS NULL;

-- 4b. Stock movements referencing non-existent users
SELECT sm.id, sm."userId", sm."createdAt"
FROM stock_movements sm
LEFT JOIN users u ON u.id = sm."userId"
WHERE u.id IS NULL;

-- 4c. Sales order items referencing non-existent products
SELECT soi.id, soi."salesOrderId", soi."productId", soi.quantity
FROM sales_order_items soi
LEFT JOIN products p ON p.id = soi."productId"
WHERE p.id IS NULL;

-- 4d. Sales order items referencing non-existent sales orders
SELECT soi.id, soi."salesOrderId", soi."productId"
FROM sales_order_items soi
LEFT JOIN sales_orders so ON so.id = soi."salesOrderId"
WHERE so.id IS NULL;

-- 4e. Sales orders referencing non-existent users
SELECT so.id, so."orderNumber", so."userId", so."createdAt"
FROM sales_orders so
LEFT JOIN users u ON u.id = so."userId"
WHERE u.id IS NULL;


\echo '=============================================================================='
\echo '5. AUDIT: ZERO-STOCK PRODUCTS'
\echo '=============================================================================='
-- Lists all products where stock is 0 or less (must be rendered as "Out of stock")
SELECT id, sku, name, "volumeLabel", "sellingPrice", stock, active
FROM products
WHERE stock <= 0
ORDER BY id ASC;
