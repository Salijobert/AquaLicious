-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'E_WALLET';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

-- AlterTable
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "customer_name" TEXT;
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "legacy_payment_method" TEXT;
