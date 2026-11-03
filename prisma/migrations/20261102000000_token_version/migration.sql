-- A number on each account, raised when its password changes (Settings, or
-- a reset link). Each sign-in token holds the number of its time; a token
-- with an older one is refused, so a password change signs out the other
-- browsers and devices.
-- Additive only: one new column on "User". No row is changed: every existing
-- account gets 0, and the tokens given before this update count as 0.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
