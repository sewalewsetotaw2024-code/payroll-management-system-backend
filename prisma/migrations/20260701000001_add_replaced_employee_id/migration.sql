-- AlterTable
ALTER TABLE "ActingAssignment" ADD COLUMN "replacedEmployeeId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ActingAssignment_replacedEmployeeId_idx" ON "ActingAssignment"("replacedEmployeeId");

-- AddForeignKey
ALTER TABLE "ActingAssignment" ADD CONSTRAINT "ActingAssignment_replacedEmployeeId_fkey" FOREIGN KEY ("replacedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
