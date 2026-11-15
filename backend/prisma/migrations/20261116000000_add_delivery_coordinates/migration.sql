-- AlterTable
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "delivery_lat" DOUBLE PRECISION;
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "delivery_lng" DOUBLE PRECISION;
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "delivery_street" TEXT;
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "delivery_barangay" TEXT;
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "delivery_landmark" TEXT;
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "delivery_contact" TEXT;
