-- AquaLicious: Safe Test Account Deletion Script
-- Usage:
--   psql -h localhost -U postgres -d aqualicious_pg -v test_email='yourname+test2026@gmail.com' -f tools/cleanup-test-account.sql
--
-- This script runs inside a transaction and ends with ROLLBACK by default.
-- Review the output, and change ROLLBACK to COMMIT at the bottom only when satisfied.

\set ON_ERROR_STOP on

-- Ensure a target email was supplied
\if :{?test_email}
  \echo '=== Target Email: ' :test_email ' ==='
\else
  \echo 'ERROR: Variable test_email is not set.'
  \echo 'Example: psql -h localhost -U postgres -d aqualicious_pg -v test_email=yourname+test2026@gmail.com -f tools/cleanup-test-account.sql'
  \quit
\endif

BEGIN;

-- Store target email into local transaction setting
SET LOCAL app.test_email = :'test_email';

-- Step 1: Display target user details
SELECT id, name, username, email, role, "emailVerified", active, "createdAt"
FROM users
WHERE lower(email) = lower(current_setting('app.test_email', true));

-- Step 2: Inspect related records
SELECT
  (SELECT COUNT(*) FROM sales_orders WHERE "userId" = u.id) AS sales_orders_count,
  (SELECT COUNT(*) FROM sales_orders WHERE "verified_by_id" = u.id) AS verified_orders_count,
  (SELECT COUNT(*) FROM sales_orders WHERE "cancelled_by_id" = u.id) AS cancelled_orders_count,
  (SELECT COUNT(*) FROM stock_movements WHERE "userId" = u.id) AS stock_movements_count,
  (SELECT COUNT(*) FROM user_consents WHERE "userId" = u.id) AS user_consents_count,
  (SELECT COUNT(*) FROM email_logs WHERE "userId" = u.id) AS email_logs_count,
  (SELECT COUNT(*) FROM audit_logs WHERE "userId" = u.id) AS audit_logs_count
FROM users u
WHERE lower(u.email) = lower(current_setting('app.test_email', true));

-- Step 3: Safety Guard: Abort if user has any orders or sales/stock movements
DO $$
DECLARE
  v_email TEXT := lower(current_setting('app.test_email', true));
  v_user_id INT;
  v_orders INT;
  v_stock INT;
  v_role TEXT;
BEGIN
  SELECT id, role::text INTO v_user_id, v_role FROM users WHERE lower(email) = v_email;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No user found with email %', v_email;
    RETURN;
  END IF;

  IF v_role = 'ADMIN' THEN
    RAISE EXCEPTION 'SAFETY BLOCK: User % is an ADMINISTRATOR and cannot be deleted by this script.', v_email;
  END IF;

  SELECT COUNT(*) INTO v_orders FROM sales_orders WHERE "userId" = v_user_id;
  SELECT COUNT(*) INTO v_stock FROM stock_movements WHERE "userId" = v_user_id;

  IF v_orders > 0 OR v_stock > 0 THEN
    RAISE EXCEPTION 'SAFETY BLOCK: User #% (%) has % orders and % stock movements. Deletion aborted to preserve financial/audit ledger integrity.',
      v_user_id, v_email, v_orders, v_stock;
  END IF;

  -- Step 4: Safe Deletion of ephemeral test records
  DELETE FROM user_consents WHERE "userId" = v_user_id;
  DELETE FROM email_logs WHERE "userId" = v_user_id;
  DELETE FROM audit_logs WHERE "userId" = v_user_id;
  DELETE FROM users WHERE id = v_user_id;

  RAISE NOTICE 'SUCCESS: Test user #% (%) and related consents/logs removed.', v_user_id, v_email;
END $$;

-- Verify deletion state inside transaction
SELECT id, email, username FROM users WHERE lower(email) = lower(current_setting('app.test_email', true));

-- SAFETY DEFAULT: Dry run with ROLLBACK.
-- Change ROLLBACK to COMMIT when you verify the output and are ready to apply:
ROLLBACK;
