-- Rename AttendanceWageCalculation to AttendancePeriodSummary
ALTER TABLE "AttendanceWageCalculation" RENAME TO "AttendancePeriodSummary";

-- Merge HOURLY+MONTHLY pairs: copy day fields from MONTHLY to HOURLY records
UPDATE "AttendancePeriodSummary" AS target
SET
    "workingDays" = src."workingDays",
    "absentDays" = src."absentDays",
    "paidLeaveDays" = src."paidLeaveDays",
    "actualDays" = src."actualDays"
FROM "AttendancePeriodSummary" AS src
WHERE target."method" = 'HOURLY'
  AND src."method" = 'MONTHLY'
  AND target."attendanceImportId" = src."attendanceImportId"
  AND target."employeeId" = src."employeeId";

-- Delete redundant MONTHLY records
DELETE FROM "AttendancePeriodSummary" WHERE "method" = 'MONTHLY';

-- Drop removed columns
ALTER TABLE "AttendancePeriodSummary" DROP COLUMN "method";
ALTER TABLE "AttendancePeriodSummary" DROP COLUMN "basicSalary";
ALTER TABLE "AttendancePeriodSummary" DROP COLUMN "hourlyRate";
ALTER TABLE "AttendancePeriodSummary" DROP COLUMN "ratio";
ALTER TABLE "AttendancePeriodSummary" DROP COLUMN "payableAmount";

-- Make totalHours NOT NULL
UPDATE "AttendancePeriodSummary" SET "totalHours" = 0 WHERE "totalHours" IS NULL;
ALTER TABLE "AttendancePeriodSummary" ALTER COLUMN "totalHours" SET NOT NULL;

-- Change actualDays from integer to numeric(7,2) to match new Prisma Decimal? type
ALTER TABLE "AttendancePeriodSummary" ALTER COLUMN "actualDays" TYPE numeric(7,2) USING "actualDays"::numeric;

-- Replace old unique constraint with new one (remove method from constraint)
ALTER TABLE "AttendancePeriodSummary" DROP CONSTRAINT IF EXISTS "AttendanceWageCalculation_attendanceImportId_employeeId_method_key";
ALTER TABLE "AttendancePeriodSummary" DROP CONSTRAINT IF EXISTS "AttendanceWageCalculation_attendanceImportId_employeeId_method_";
ALTER TABLE "AttendancePeriodSummary" ADD CONSTRAINT "AttendancePeriodSummary_attendanceImportId_employeeId_key" UNIQUE ("attendanceImportId", "employeeId");
