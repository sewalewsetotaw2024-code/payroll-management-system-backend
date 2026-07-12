-- CreateEnum
CREATE TYPE "AttendanceNotificationType" AS ENUM ('ATTENDANCE_SUBMITTED', 'ATTENDANCE_APPROVED', 'ATTENDANCE_REJECTED');

-- AlterTable
ALTER TABLE "AttendanceImport" ADD COLUMN "exportData" TEXT;

-- CreateTable
CREATE TABLE "AttendanceNotification" (
    "id" TEXT NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "type" "AttendanceNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "attendanceImportId" TEXT,
    "rejectionNote" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceNotification_recipientId_read_idx" ON "AttendanceNotification"("recipientId", "read");
