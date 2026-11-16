-- tools/cleanup-test-account.sql
-- Safely cleans up a test customer account created during post-deployment smoke testing.
--
-- USAGE:
--   psql -U aqualicious_app -d aqualicious_pg -v test_email="'your_test_email@example.com'" -f tools/cleanup-test-account.sql
--
-- Safety guards:
--   1. Runs inside a BEGIN ... ROLLBACK transaction by default for safe dry-run inspection.
--   2. SELECTs all related records (user, orders, stock movements, consents, email logs, audit entries).
--   3. Checks that the user exists.
--   4. Blocks deletion if role is 'ADMIN' or 'ADMINISTRATOR'.
--   5. Blocks deletion if any sales_orders exist for the user (as customer, creator, verifier, or canceller).
--   6. Blocks deletion if any stock_movements exist for the user.
--   7. Explicitly NEVER deletes audit_logs (preserves tamper-evident audit history).
--   8. Deletes related user_consents and email_logs, then deletes the user.
--   9. Ends in ROLLBACK. To permanently commit, change ROLLBACK to COMMIT at the bottom of the script.

\if :{?test_email}
\else
  \echo 'ERROR: test_email variable is not provided.'
  \echo 'Run with: psql -U aqualicious_app -d aqualicious_pg -v test_email="''your_test_email@example.com''" -f tools/cleanup-test-account.sql'
  \q
\endif

BEGIN;

SET LOCAL custom.test_email = :test_email;

-- 1. Inspect the target user record
SELECT id, "firebaseUid", name, username, email, role, active, "createdAt"
FROM users
WHERE email = current_setting('custom.test_email');

-- 2. Inspect related records across all relevant tables
SELECT 'sales_orders (as customer/creator)' AS entity, count(*) AS count
FROM sales_orders
WHERE "userId" = (SELECT id FROM users WHERE email = current_setting('custom.test_email'))
UNION ALL
SELECT 'sales_orders (as verifier)', count(*)
FROM sales_orders
WHERE verified_by_id = (SELECT id FROM users WHERE email = current_setting('custom.test_email'))
UNION ALL
SELECT 'sales_orders (as canceller)', count(*)
FROM sales_orders
WHERE cancelled_by_id = (SELECT id FROM users WHERE email = current_setting('custom.test_email'))
UNION ALL
SELECT 'stock_movements', count(*)
FROM stock_movements
WHERE "userId" = (SELECT id FROM users WHERE email = current_setting('custom.test_email'))
UNION ALL
SELECT 'user_consents', count(*)
FROM user_consents
WHERE "userId" = (SELECT id FROM users WHERE email = current_setting('custom.test_email'))
UNION ALL
SELECT 'email_logs (by userId)', count(*)
FROM email_logs
WHERE "userId" = (SELECT id FROM users WHERE email = current_setting('custom.test_email'))
UNION ALL
SELECT 'email_logs (by toEmail)', count(*)
FROM email_logs
WHERE "toEmail" = current_setting('custom.test_email')
UNION ALL
SELECT 'audit_logs (tamper-evident audit trail - NEVER DELETED)', count(*)
FROM audit_logs
WHERE "userId" = (SELECT id FROM users WHERE email = current_setting('custom.test_email'));

-- 3. Safety checks and execution block
DO $cleanup$
DECLARE
  v_email text := current_setting('custom.test_email');
  v_user_id int;
  v_role text;
  v_order_count int;
  v_stock_count int;
  v_consent_deleted int;
  v_email_logs_deleted int;
  v_users_deleted int;
BEGIN
  -- Check user exists
  SELECT id, role::text INTO v_user_id, v_role
  FROM users
  WHERE email = v_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'SAFETY CHECK FAILED: No user found with email %', v_email;
  END IF;

  -- Block deletion of administrators
  IF v_role IN ('ADMIN', 'ADMINISTRATOR') THEN
    RAISE EXCEPTION 'SAFETY CHECK FAILED: Cannot delete administrator account (id %, role %)', v_user_id, v_role;
  END IF;

  -- Block deletion if user has any sales_orders (as buyer, verifier, or canceller)
  SELECT count(*) INTO v_order_count
  FROM sales_orders
  WHERE "userId" = v_user_id OR verified_by_id = v_user_id OR cancelled_by_id = v_user_id;

  IF v_order_count > 0 THEN
    RAISE EXCEPTION 'SAFETY CHECK FAILED: User % has % associated sales order(s). Deletion is strictly blocked to protect financial ledger.', v_email, v_order_count;
  END IF;

  -- Block deletion if user has any stock movements
  SELECT count(*) INTO v_stock_count
  FROM stock_movements
  WHERE "userId" = v_user_id;

  IF v_stock_count > 0 THEN
    RAISE EXCEPTION 'SAFETY CHECK FAILED: User % has % associated stock movement(s). Deletion is strictly blocked to protect inventory ledger.', v_email, v_stock_count;
  END IF;

  -- Delete user_consents
  DELETE FROM user_consents WHERE "userId" = v_user_id;
  GET DIAGNOSTICS v_consent_deleted = ROW_COUNT;

  -- Delete email_logs for this user/email
  DELETE FROM email_logs WHERE "userId" = v_user_id OR "toEmail" = v_email;
  GET DIAGNOSTICS v_email_logs_deleted = ROW_COUNT;

  -- NOTE: audit_logs are NEVER deleted.
  -- audit_logs."userId" is nullable, preserving complete historical and tamper-evident audit logs.

  -- Delete user record
  DELETE FROM users WHERE id = v_user_id;
  GET DIAGNOSTICS v_users_deleted = ROW_COUNT;

  RAISE NOTICE 'SUCCESS: Prepared deletion for user id % (email %). Consents deleted: %, Email logs deleted: %, Users deleted: %',
    v_user_id, v_email, v_consent_deleted, v_email_logs_deleted, v_users_deleted;
  RAISE NOTICE 'AUDIT INTEGRITY: audit_logs were NOT deleted.';
END $cleanup$;

-- Safety verification: user should no longer be visible in this transaction
SELECT count(*) AS remaining_user_count
FROM users
WHERE email = current_setting('custom.test_email');

-- TRANSACTION SAFEGUARD:
-- Default is ROLLBACK so this script can be executed safely as a dry run.
-- To permanently delete the test account, change ROLLBACK to COMMIT below.
ROLLBACK;
