-- When each account accepted the Terms of Service and the Privacy Policy,
-- and which version (the date shown on the pages).
-- Additive only: two new empty columns on "User". No row is changed: the
-- existing accounts keep NULL, which means "not accepted yet".

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;
