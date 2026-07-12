-- CreateEnum
CREATE TYPE "CalculationBasis" AS ENUM ('BASIC', 'GROSS');

-- AlterTable
ALTER TABLE "DeductionItem" ADD COLUMN "calculationBasis" "CalculationBasis";
