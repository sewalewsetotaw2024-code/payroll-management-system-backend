-- CreateEnum
CREATE TYPE "RoundingRule" AS ENUM ('ROUND_HALF_UP', 'ROUND_HALF_DOWN', 'ROUND_HALF_EVEN', 'TRUNCATE');

-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('MANUAL', 'AUTO_FETCH');

-- CreateEnum
CREATE TYPE "PayrollNotificationType" AS ENUM ('PAYROLL_SUBMITTED', 'PAYROLL_APPROVED', 'PAYROLL_REJECTED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('ETB', 'USD', 'GBP', 'EUR', 'AED');

-- CreateEnum
CREATE TYPE "PayrollCycle" AS ENUM ('MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY');

-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PayDayRule" AS ENUM ('FIXED_DATE', 'OFFSET_FROM_PERIOD_END');

-- CreateEnum
CREATE TYPE "WeekendRollover" AS ENUM ('PAY_FRIDAY_BEFORE', 'PAY_MONDAY_AFTER');

-- CreateEnum
CREATE TYPE "DailyRateBasis" AS ENUM ('ANNUAL_SALARY_DIVIDED_BY_WORKING_DAYS', 'FIXED_DAILY_RATE');

-- CreateEnum
CREATE TYPE "PayslipFormat" AS ENUM ('PDF', 'HTML');

-- CreateEnum
CREATE TYPE "DeliveryTrigger" AS ENUM ('PAYSLIP_GENERATED', 'PAYSLIP_VIEWED', 'PAYSLIP_APPROVED', 'PAYSLIP_REJECTED', 'MONTHLY_DIGEST');

-- CreateEnum
CREATE TYPE "FiscalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PENDING_PAYROLL_APPROVAL', 'PENDING_PAYMENT_APPROVAL', 'APPROVED', 'DONE');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DONE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "PayslipVisibilityStatus" AS ENUM ('DRAFT', 'DONE');

-- CreateEnum
CREATE TYPE "AttendanceNotificationType" AS ENUM ('ATTENDANCE_SUBMITTED', 'ATTENDANCE_APPROVED', 'ATTENDANCE_REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalStageType" AS ENUM ('PAYROLL_BATCH', 'PAYROLL_DOCUMENT', 'PAYMENT_FILE', 'PAYROLL_APPROVAL', 'ATTENDANCE');

-- CreateEnum
CREATE TYPE "TaxationType" AS ENUM ('TAXABLE', 'NON_TAXABLE', 'PARTIALLY_TAXABLE');

-- CreateEnum
CREATE TYPE "BonusCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "BonusCalculationType" AS ENUM ('FIXED', 'PERCENTAGE_BASIC', 'PERCENTAGE_GROSS', 'RULE_BASED');

-- CreateEnum
CREATE TYPE "EligibilityParameter" AS ENUM ('PMS', 'WORK_UNIT', 'JOB_GRADE', 'JOB_ROLE', 'TENURE');

-- CreateEnum
CREATE TYPE "LogicOperator" AS ENUM ('AND', 'OR');

-- CreateEnum
CREATE TYPE "OvertimeCategory" AS ENUM ('WEEKDAY_DAY', 'WEEKDAY_NIGHT', 'WEEKEND', 'PUBLIC_HOLIDAY');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('ZK_BIOMETRIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "PensionBasis" AS ENUM ('BASIC', 'GROSS');

-- CreateEnum
CREATE TYPE "CalculationMethod" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'RULE_FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "ActingAllowanceBasis" AS ENUM ('BASIC_DIFF', 'GROSS_DIFF');

-- CreateEnum
CREATE TYPE "IntegrationSystem" AS ENUM ('EMPLOYEE_MODULE', 'LEAVE_MODULE', 'OKR_MODULE', 'ZK_BIOMETRIC', 'ERCA', 'ORACLE', 'BANK');

-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('MOR_TAX', 'POESSA_PENSION', 'MOL_LABOUR', 'PAYROLL_PREVIEW', 'DEDUCTION_SUMMARY', 'OVERTIME_REPORT', 'BONUS_PAYOUT', 'PAYROLL_DETAIL');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'EXCEL', 'PDF', 'XML');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP', 'BOTH');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DeductionType" AS ENUM ('EMPLOYMENT_INCOME_TAX', 'PENSION_EMPLOYEE', 'COST_SHARING', 'LOAN_REPAYMENT', 'ADVANCE_RECOVERY', 'UNPAID_LEAVE', 'LATENESS', 'COURT_ORDER', 'UNION_DUES', 'SAVINGS_AND_CREDIT', 'HEALTH_INSURANCE', 'LIFE_INSURANCE', 'FINE_PENALTY', 'OVERPAYMENT_RECOVERY', 'CHILD_SUPPORT', 'GARNISHMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeDeductionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalculationBasis" AS ENUM ('BASIC', 'GROSS');

-- CreateEnum
CREATE TYPE "DeductionCalculationType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS', 'REMAINING_BALANCE');

-- CreateEnum
CREATE TYPE "EarningType" AS ENUM ('BASIC_SALARY', 'RESPONSIBILITY_ALLOWANCE', 'HOUSING_ALLOWANCE', 'TELEPHONE_ALLOWANCE', 'MEAL_ALLOWANCE', 'HARDSHIP_ALLOWANCE', 'ACTING_ALLOWANCE', 'RELOCATION_ALLOWANCE', 'PD_ALLOWANCE', 'TRANSPORT_TAXABLE', 'TRANSPORT_NON_TAXABLE', 'OVERTIME', 'BONUS', 'INCENTIVE', 'GIFT', 'PROFIT_SHARING', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentFileStatus" AS ENUM ('GENERATED', 'APPROVED', 'EXPORTED', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ActingAssignmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'GENERATED', 'COMPLETED', 'SUBMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('BONUS', 'PENALTY', 'CORRECTION', 'RETROACTIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReferenceType" AS ENUM ('PAYROLL_RUN', 'ATTENDANCE_IMPORT', 'PAYMENT_FILE', 'EMPLOYEE', 'PAYROLL_PERIOD');

-- CreateEnum
CREATE TYPE "ArchiveType" AS ENUM ('PAYROLL', 'ATTENDANCE', 'TAX', 'PENSION', 'REPORT');

-- CreateEnum
CREATE TYPE "AllowanceType" AS ENUM ('TRANSPORTATION', 'TELEPHONE', 'REPRESENTATION', 'HOUSING', 'MEAL', 'OTHER');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Company" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "baseCurrencyId" TEXT,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "tinNumber" TEXT,
    "jobPosition" TEXT,
    "hireDate" TIMESTAMP(3),
    "termDate" TIMESTAMP(3),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" "Currency" NOT NULL DEFAULT 'ETB',
    "branchId" TEXT,
    "departmentId" INTEGER,
    "workUnitId" TEXT,
    "positionId" TEXT,
    "jobGradeId" TEXT,
    "managerName" TEXT,
    "metadata" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeProfile" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "employmentType" TEXT,
    "probationEndDate" TIMESTAMP(3),
    "employmentEndDate" TIMESTAMP(3),
    "placeOfWork" TEXT,
    "contractReference" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCompensation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "basicSalary" DECIMAL(15,2),
    "grossSalary" DECIMAL(15,2),
    "taxablePay" DECIMAL(15,2),
    "csBalance" DECIMAL(15,2),
    "pensionElig" BOOLEAN NOT NULL DEFAULT true,
    "taxExempt" BOOLEAN NOT NULL DEFAULT false,
    "pensionNo" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCompensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAllowance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "allowanceType" "AllowanceType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUser" (
    "id" INTEGER NOT NULL,
    "email" TEXT,
    "roleId" INTEGER,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppRole" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bank" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkUnit" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "departmentId" INTEGER,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT,
    "jobGradeId" TEXT,
    "basicSalary" DECIMAL(15,2),
    "grossSalary" DECIMAL(15,2),
    "currency" "Currency" NOT NULL DEFAULT 'ETB',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobGrade" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "level" INTEGER NOT NULL,
    "minSalary" DECIMAL(15,2),
    "maxSalary" DECIMAL(15,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobGrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryHistory" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "basicSalary" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxBracket" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "lowerBound" DECIMAL(15,2) NOT NULL,
    "upperBound" DECIMAL(15,2),
    "rate" DECIMAL(5,4) NOT NULL,
    "deductionAmount" DECIMAL(15,2) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PensionRule" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "employeeRate" DECIMAL(5,4) NOT NULL DEFAULT 0.0700,
    "employerRate" DECIMAL(5,4) NOT NULL DEFAULT 0.1100,
    "basis" "PensionBasis" NOT NULL DEFAULT 'BASIC',
    "applyMaxCap" BOOLEAN NOT NULL DEFAULT false,
    "maxCapAmount" DECIMAL(15,2),
    "mandatoryForForeigners" BOOLEAN NOT NULL DEFAULT false,
    "remittanceDeadlineDays" INTEGER NOT NULL DEFAULT 30,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PensionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowanceConfig" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "earningType" VARCHAR(100) NOT NULL,
    "label" TEXT NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "isExempt" BOOLEAN NOT NULL DEFAULT false,
    "exemptPercent" DECIMAL(5,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllowanceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostSharingRule" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "rate" DECIMAL(5,4) NOT NULL DEFAULT 0.1000,
    "basis" "PensionBasis" NOT NULL DEFAULT 'BASIC',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostSharingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvertimeRule" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "category" "OvertimeCategory" NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "calculationBase" "PensionBasis" NOT NULL DEFAULT 'BASIC',
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "weeklyCapHours" DECIMAL(5,2) NOT NULL DEFAULT 12,
    "monthlyCapHours" DECIMAL(5,2),
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OvertimeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusRule" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cycle" "BonusCycle" NOT NULL,
    "calculationType" "BonusCalculationType" NOT NULL,
    "taxationType" "TaxationType" NOT NULL DEFAULT 'TAXABLE',
    "taxWaiverPercent" DECIMAL(5,4),
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BonusRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusEligibilityCriteria" (
    "id" TEXT NOT NULL,
    "bonusRuleId" TEXT NOT NULL,
    "parameter" "EligibilityParameter" NOT NULL,
    "operator" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "logicGroup" "LogicOperator" NOT NULL DEFAULT 'AND',
    "groupOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonusEligibilityCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusMapping" (
    "id" TEXT NOT NULL,
    "bonusRuleId" TEXT NOT NULL,
    "conditionDescription" TEXT,
    "bonusAmount" DECIMAL(15,2),
    "bonusPercent" DECIMAL(5,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonusMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActingAllowanceRule" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "calculationMethod" "CalculationMethod" NOT NULL DEFAULT 'PERCENTAGE',
    "fixedAmount" DECIMAL(15,2),
    "minimumPeriodMonths" INTEGER NOT NULL DEFAULT 1,
    "maximumPeriodMonths" INTEGER NOT NULL DEFAULT 6,
    "basis" "ActingAllowanceBasis" NOT NULL DEFAULT 'BASIC_DIFF',
    "payablePercent" DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
    "tiers" JSONB DEFAULT '[]',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActingAllowanceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryStructure" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarningsItem" (
    "id" TEXT NOT NULL,
    "salaryStructureId" TEXT NOT NULL,
    "earningType" "EarningType" NOT NULL,
    "label" TEXT NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "isConfigurable" BOOLEAN NOT NULL DEFAULT true,
    "defaultAmount" DECIMAL(15,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarningsItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeductionItem" (
    "id" TEXT NOT NULL,
    "salaryStructureId" TEXT NOT NULL,
    "deductionType" "DeductionType" NOT NULL,
    "label" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "isStatutory" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2),
    "calculationType" "DeductionCalculationType",
    "calculationBasis" "CalculationBasis",
    "percent" DECIMAL(6,2),

    CONSTRAINT "DeductionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDeduction" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "deductionItemId" TEXT,
    "deductionType" "DeductionType" NOT NULL,
    "label" TEXT NOT NULL,
    "calculationType" "DeductionCalculationType" NOT NULL,
    "amount" DECIMAL(15,2),
    "percent" DECIMAL(6,2),
    "status" "EmployeeDeductionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "effectivePeriodId" TEXT,
    "description" TEXT,
    "refNo" TEXT,
    "prorated" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeductionPaymentPlan" (
    "id" TEXT NOT NULL,
    "employeeDeductionId" TEXT NOT NULL,
    "totalAmount" DECIMAL(15,2),
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "remaining" DECIMAL(15,2),
    "numInstallments" INTEGER,
    "paidInstallments" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeductionPaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuration" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemCurrency" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "roundingRule" "RoundingRule" NOT NULL DEFAULT 'ROUND_HALF_UP',
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoFetchRate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemCurrency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyRate" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "fromCurrencyId" TEXT NOT NULL,
    "toCurrencyId" TEXT NOT NULL,
    "rate" DECIMAL(15,6) NOT NULL,
    "source" "RateSource" NOT NULL DEFAULT 'MANUAL',
    "overrideReason" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipNotificationSettings" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "smsNotifications" BOOLEAN NOT NULL DEFAULT false,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT false,
    "inAppNotifications" BOOLEAN NOT NULL DEFAULT false,
    "digestFrequency" "DigestFrequency" NOT NULL DEFAULT 'WEEKLY',
    "payslipFormat" "PayslipFormat" NOT NULL DEFAULT 'PDF',
    "emailTemplate" TEXT,
    "deliveryTriggers" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayslipNotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayFrequency" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "frequency" "PayrollCycle" NOT NULL,
    "periodsPerYear" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "payDayRule" "PayDayRule",
    "fixedPayDate" INTEGER,
    "offsetDays" INTEGER,
    "weekendRollover" "WeekendRollover",
    "holidayRollover" "WeekendRollover",
    "applicableEmployeeGroup" TEXT,
    "autoGeneratePeriods" BOOLEAN NOT NULL DEFAULT true,
    "dailyRateBasis" "DailyRateBasis",
    "workingDaysPerYear" INTEGER,
    "minimumPayableDays" INTEGER,
    "overtimeEligible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayFrequency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "FiscalStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "fiscalYearId" TEXT,
    "name" TEXT,
    "cycle" "PayrollCycle" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "dateOfPayment" TIMESTAMP(3),
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "payrollBatchId" TEXT,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "totalGross" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalTax" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalPension" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalBonus" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalOvertime" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalCostToCompany" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "monthlyWorkdays" INTEGER NOT NULL DEFAULT 30,
    "processedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRunItem" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDays" DECIMAL(5,2) NOT NULL,
    "basicSalary" DECIMAL(15,2) NOT NULL,
    "proratedSalary" DECIMAL(15,2) NOT NULL,
    "grossTaxableIncome" DECIMAL(15,2) NOT NULL,
    "grossSalary" DECIMAL(15,2) NOT NULL,
    "costToCompany" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(15,2) NOT NULL,
    "netSalary" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'ETB',
    "isMidMonthHire" BOOLEAN NOT NULL DEFAULT false,
    "deductionCapBreached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEarning" (
    "id" TEXT NOT NULL,
    "payrollRunItemId" TEXT NOT NULL,
    "earningType" "EarningType" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollDeduction" (
    "id" TEXT NOT NULL,
    "payrollRunItemId" TEXT NOT NULL,
    "deductionType" "DeductionType" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "isOverridden" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "overriddenBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollTax" (
    "id" TEXT NOT NULL,
    "payrollRunItemId" TEXT NOT NULL,
    "taxBracketId" TEXT,
    "appliedRate" DECIMAL(5,4) NOT NULL,
    "appliedDeduction" DECIMAL(15,2) NOT NULL,
    "taxAmount" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPension" (
    "id" TEXT NOT NULL,
    "payrollRunItemId" TEXT NOT NULL,
    "basis" "PensionBasis" NOT NULL,
    "baseSalary" DECIMAL(15,2) NOT NULL,
    "employeeContribution" DECIMAL(15,2) NOT NULL,
    "employerContribution" DECIMAL(15,2) NOT NULL,
    "remittanceStatus" BOOLEAN NOT NULL DEFAULT false,
    "remittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollOvertime" (
    "id" TEXT NOT NULL,
    "payrollRunItemId" TEXT NOT NULL,
    "category" "OvertimeCategory" NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "hourlyRate" DECIMAL(15,2) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollOvertime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollBonus" (
    "id" TEXT NOT NULL,
    "payrollRunItemId" TEXT NOT NULL,
    "bonusRuleId" TEXT NOT NULL,
    "grossBonus" DECIMAL(15,2) NOT NULL,
    "taxOnBonus" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "netBonus" DECIMAL(15,2) NOT NULL,
    "employerTaxLiability" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "prorationMonths" INTEGER,
    "taxationType" "TaxationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollBonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAllowance" (
    "id" TEXT NOT NULL,
    "payrollRunItemId" TEXT NOT NULL,
    "actingAssignmentId" TEXT,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "isProrated" BOOLEAN NOT NULL DEFAULT false,
    "proratedDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollProration" (
    "id" TEXT NOT NULL,
    "payrollRunItemId" TEXT NOT NULL,
    "hireDate" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "workedDays" INTEGER NOT NULL,
    "proratedFactor" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollProration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollOverrideRequest" (
    "id" TEXT NOT NULL,
    "payrollRunItemId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollOverrideRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceImport" (
    "id" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "source" "AttendanceSource" NOT NULL,
    "importedBy" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "fileReference" TEXT,
    "fileHash" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "errorDetails" TEXT,
    "periodLabel" TEXT,
    "totalEmployees" INTEGER NOT NULL DEFAULT 0,
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "exportData" TEXT,

    CONSTRAINT "AttendanceImport_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "attendanceImportId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "regularHours" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "isAbsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvertimeRecord" (
    "id" TEXT NOT NULL,
    "attendanceRecordId" TEXT,
    "category" "OvertimeCategory" NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "isManualEntry" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "attendanceMonthlySummaryId" TEXT,

    CONSTRAINT "OvertimeRecord_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "AttendancePeriodSummary" (
    "id" TEXT NOT NULL,
    "attendanceImportId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "regularHours" DECIMAL(7,2) NOT NULL,
    "paidLeaveHours" DECIMAL(7,2) NOT NULL,
    "absenceHours" DECIMAL(7,2),
    "monthlyWorkHours" DECIMAL(7,2) NOT NULL,
    "totalHours" DECIMAL(7,2) NOT NULL,
    "workingDays" INTEGER,
    "absentDays" INTEGER,
    "paidLeaveDays" DECIMAL(7,2),
    "actualDays" DECIMAL(7,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendancePeriodSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActingAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "actingPositionId" TEXT NOT NULL,
    "actingAllowanceRuleId" TEXT,
    "actingPositionSalary" DECIMAL(15,2) NOT NULL,
    "actingPositionBasicSalary" DECIMAL(15,2),
    "actingPositionGrossSalary" DECIMAL(15,2),
    "replacedEmployeeId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "expectedEndDate" TIMESTAMP(3),
    "status" "ActingAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "extensionApprovedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipTemplate" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "companyLogo" TEXT,
    "templateUrl" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "customFields" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayslipTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "payrollRunItemId" TEXT NOT NULL,
    "templateId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfPath" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "emailStatus" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "emailRetryCount" INTEGER NOT NULL DEFAULT 0,
    "generationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "visibilityStatus" "PayslipVisibilityStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveDeduction" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "payrollPeriodId" TEXT,
    "leaveType" TEXT NOT NULL,
    "leaveDays" DECIMAL(5,2) NOT NULL,
    "deductionAmount" DECIMAL(15,2) NOT NULL,
    "externalLeaveId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveDeduction_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "ApprovalWorkflow" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "approvalWorkflowId" TEXT NOT NULL,
    "stageType" "ApprovalStageType" NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "requiredRoleId" INTEGER NOT NULL,
    "alternateRoleId" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "stageType" "ApprovalStageType" NOT NULL,
    "referenceType" "ReferenceType" NOT NULL,
    "payrollRunId" TEXT,
    "attendanceImportId" TEXT,
    "paymentFileId" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalAction" (
    "id" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "actorId" INTEGER NOT NULL,
    "action" "ApprovalStatus" NOT NULL,
    "comment" TEXT,
    "ipAddress" TEXT,
    "actedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "ManualAdjustment" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT,
    "employeeId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "adjustmentType" "AdjustmentType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionLog" (
    "id" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "referenceId" TEXT,
    "employeeId" TEXT,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExceptionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRule" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER,
    "ruleCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCheck" (
    "id" TEXT NOT NULL,
    "complianceRuleId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "details" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "folderId" TEXT,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bankId" INTEGER NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'ETB',
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentFile" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "bankId" INTEGER NOT NULL,
    "format" "ExportFormat" NOT NULL DEFAULT 'CSV',
    "filePath" TEXT,
    "status" "PaymentFileStatus" NOT NULL DEFAULT 'GENERATED',
    "exportedBy" TEXT,
    "exportedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCredential" (
    "id" TEXT NOT NULL,
    "system" "IntegrationSystem" NOT NULL,
    "authType" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "credential" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationLog" (
    "id" TEXT NOT NULL,
    "system" "IntegrationSystem" NOT NULL,
    "direction" "SyncDirection" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "recordsSynced" INTEGER NOT NULL DEFAULT 0,
    "errorDetails" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErcaSubmission" (
    "id" TEXT NOT NULL,
    "payrollPeriodId" TEXT,
    "submittedBy" TEXT,
    "filePath" TEXT,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "responseDetails" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErcaSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankExportJob" (
    "id" TEXT NOT NULL,
    "bankId" INTEGER NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "filePath" TEXT,
    "status" "SyncStatus" NOT NULL,
    "errorDetails" TEXT,
    "exportedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSyncLog" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "externalId" TEXT,
    "changeType" TEXT NOT NULL,
    "payload" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SyncStatus" NOT NULL,

    CONSTRAINT "EmployeeSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveSyncLog" (
    "id" TEXT NOT NULL,
    "payrollPeriodId" TEXT,
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "status" "SyncStatus" NOT NULL,
    "errorDetails" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OkrSyncLog" (
    "id" TEXT NOT NULL,
    "payrollPeriodId" TEXT,
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "status" "SyncStatus" NOT NULL,
    "errorDetails" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OkrSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataMigrationJob" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "processedRecords" INTEGER NOT NULL DEFAULT 0,
    "errorDetails" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataMigrationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "name" TEXT NOT NULL,
    "template" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportExport" (
    "id" TEXT NOT NULL,
    "reportTemplateId" TEXT,
    "payrollPeriodId" TEXT,
    "reportType" "ReportType" NOT NULL,
    "format" "ExportFormat" NOT NULL DEFAULT 'EXCEL',
    "filePath" TEXT,
    "filters" JSONB,
    "generatedBy" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveBatch" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "archiveType" "ArchiveType" NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "storagePath" TEXT,
    "archivedBy" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSearchable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ArchiveBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatutoryReport" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "payrollPeriodId" TEXT,
    "format" "ExportFormat" NOT NULL,
    "filePath" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'GENERATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatutoryReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollBatch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollBatchEmployee" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollBatchId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,

    CONSTRAINT "PayrollBatchEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "referenceId" TEXT,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_baseCurrencyId_key" ON "Company"("baseCurrencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_externalId_key" ON "Employee"("externalId");

-- CreateIndex
CREATE INDEX "Employee_companyId_status_idx" ON "Employee"("companyId", "status");

-- CreateIndex
CREATE INDEX "Employee_externalId_idx" ON "Employee"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_employeeId_key" ON "EmployeeProfile"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCompensation_employeeId_key" ON "EmployeeCompensation"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeAllowance_employeeId_isActive_idx" ON "EmployeeAllowance"("employeeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAllowance_employeeId_allowanceType_key" ON "EmployeeAllowance"("employeeId", "allowanceType");

-- CreateIndex
CREATE INDEX "SalaryHistory_employeeId_effectiveDate_idx" ON "SalaryHistory"("employeeId", "effectiveDate");

-- CreateIndex
CREATE INDEX "TaxBracket_companyId_isActive_idx" ON "TaxBracket"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "TaxBracket_companyId_effectiveDate_idx" ON "TaxBracket"("companyId", "effectiveDate");

-- CreateIndex
CREATE INDEX "PensionRule_companyId_isActive_idx" ON "PensionRule"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PensionRule_companyId_basis_effectiveDate_key" ON "PensionRule"("companyId", "basis", "effectiveDate");

-- CreateIndex
CREATE INDEX "AllowanceConfig_companyId_isActive_idx" ON "AllowanceConfig"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AllowanceConfig_companyId_earningType_key" ON "AllowanceConfig"("companyId", "earningType");

-- CreateIndex
CREATE UNIQUE INDEX "OvertimeRule_companyId_category_effectiveDate_key" ON "OvertimeRule"("companyId", "category", "effectiveDate");

-- CreateIndex
CREATE INDEX "DeductionItem_salaryStructureId_isActive_idx" ON "DeductionItem"("salaryStructureId", "isActive");

-- CreateIndex
CREATE INDEX "EmployeeDeduction_employeeId_status_idx" ON "EmployeeDeduction"("employeeId", "status");

-- CreateIndex
CREATE INDEX "EmployeeDeduction_employeeId_isActive_idx" ON "EmployeeDeduction"("employeeId", "isActive");

-- CreateIndex
CREATE INDEX "EmployeeDeduction_companyId_status_idx" ON "EmployeeDeduction"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeductionPaymentPlan_employeeDeductionId_key" ON "DeductionPaymentPlan"("employeeDeductionId");

-- CreateIndex
CREATE UNIQUE INDEX "Configuration_companyId_key_key" ON "Configuration"("companyId", "key");

-- CreateIndex
CREATE INDEX "SystemCurrency_companyId_isActive_idx" ON "SystemCurrency"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SystemCurrency_companyId_code_key" ON "SystemCurrency"("companyId", "code");

-- CreateIndex
CREATE INDEX "CurrencyRate_companyId_effectiveDate_idx" ON "CurrencyRate"("companyId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyRate_companyId_fromCurrencyId_toCurrencyId_effectiv_key" ON "CurrencyRate"("companyId", "fromCurrencyId", "toCurrencyId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayslipNotificationSettings_companyId_key" ON "PayslipNotificationSettings"("companyId");

-- CreateIndex
CREATE INDEX "PayFrequency_companyId_isActive_idx" ON "PayFrequency"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "FiscalYear_companyId_isActive_idx" ON "FiscalYear"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "PayrollPeriod_companyId_status_idx" ON "PayrollPeriod"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_companyId_startDate_endDate_cycle_key" ON "PayrollPeriod"("companyId", "startDate", "endDate", "cycle");

-- CreateIndex
CREATE INDEX "PayrollRun_payrollBatchId_idx" ON "PayrollRun"("payrollBatchId");

-- CreateIndex
CREATE INDEX "PayrollRunItem_payrollRunId_idx" ON "PayrollRunItem"("payrollRunId");

-- CreateIndex
CREATE INDEX "PayrollRunItem_employeeId_idx" ON "PayrollRunItem"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRunItem_payrollRunId_employeeId_key" ON "PayrollRunItem"("payrollRunId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollEarning_payrollRunItemId_idx" ON "PayrollEarning"("payrollRunItemId");

-- CreateIndex
CREATE INDEX "PayrollDeduction_payrollRunItemId_idx" ON "PayrollDeduction"("payrollRunItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollTax_payrollRunItemId_key" ON "PayrollTax"("payrollRunItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPension_payrollRunItemId_key" ON "PayrollPension"("payrollRunItemId");

-- CreateIndex
CREATE INDEX "PayrollOvertime_payrollRunItemId_idx" ON "PayrollOvertime"("payrollRunItemId");

-- CreateIndex
CREATE INDEX "PayrollBonus_payrollRunItemId_idx" ON "PayrollBonus"("payrollRunItemId");

-- CreateIndex
CREATE INDEX "PayrollAllowance_payrollRunItemId_idx" ON "PayrollAllowance"("payrollRunItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollProration_payrollRunItemId_key" ON "PayrollProration"("payrollRunItemId");

-- CreateIndex
CREATE INDEX "AttendanceNotification_recipientId_read_idx" ON "AttendanceNotification"("recipientId", "read");

-- CreateIndex
CREATE INDEX "AttendanceRecord_employeeId_date_idx" ON "AttendanceRecord"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_attendanceImportId_employeeId_date_key" ON "AttendanceRecord"("attendanceImportId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "AttendanceMonthlySummary_employeeId_idx" ON "AttendanceMonthlySummary"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceMonthlySummary_attendanceImportId_employeeId_key" ON "AttendanceMonthlySummary"("attendanceImportId", "employeeId");

-- CreateIndex
CREATE INDEX "AttendancePeriodSummary_employeeId_idx" ON "AttendancePeriodSummary"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendancePeriodSummary_attendanceImportId_employeeId_key" ON "AttendancePeriodSummary"("attendanceImportId", "employeeId");

-- CreateIndex
CREATE INDEX "ActingAssignment_employeeId_status_idx" ON "ActingAssignment"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_payrollRunItemId_key" ON "Payslip"("payrollRunItemId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveDeduction_employeeId_payrollPeriodId_leaveType_key" ON "LeaveDeduction"("employeeId", "payrollPeriodId", "leaveType");

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
CREATE UNIQUE INDEX "ApprovalStep_approvalWorkflowId_stageType_stepOrder_key" ON "ApprovalStep"("approvalWorkflowId", "stageType", "stepOrder");

-- CreateIndex
CREATE INDEX "PayrollNotification_recipientId_read_idx" ON "PayrollNotification"("recipientId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRule_ruleCode_key" ON "ComplianceRule"("ruleCode");

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "BankAccount_employeeId_isPrimary_idx" ON "BankAccount"("employeeId", "isPrimary");

-- CreateIndex
CREATE INDEX "IntegrationLog_system_status_idx" ON "IntegrationLog"("system", "status");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_createdAt_idx" ON "WebhookEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImportFolder_companyId_idx" ON "ImportFolder"("companyId");

-- CreateIndex
CREATE INDEX "ImportFolder_parentId_idx" ON "ImportFolder"("parentId");

-- CreateIndex
CREATE INDEX "PayrollBatch_payrollPeriodId_idx" ON "PayrollBatch"("payrollPeriodId");

-- CreateIndex
CREATE INDEX "PayrollBatchEmployee_payrollBatchId_idx" ON "PayrollBatchEmployee"("payrollBatchId");

-- CreateIndex
CREATE INDEX "PayrollBatchEmployee_payrollPeriodId_idx" ON "PayrollBatchEmployee"("payrollPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollBatchEmployee_employeeId_payrollPeriodId_key" ON "PayrollBatchEmployee"("employeeId", "payrollPeriodId");

-- CreateIndex
CREATE INDEX "AppNotification_recipientId_read_idx" ON "AppNotification"("recipientId", "read");

-- CreateIndex
CREATE INDEX "AppNotification_recipientId_createdAt_idx" ON "AppNotification"("recipientId", "createdAt");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_baseCurrencyId_fkey" FOREIGN KEY ("baseCurrencyId") REFERENCES "SystemCurrency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_jobGradeId_fkey" FOREIGN KEY ("jobGradeId") REFERENCES "JobGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_workUnitId_fkey" FOREIGN KEY ("workUnitId") REFERENCES "WorkUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAllowance" ADD CONSTRAINT "EmployeeAllowance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AppRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkUnit" ADD CONSTRAINT "WorkUnit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkUnit" ADD CONSTRAINT "WorkUnit_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_jobGradeId_fkey" FOREIGN KEY ("jobGradeId") REFERENCES "JobGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobGrade" ADD CONSTRAINT "JobGrade_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryHistory" ADD CONSTRAINT "SalaryHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryHistory" ADD CONSTRAINT "SalaryHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxBracket" ADD CONSTRAINT "TaxBracket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PensionRule" ADD CONSTRAINT "PensionRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllowanceConfig" ADD CONSTRAINT "AllowanceConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSharingRule" ADD CONSTRAINT "CostSharingRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRule" ADD CONSTRAINT "OvertimeRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusRule" ADD CONSTRAINT "BonusRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusEligibilityCriteria" ADD CONSTRAINT "BonusEligibilityCriteria_bonusRuleId_fkey" FOREIGN KEY ("bonusRuleId") REFERENCES "BonusRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusMapping" ADD CONSTRAINT "BonusMapping_bonusRuleId_fkey" FOREIGN KEY ("bonusRuleId") REFERENCES "BonusRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActingAllowanceRule" ADD CONSTRAINT "ActingAllowanceRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarningsItem" ADD CONSTRAINT "EarningsItem_salaryStructureId_fkey" FOREIGN KEY ("salaryStructureId") REFERENCES "SalaryStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeductionItem" ADD CONSTRAINT "DeductionItem_salaryStructureId_fkey" FOREIGN KEY ("salaryStructureId") REFERENCES "SalaryStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDeduction" ADD CONSTRAINT "EmployeeDeduction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDeduction" ADD CONSTRAINT "EmployeeDeduction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeductionPaymentPlan" ADD CONSTRAINT "DeductionPaymentPlan_employeeDeductionId_fkey" FOREIGN KEY ("employeeDeductionId") REFERENCES "EmployeeDeduction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Configuration" ADD CONSTRAINT "Configuration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemCurrency" ADD CONSTRAINT "SystemCurrency_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyRate" ADD CONSTRAINT "CurrencyRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyRate" ADD CONSTRAINT "CurrencyRate_fromCurrencyId_fkey" FOREIGN KEY ("fromCurrencyId") REFERENCES "SystemCurrency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyRate" ADD CONSTRAINT "CurrencyRate_toCurrencyId_fkey" FOREIGN KEY ("toCurrencyId") REFERENCES "SystemCurrency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipNotificationSettings" ADD CONSTRAINT "PayslipNotificationSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayFrequency" ADD CONSTRAINT "PayFrequency_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_payrollBatchId_fkey" FOREIGN KEY ("payrollBatchId") REFERENCES "PayrollBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRunItem" ADD CONSTRAINT "PayrollRunItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRunItem" ADD CONSTRAINT "PayrollRunItem_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEarning" ADD CONSTRAINT "PayrollEarning_payrollRunItemId_fkey" FOREIGN KEY ("payrollRunItemId") REFERENCES "PayrollRunItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollDeduction" ADD CONSTRAINT "PayrollDeduction_payrollRunItemId_fkey" FOREIGN KEY ("payrollRunItemId") REFERENCES "PayrollRunItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollTax" ADD CONSTRAINT "PayrollTax_payrollRunItemId_fkey" FOREIGN KEY ("payrollRunItemId") REFERENCES "PayrollRunItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPension" ADD CONSTRAINT "PayrollPension_payrollRunItemId_fkey" FOREIGN KEY ("payrollRunItemId") REFERENCES "PayrollRunItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollOvertime" ADD CONSTRAINT "PayrollOvertime_payrollRunItemId_fkey" FOREIGN KEY ("payrollRunItemId") REFERENCES "PayrollRunItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBonus" ADD CONSTRAINT "PayrollBonus_bonusRuleId_fkey" FOREIGN KEY ("bonusRuleId") REFERENCES "BonusRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBonus" ADD CONSTRAINT "PayrollBonus_payrollRunItemId_fkey" FOREIGN KEY ("payrollRunItemId") REFERENCES "PayrollRunItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAllowance" ADD CONSTRAINT "PayrollAllowance_actingAssignmentId_fkey" FOREIGN KEY ("actingAssignmentId") REFERENCES "ActingAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAllowance" ADD CONSTRAINT "PayrollAllowance_payrollRunItemId_fkey" FOREIGN KEY ("payrollRunItemId") REFERENCES "PayrollRunItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollProration" ADD CONSTRAINT "PayrollProration_payrollRunItemId_fkey" FOREIGN KEY ("payrollRunItemId") REFERENCES "PayrollRunItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollOverrideRequest" ADD CONSTRAINT "PayrollOverrideRequest_payrollRunItemId_fkey" FOREIGN KEY ("payrollRunItemId") REFERENCES "PayrollRunItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceImport" ADD CONSTRAINT "AttendanceImport_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_attendanceImportId_fkey" FOREIGN KEY ("attendanceImportId") REFERENCES "AttendanceImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRecord" ADD CONSTRAINT "OvertimeRecord_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRecord" ADD CONSTRAINT "OvertimeRecord_attendanceMonthlySummaryId_fkey" FOREIGN KEY ("attendanceMonthlySummaryId") REFERENCES "AttendanceMonthlySummary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMonthlySummary" ADD CONSTRAINT "AttendanceMonthlySummary_attendanceImportId_fkey" FOREIGN KEY ("attendanceImportId") REFERENCES "AttendanceImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMonthlySummary" ADD CONSTRAINT "AttendanceMonthlySummary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePeriodSummary" ADD CONSTRAINT "AttendancePeriodSummary_attendanceImportId_fkey" FOREIGN KEY ("attendanceImportId") REFERENCES "AttendanceImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePeriodSummary" ADD CONSTRAINT "AttendancePeriodSummary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActingAssignment" ADD CONSTRAINT "ActingAssignment_actingAllowanceRuleId_fkey" FOREIGN KEY ("actingAllowanceRuleId") REFERENCES "ActingAllowanceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActingAssignment" ADD CONSTRAINT "ActingAssignment_actingPositionId_fkey" FOREIGN KEY ("actingPositionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActingAssignment" ADD CONSTRAINT "ActingAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActingAssignment" ADD CONSTRAINT "ActingAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActingAssignment" ADD CONSTRAINT "ActingAssignment_replacedEmployeeId_fkey" FOREIGN KEY ("replacedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipTemplate" ADD CONSTRAINT "PayslipTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollRunItemId_fkey" FOREIGN KEY ("payrollRunItemId") REFERENCES "PayrollRunItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PayslipTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveDeduction" ADD CONSTRAINT "LeaveDeduction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveDeduction" ADD CONSTRAINT "LeaveDeduction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveDeduction" ADD CONSTRAINT "LeaveDeduction_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApplication" ADD CONSTRAINT "LeaveApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApplication" ADD CONSTRAINT "LeaveApplication_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLeaveItem" ADD CONSTRAINT "PayrollLeaveItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLeaveItem" ADD CONSTRAINT "PayrollLeaveItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLeaveItem" ADD CONSTRAINT "PayrollLeaveItem_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLeaveItem" ADD CONSTRAINT "PayrollLeaveItem_payrollRunItemId_fkey" FOREIGN KEY ("payrollRunItemId") REFERENCES "PayrollRunItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalWorkflow" ADD CONSTRAINT "ApprovalWorkflow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_approvalWorkflowId_fkey" FOREIGN KEY ("approvalWorkflowId") REFERENCES "ApprovalWorkflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_requiredRoleId_fkey" FOREIGN KEY ("requiredRoleId") REFERENCES "AppRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_alternateRoleId_fkey" FOREIGN KEY ("alternateRoleId") REFERENCES "AppRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_attendanceImportId_fkey" FOREIGN KEY ("attendanceImportId") REFERENCES "AttendanceImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_paymentFileId_fkey" FOREIGN KEY ("paymentFileId") REFERENCES "PaymentFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualAdjustment" ADD CONSTRAINT "ManualAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualAdjustment" ADD CONSTRAINT "ManualAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualAdjustment" ADD CONSTRAINT "ManualAdjustment_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionLog" ADD CONSTRAINT "ExceptionLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRule" ADD CONSTRAINT "ComplianceRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_complianceRuleId_fkey" FOREIGN KEY ("complianceRuleId") REFERENCES "ComplianceRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ImportFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentFile" ADD CONSTRAINT "PaymentFile_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentFile" ADD CONSTRAINT "PaymentFile_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErcaSubmission" ADD CONSTRAINT "ErcaSubmission_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankExportJob" ADD CONSTRAINT "BankExportJob_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankExportJob" ADD CONSTRAINT "BankExportJob_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSyncLog" ADD CONSTRAINT "EmployeeSyncLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveSyncLog" ADD CONSTRAINT "LeaveSyncLog_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OkrSyncLog" ADD CONSTRAINT "OkrSyncLog_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_reportTemplateId_fkey" FOREIGN KEY ("reportTemplateId") REFERENCES "ReportTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveBatch" ADD CONSTRAINT "ArchiveBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatutoryReport" ADD CONSTRAINT "StatutoryReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatutoryReport" ADD CONSTRAINT "StatutoryReport_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFolder" ADD CONSTRAINT "ImportFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ImportFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBatch" ADD CONSTRAINT "PayrollBatch_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBatchEmployee" ADD CONSTRAINT "PayrollBatchEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBatchEmployee" ADD CONSTRAINT "PayrollBatchEmployee_payrollBatchId_fkey" FOREIGN KEY ("payrollBatchId") REFERENCES "PayrollBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBatchEmployee" ADD CONSTRAINT "PayrollBatchEmployee_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
