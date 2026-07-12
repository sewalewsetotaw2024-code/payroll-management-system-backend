-- Add alternateRoleId to ApprovalStep
ALTER TABLE "ApprovalStep" ADD COLUMN "alternateRoleId" INTEGER;

-- Add foreign key for alternateRoleId
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_alternateRoleId_fkey" FOREIGN KEY ("alternateRoleId") REFERENCES "AppRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create PayrollNotificationType enum
CREATE TYPE "PayrollNotificationType" AS ENUM ('PAYROLL_SUBMITTED', 'PAYROLL_APPROVED', 'PAYROLL_REJECTED');

-- Create PayrollNotification table
CREATE TABLE "PayrollNotification" (
    "id" TEXT NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "type" "PayrollNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "payrollRunId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollNotification_pkey" PRIMARY KEY ("id")
);

-- Create index
CREATE INDEX "PayrollNotification_recipientId_read_idx" ON "PayrollNotification"("recipientId", "read");
