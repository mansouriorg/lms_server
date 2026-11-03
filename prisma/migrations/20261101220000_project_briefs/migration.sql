-- The final project of a course: what the students build and send (a link
-- to their code), written by the academy. NULL: the course has no project.
-- Additive only: one new empty column on "Stage". No row is changed.

-- AlterTable
ALTER TABLE "Stage" ADD COLUMN     "projectBrief" TEXT;
