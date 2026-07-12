/*
  Add isExempt + exemptPercent to AllowanceConfig
  Change earningType from EarningType enum to VARCHAR(100) for custom earning type support
  Schema drift: ApprovalStageType enum narrowed, Notification table removed
*/

-- 1. Add new columns to AllowanceConfig
ALTER TABLE "AllowanceConfig" ADD COLUMN IF NOT EXISTS "isExempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AllowanceConfig" ADD COLUMN IF NOT EXISTS "exemptPercent" DECIMAL(5,4);

-- 2. Change earningType from EarningType enum to VARCHAR(100), preserving existing data
-- The unique constraint is actually a UNIQUE INDEX (not a constraint), so DROP INDEX
DROP INDEX IF EXISTS "AllowanceConfig_companyId_earningType_key";
ALTER TABLE "AllowanceConfig" ALTER COLUMN "earningType" TYPE VARCHAR(100) USING "earningType"::text;
CREATE UNIQUE INDEX "AllowanceConfig_companyId_earningType_key" ON "AllowanceConfig"("companyId", "earningType");

-- 3. Handle ApprovalRequest rows with ATTENDANCE before changing the enum
-- Use ::text cast to avoid enum validation errors when ATTENDANCE is not a valid enum value at replay time
DELETE FROM "ApprovalAction" WHERE "approvalRequestId" IN (SELECT id FROM "ApprovalRequest" WHERE "stageType"::text = 'ATTENDANCE');
DELETE FROM "ApprovalRequest" WHERE "stageType"::text = 'ATTENDANCE';

-- 4. Rebuild ApprovalStageType enum — removing ATTENDANCE, later migrations add it back
ALTER TYPE "ApprovalStageType" RENAME TO "ApprovalStageType_old";
CREATE TYPE "ApprovalStageType" AS ENUM ('PAYROLL_BATCH', 'PAYROLL_DOCUMENT', 'PAYMENT_FILE', 'PAYROLL_APPROVAL');
ALTER TABLE "ApprovalStep" ALTER COLUMN "stageType" TYPE "ApprovalStageType" USING ("stageType"::text::"ApprovalStageType");
ALTER TABLE "ApprovalRequest" ALTER COLUMN "stageType" TYPE "ApprovalStageType" USING ("stageType"::text::"ApprovalStageType");
DROP TYPE "ApprovalStageType_old";

-- 5. Drop Notification table and its enum
DROP TABLE IF EXISTS "Notification" CASCADE;
DROP TYPE IF EXISTS "NotificationType";
