-- Migration: 20261027200000_remove_staff_role
-- Step 1: Pre-check constraint to prevent unintentional data loss or privilege escalation
DO $$
DECLARE
    staff_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO staff_count FROM "users" WHERE "role"::text = 'STAFF';
    IF staff_count > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % user(s) with role ''STAFF''. You must resolve all Staff accounts before running this migration. Run the staff audit query to inspect and promote, demote, or delete them.', staff_count;
    END IF;
END $$;

-- Step 2: Create replacement enum type without STAFF
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'CUSTOMER');

-- Step 3: Switch users.role to new enum
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';

-- Step 4: Clean up old enum type
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";
