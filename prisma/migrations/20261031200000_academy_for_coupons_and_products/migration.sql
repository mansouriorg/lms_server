-- Coupons and digital products can belong to an academy (Center).
-- Additive only: two new optional columns and their foreign keys.
-- Existing rows keep "centerId" = NULL, which means platform-wide
-- (managed by super admins only). No row is changed or deleted.

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN "centerId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "centerId" TEXT;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;
