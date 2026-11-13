ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancelled_by_id" INTEGER;
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_cancelled_by_id_fkey'
  ) THEN
    ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_cancelled_by_id_fkey"
      FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "sales_orders_orderStatus_paymentStatus_createdAt_idx"
  ON "sales_orders" ("orderStatus", "paymentStatus", "createdAt");
