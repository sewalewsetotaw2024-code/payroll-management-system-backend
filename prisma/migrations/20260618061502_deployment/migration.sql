/*
  Warnings:

  - You are about to alter the column `percent` on the `EmployeeDeduction` table. The data in that column could be lost. The data in that column will be cast from `Decimal(5,4)` to `Decimal(6,2)`.
  - You are about to drop the `BiometricImportJob` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PayrollNetPay` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[employeeId,payrollPeriodId,leaveType]` on the table `LeaveDeduction` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "PayrollNetPay" DROP CONSTRAINT "PayrollNetPay_payrollRunItemId_fkey";

-- DropIndex
DROP INDEX "LeaveDeduction_employeeId_payrollPeriodId_idx";

-- AlterTable
ALTER TABLE "AttendanceImport" ADD COLUMN     "periodLabel" TEXT,
ADD COLUMN     "totalEmployees" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalRecords" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "DeductionItem" ADD COLUMN     "amount" DECIMAL(15,2),
ADD COLUMN     "calculationType" "DeductionCalculationType",
ADD COLUMN     "percent" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "EmployeeDeduction" ALTER COLUMN "percent" SET DATA TYPE DECIMAL(6,2);

-- DropTable
DROP TABLE "BiometricImportJob";

-- DropTable
DROP TABLE "PayrollNetPay";

-- CreateTable
CREATE TABLE "AttendanceMonthlySummary" (
    "id" TEXT NOT NULL,
    "attendanceImportId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "regularHours" DECIMAL(7,2) NOT NULL,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyOutMinutes" INTEGER NOT NULL DEFAULT 0,
    "absenceHours" DECIMAL(7,2) NOT NULL,
    "normalOtHours" DECIMAL(7,2) NOT NULL,
    "weekendOtHours" DECIMAL(7,2) NOT NULL,
    "holidayOtHours" DECIMAL(7,2) NOT NULL,
    "ot1Hours" DECIMAL(7,2) NOT NULL,
    "ot2Hours" DECIMAL(7,2) NOT NULL,
    "ot3Hours" DECIMAL(7,2) NOT NULL,
    "annualLeaveHours" DECIMAL(7,2) NOT NULL,
    "sickLeaveHours" DECIMAL(7,2) NOT NULL,
    "casualLeaveHours" DECIMAL(7,2) NOT NULL,
    "maternityLeaveHours" DECIMAL(7,2) NOT NULL,
    "compassionateLeaveHours" DECIMAL(7,2) NOT NULL,
    "businessTripHours" DECIMAL(7,2) NOT NULL,
    "compensatoryHours" DECIMAL(7,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceMonthlySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "leaveType" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "totalEntitlement" DECIMAL(5,2) NOT NULL,
    "usedDays" DECIMAL(5,2) NOT NULL,
    "pendingDays" DECIMAL(5,2) NOT NULL,
    "remainingDays" DECIMAL(5,2) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "externalId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveApplication" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "leaveType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "requestedDays" DECIMAL(5,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "externalId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLeaveItem" (
    "id" TEXT NOT NULL,
    "payrollRunItemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "payrollPeriodId" TEXT,
    "leaveType" TEXT NOT NULL,
    "leaveCode" TEXT,
    "leaveDaysInPeriod" DECIMAL(7,2) NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "deductionAmount" DECIMAL(15,2) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollLeaveItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceMonthlySummary_employeeId_idx" ON "AttendanceMonthlySummary"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceMonthlySummary_attendanceImportId_employeeId_key" ON "AttendanceMonthlySummary"("attendanceImportId", "employeeId");

-- CreateIndex
CREATE INDEX "LeaveBalance_employeeId_fiscalYear_idx" ON "LeaveBalance"("employeeId", "fiscalYear");

-- CreateIndex
CREATE INDEX "LeaveBalance_companyId_fiscalYear_idx" ON "LeaveBalance"("companyId", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_employeeId_leaveType_fiscalYear_key" ON "LeaveBalance"("employeeId", "leaveType", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveApplication_externalId_key" ON "LeaveApplication"("externalId");

-- CreateIndex
CREATE INDEX "LeaveApplication_employeeId_idx" ON "LeaveApplication"("employeeId");

-- CreateIndex
CREATE INDEX "LeaveApplication_companyId_status_idx" ON "LeaveApplication"("companyId", "status");

-- CreateIndex
CREATE INDEX "LeaveApplication_employeeId_startDate_endDate_idx" ON "LeaveApplication"("employeeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "PayrollLeaveItem_employeeId_idx" ON "PayrollLeaveItem"("employeeId");

-- CreateIndex
CREATE INDEX "PayrollLeaveItem_payrollRunItemId_idx" ON "PayrollLeaveItem"("payrollRunItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLeaveItem_payrollRunItemId_leaveType_key" ON "PayrollLeaveItem"("payrollRunItemId", "leaveType");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveDeduction_employeeId_payrollPeriodId_leaveType_key" ON "LeaveDeduction"("employeeId", "payrollPeriodId", "leaveType");

-- AddForeignKey
ALTER TABLE "AttendanceMonthlySummary" ADD CONSTRAINT "AttendanceMonthlySummary_attendanceImportId_fkey" FOREIGN KEY ("attendanceImportId") REFERENCES "AttendanceImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMonthlySummary" ADD CONSTRAINT "AttendanceMonthlySummary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApplication" ADD CONSTRAINT "LeaveApplication_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApplication" ADD CONSTRAINT "LeaveApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLeaveItem" ADD CONSTRAINT "PayrollLeaveItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLeaveItem" ADD CONSTRAINT "PayrollLeaveItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLeaveItem" ADD CONSTRAINT "PayrollLeaveItem_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLeaveItem" ADD CONSTRAINT "PayrollLeaveItem_payrollRunItemId_fkey" FOREIGN KEY ("payrollRunItemId") REFERENCES "PayrollRunItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
