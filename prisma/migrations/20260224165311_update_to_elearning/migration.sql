/*
  Warnings:

  - You are about to drop the column `licenseBackUrl` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `licenseFrontUrl` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `stageId` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `stripeSessionId` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `stageId` on the `Lesson` table. All the data in the column will be lost.
  - You are about to drop the column `capacity` on the `Stage` table. All the data in the column will be lost.
  - You are about to drop the column `dateEnd` on the `Stage` table. All the data in the column will be lost.
  - You are about to drop the column `dateStart` on the `Stage` table. All the data in the column will be lost.
  - You are about to drop the column `instructor` on the `Stage` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `Stage` table. All the data in the column will be lost.
  - You are about to drop the column `licenseNumber` on the `User` table. All the data in the column will be lost.
  - Added the required column `date` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endTime` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `instructorId` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startTime` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `moduleId` to the `Lesson` table without a default value. This is not possible if the table is not empty.
  - Added the required column `instructorId` to the `Stage` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('MENTORSHIP', 'WEBINAR');

-- CreateEnum
CREATE TYPE "QuizDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_stageId_fkey";

-- DropForeignKey
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_stageId_fkey";

-- DropIndex
DROP INDEX "Booking_stripeSessionId_key";

-- DropIndex
DROP INDEX "Booking_userId_stageId_key";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "licenseBackUrl",
DROP COLUMN "licenseFrontUrl",
DROP COLUMN "stageId",
DROP COLUMN "stripeSessionId",
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "endTime" TEXT NOT NULL,
ADD COLUMN     "instructorId" TEXT NOT NULL,
ADD COLUMN     "meetingLink" TEXT,
ADD COLUMN     "startTime" TEXT NOT NULL,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "type" "BookingType" NOT NULL DEFAULT 'MENTORSHIP';

-- AlterTable
ALTER TABLE "Lesson" DROP COLUMN "stageId",
ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "moduleId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Stage" DROP COLUMN "capacity",
DROP COLUMN "dateEnd",
DROP COLUMN "dateStart",
DROP COLUMN "instructor",
DROP COLUMN "location",
ADD COLUMN     "category" TEXT,
ADD COLUMN     "instructorId" TEXT NOT NULL,
ADD COLUMN     "level" TEXT,
ADD COLUMN     "thumbnailUrl" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "licenseNumber",
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "headline" TEXT;

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "stageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "difficulty" "QuizDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "options" TEXT[],
    "correctAnswer" INTEGER NOT NULL,
    "explanation" TEXT,
    "moduleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
