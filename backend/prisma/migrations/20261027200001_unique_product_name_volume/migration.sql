-- Migration: 20261027200001_unique_product_name_volume
-- Step 1: Pre-check constraint for existing duplicate products by normalized name and volume
DO $$
DECLARE
    conflict_count INTEGER;
    conflict_details TEXT;
BEGIN
    SELECT COUNT(*) INTO conflict_count FROM (
        SELECT lower(trim("name")), lower(trim("volumeLabel"))
        FROM "products"
        GROUP BY lower(trim("name")), lower(trim("volumeLabel"))
        HAVING COUNT(*) > 1
    ) conflicts;

    IF conflict_count > 0 THEN
        SELECT string_agg(item_desc, '; ')
        INTO conflict_details
        FROM (
            SELECT lower(trim("name")) || ' (' || lower(trim("volumeLabel")) || ') [count: ' || count(*) || ']' AS item_desc
            FROM "products"
            GROUP BY lower(trim("name")), lower(trim("volumeLabel"))
            HAVING count(*) > 1
        ) sub;

        RAISE EXCEPTION 'MIGRATION ABORTED: Found % conflicting product duplicate(s): %. Resolve duplicate products before applying unique index.', conflict_count, conflict_details;
    END IF;
END $$;

-- Step 2: Create case-insensitive, whitespace-trimmed composite unique index
CREATE UNIQUE INDEX "uq_products_lower_name_volume" ON "products" (lower(trim("name")), lower(trim("volumeLabel")));
