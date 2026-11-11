-- AlterTable
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "verified_by_id" INTEGER;
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(3);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_verified_by_id_fkey'
  ) THEN
    ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_verified_by_id_fkey"
      FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
