import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────────────────

const pensionBasisEnum = z.enum(["BASIC", "GROSS"]);
const payrollCycleEnum = z.enum(["MONTHLY", "WEEKLY", "DAILY", "HOURLY"]);
const overtimeCategoryEnum = z.enum([
    "WEEKDAY_DAY", "WEEKDAY_NIGHT", "WEEKEND", "PUBLIC_HOLIDAY",
]);
const earningTypeEnum = z.enum([
    "BASIC_SALARY", "RESPONSIBILITY_ALLOWANCE", "HOUSING_ALLOWANCE",
    "TELEPHONE_ALLOWANCE", "MEAL_ALLOWANCE", "HARDSHIP_ALLOWANCE",
    "ACTING_ALLOWANCE", "RELOCATION_ALLOWANCE", "PD_ALLOWANCE",
    "TRANSPORT_TAXABLE", "TRANSPORT_NON_TAXABLE", "OVERTIME", "BONUS",
    "INCENTIVE", "GIFT", "PROFIT_SHARING", "OTHER",
]);
const deductionTypeEnum = z.enum([
    "EMPLOYMENT_INCOME_TAX", "PENSION_EMPLOYEE", "COST_SHARING",
    "LOAN_REPAYMENT", "ADVANCE_RECOVERY", "UNPAID_LEAVE", "LATENESS",
    "COURT_ORDER", "UNION_DUES", "OTHER",
    "SAVINGS_AND_CREDIT", "HEALTH_INSURANCE", "LIFE_INSURANCE",
    "FINE_PENALTY", "OVERPAYMENT_RECOVERY", "CHILD_SUPPORT", "GARNISHMENT",
]);
const currencyEnum = z.enum(["ETB", "USD", "GBP", "EUR", "AED"]);
const fiscalStatusEnum = z.enum(["DRAFT", "ACTIVE", "CLOSED"]);
const batchStatusEnum = z.enum(["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"]);
const digestFrequencyEnum = z.enum(["DAILY", "WEEKLY", "MONTHLY"]);
const payDayRuleEnum = z.enum(["FIXED_DATE", "OFFSET_FROM_PERIOD_END"]);
const payslipFormatEnum = z.enum(["PDF", "HTML"]);
const deliveryTriggerEnum = z.enum(["PAYSLIP_GENERATED", "PAYSLIP_VIEWED", "PAYSLIP_APPROVED", "PAYSLIP_REJECTED", "MONTHLY_DIGEST"]);
const weekendRolloverEnum = z.enum(["PAY_FRIDAY_BEFORE", "PAY_MONDAY_AFTER"]);
const dailyRateBasisEnum = z.enum(["ANNUAL_SALARY_DIVIDED_BY_WORKING_DAYS", "FIXED_DAILY_RATE"]);

const dateStringOrDate = z.union([z.string(), z.date()]);

// ── Helpers ────────────────────────────────────────────────────────────────────

function refineDate(value: string | Date) {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return false;
    return true;
}

const nullableCoerceNumber = z.union([
    z.coerce.number(),
    z.string().refine((v) => v === "" || v === null, { message: "Empty string or null" }).transform(() => null),
    z.null(),
]).optional();

const coerceBoolean = z.union([
    z.boolean(),
    z.string().transform((v) => v.toLowerCase() === "true" || v === "1"),
]).optional();

const coerceNumber = z.union([
    z.number(),
    z.string().transform((v) => {
        const n = parseFloat(v);
        if (isNaN(n)) throw new Error("Invalid number");
        return n;
    }),
]).optional().nullable();

// ── Fiscal Year ────────────────────────────────────────────────────────────────

const fiscalYearBody = z.object({
    name: z.string().min(1, "name is required"),
    startDate: dateStringOrDate.refine(refineDate, "Invalid startDate"),
    endDate: dateStringOrDate.refine(refineDate, "Invalid endDate"),
    status: fiscalStatusEnum.optional().default("DRAFT"),
}).refine((d) => new Date(d.endDate) > new Date(d.startDate), {
    message: "endDate must be after startDate",
}).passthrough();

export const createFiscalYearSchema = { body: fiscalYearBody };

export const updateFiscalYearSchema = {
    body: z.object({
        name: z.string().min(1).optional(),
        startDate: dateStringOrDate.refine(refineDate, "Invalid startDate").optional(),
        endDate: dateStringOrDate.refine(refineDate, "Invalid endDate").optional(),
        status: fiscalStatusEnum.optional(),
    }).passthrough(),
};

export const saveFiscalYearBatchSchema = {
    body: z.union([
        z.array(fiscalYearBody),
        z.object({ fiscalYears: z.array(fiscalYearBody) }),
    ]),
};

// ── Tax Bracket ────────────────────────────────────────────────────────────────

const taxBracketBody = z.object({
    lowerBound: z.coerce.number().min(0, "lowerBound must be >= 0"),
    upperBound: z.coerce.number().min(0, "upperBound must be >= 0").nullable().optional(),
    rate: z.coerce.number().min(0, "rate must be >= 0"),
    deductionAmount: z.coerce.number().min(0, "deductionAmount must be >= 0"),
    effectiveDate: dateStringOrDate.refine(refineDate, "Invalid effectiveDate"),
    expiryDate: dateStringOrDate.refine(refineDate, "Invalid expiryDate").nullable().optional(),
}).passthrough();

export const createTaxBracketSchema = { body: taxBracketBody };

export const updateTaxBracketSchema = {
    body: taxBracketBody.partial().passthrough(),
};

export const saveTaxBracketBatchSchema = {
    body: z.union([
        z.array(taxBracketBody),
        z.object({ taxBrackets: z.array(taxBracketBody) }),
    ]),
};

// ── Pension Rule ───────────────────────────────────────────────────────────────

const pensionRuleBody = z.object({
    employeeRate: z.coerce.number().min(0).max(100, "employeeRate must be 0-100"),
    employerRate: z.coerce.number().min(0).max(100, "employerRate must be 0-100"),
    basis: pensionBasisEnum,
    mandatoryForForeigners: coerceBoolean.default(false),
    remittanceDeadlineDays: z.coerce.number().int().min(1).optional().default(30),
    effectiveDate: dateStringOrDate.refine(refineDate, "Invalid effectiveDate"),
}).passthrough();

export const createPensionRuleSchema = { body: pensionRuleBody };

export const updatePensionRuleSchema = {
    body: pensionRuleBody.partial().passthrough(),
};

export const savePensionRuleBatchSchema = {
    body: z.union([
        z.array(pensionRuleBody),
        z.object({ pensionRules: z.array(pensionRuleBody) }),
    ]),
};

// ── Overtime Rule ──────────────────────────────────────────────────────────────

const overtimeRuleBody = z.object({
    category: overtimeCategoryEnum,
    rate: z.coerce.number().min(0, "rate must be >= 0"),
    calculationBase: pensionBasisEnum.optional().default("BASIC"),
    isTaxable: coerceBoolean.optional().default(true),
    weeklyCapHours: z.coerce.number().min(0, "weeklyCapHours must be >= 0").optional().default(0),
    monthlyCapHours: z.coerce.number().min(0, "monthlyCapHours must be >= 0").optional().nullable(),
    effectiveDate: dateStringOrDate.refine(refineDate, "Invalid effectiveDate"),
}).passthrough();

export const createOvertimeRuleSchema = { body: overtimeRuleBody };

export const updateOvertimeRuleSchema = {
    body: overtimeRuleBody.partial().passthrough(),
};

export const saveOvertimeBatchSchema = {
    body: z.union([
        z.array(overtimeRuleBody),
        z.object({ overtimeRules: z.array(overtimeRuleBody) }),
    ]),
};

// ── Allowance Configuration ────────────────────────────────────────────────────

const allowanceBody = z.object({
    earningType: z.string().min(1, "earning type is required"),
    label: z.string().min(1, "label is required"),
    isTaxable: coerceBoolean,
    isExempt: coerceBoolean,
    exemptPercent: coerceNumber,
}).passthrough();

export const createAllowanceSchema = { body: allowanceBody };

export const updateAllowanceSchema = {
    body: z.object({
        label: z.string().min(1).optional(),
        isTaxable: coerceBoolean,
        isActive: coerceBoolean,
        isExempt: coerceBoolean,
        exemptPercent: coerceNumber,
    }).passthrough(),
};

export const saveAllowanceBatchSchema = {
    body: z.union([
        z.array(allowanceBody),
        z.object({ allowances: z.array(allowanceBody) }),
    ]),
};

// ── Salary Structure ───────────────────────────────────────────────────────────

const salaryStructureBody = z.object({
    name: z.string().min(1, "name is required").max(255),
    description: z.string().optional(),
}).passthrough();

export const createSalaryStructureSchema = { body: salaryStructureBody };

export const updateSalaryStructureSchema = {
    body: z.object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
    }).passthrough(),
};

export const saveSalaryStructureBatchSchema = {
    body: z.union([
        z.array(salaryStructureBody),
        z.object({ salaryStructures: z.array(salaryStructureBody) }),
    ]),
};

const calculationBasisEnum = z.enum([
    "BASIC",
    "GROSS",
]);

const deductionCalculationTypeEnum = z.enum([
    "FIXED_AMOUNT",
    "PERCENTAGE_OF_BASIC",
    "PERCENTAGE_OF_GROSS",
    "REMAINING_BALANCE",
]);

// ── Deduction Configuration ────────────────────────────────────────────────────

const deductionItemBody = z.object({
    deductionType: deductionTypeEnum.optional(),
    label: z.string().min(1, "label is required"),
    isMandatory: coerceBoolean,
    isStatutory: coerceBoolean,
    calculationType: deductionCalculationTypeEnum.nullable().optional(),
    calculationBasis: calculationBasisEnum.nullable().optional(),
    amount: z.coerce.number().min(0).nullable().optional(),
    percent: z.coerce.number().min(0).max(100).nullable().optional(),
}).passthrough();

export const createDeductionSchema = {
    params: z.object({ salaryStructureId: z.string().min(1) }),
    body: deductionItemBody,
};

export const createDeductionSimpleSchema = {
    body: deductionItemBody,
};

export const updateDeductionSchema = {
    body: z.object({
        deductionType: deductionTypeEnum.optional(),
        label: z.string().min(1).optional(),
        isMandatory: coerceBoolean,
        isStatutory: coerceBoolean,
        calculationType: deductionCalculationTypeEnum.nullable().optional(),
        calculationBasis: calculationBasisEnum.nullable().optional(),
        amount: z.coerce.number().min(0).nullable().optional(),
        percent: z.coerce.number().min(0).max(100).nullable().optional(),
    }).passthrough(),
};

export const saveDeductionBatchSchema = {
    params: z.object({ salaryStructureId: z.string().min(1) }),
    body: z.union([
        z.array(deductionItemBody),
        z.object({ deductions: z.array(deductionItemBody) }),
    ]),
};

export const saveDeductionSimpleSchema = {
    body: z.union([
        z.array(deductionItemBody),
        z.object({ deductions: z.array(deductionItemBody) }),
    ]),
};

// ── Employee Deduction Configuration ────────────────────────────────────────────

const employeeDeductionStatusEnum = z.enum(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]);
const employeeDeductionBody = z.object({
    employeeId: z.string().min(1, "employeeId is required"),
    deductionType: deductionTypeEnum,
    label: z.string().min(1, "label is required"),
    calculationType: deductionCalculationTypeEnum.nullable(),
    deductionItemId: z.string().optional(),
    amount: z.coerce.number().min(0).nullable().optional(),
    percent: z.coerce.number().min(0).max(100).nullable().optional(),
    totalAmount: z.coerce.number().min(0).nullable().optional(),
    numInstallments: z.coerce.number().int().min(1).nullable().optional(),
    currency: currencyEnum.optional(),
    startDate: dateStringOrDate.refine(refineDate, "Invalid startDate").optional(),
    endDate: dateStringOrDate.refine(refineDate, "Invalid endDate").optional(),
    effectivePeriodId: z.string().optional(),
    description: z.string().optional(),
    refNo: z.string().optional(),
    priority: z.coerce.number().int().optional(),
    prorated: coerceBoolean,
}).passthrough();

export const createEmployeeDeductionSchema = {
    body: employeeDeductionBody,
};

export const updateEmployeeDeductionSchema = {
    body: z.object({
        label: z.string().min(1).optional(),
        calculationType: deductionCalculationTypeEnum.optional().nullable(),
        amount: z.coerce.number().min(0).nullable().optional(),
        percent: z.coerce.number().min(0).max(100).nullable().optional(),
        totalAmount: z.coerce.number().min(0).nullable().optional(),
        paidAmount: z.coerce.number().min(0).optional(),
        remaining: z.coerce.number().min(0).nullable().optional(),
        numInstallments: z.coerce.number().int().min(1).nullable().optional(),
        paidInstallments: z.coerce.number().int().min(0).optional(),
        status: employeeDeductionStatusEnum.optional(),
        startDate: dateStringOrDate.refine(refineDate, "Invalid startDate").optional(),
        endDate: dateStringOrDate.refine(refineDate, "Invalid endDate").optional(),
        description: z.string().optional(),
        refNo: z.string().optional(),
        priority: z.coerce.number().int().optional(),
        prorated: coerceBoolean,
        isActive: coerceBoolean,
        deductionItemId: z.string().optional(),
    }).strip(),
};

export const getEmployeeDeductionsSchema = {
    query: z.object({
        employeeId: z.string().optional(),
        deductionItemId: z.string().uuid().optional(),
        status: employeeDeductionStatusEnum.optional(),
        search: z.string().optional(),
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
    }),
};

export const recordPaymentSchema = {
    body: z.object({
        paymentAmount: z.coerce.number().min(0),
        payrollRunItemId: z.string().optional(),
        periodId: z.string().optional(),
    }),
};

const bulkAssignPerEmployeeValue = z.object({
    employeeId: z.string().min(1, "employeeId is required"),
    amount: z.coerce.number().min(0).nullable().optional(),
    percent: z.coerce.number().min(0).max(100).nullable().optional(),
});

export const bulkAssignEmployeeDeductionsSchema = {
    body: z.object({
        deductionConfigId: z.string().min(1, "deductionConfigId is required"),
        assignAllEmployees: z.coerce.boolean().optional(),
        assignments: z.array(bulkAssignPerEmployeeValue).optional(),
    }).refine(
        (data) => {
            if (data.assignAllEmployees) return true;
            return Array.isArray(data.assignments) && data.assignments.length > 0;
        },
        {
            message: "assignments array is required when assignAllEmployees is not set",
            path: ["assignments"],
        },
    ),
};

// ── Payroll Period ─────────────────────────────────────────────────────────────

const payrollPeriodBody = z.object({
    name: z.string().optional(),
    cycle: payrollCycleEnum,
    startDate: dateStringOrDate.refine(refineDate, "Invalid startDate"),
    endDate: dateStringOrDate.refine(refineDate, "Invalid endDate"),
    dateOfPayment: dateStringOrDate.refine(refineDate, "Invalid dateOfPayment").nullable().optional(),
    fiscalYearId: z.string().min(1, "fiscalYearId is required"),
}).refine((d) => new Date(d.endDate) > new Date(d.startDate), {
    message: "endDate must be after startDate",
}).passthrough();

export const createPayrollPeriodSchema = { body: payrollPeriodBody };

export const updatePayrollPeriodSchema = {
    body: z.object({
        name: z.string().optional(),
        cycle: payrollCycleEnum.optional(),
        startDate: dateStringOrDate.refine(refineDate, "Invalid startDate").optional(),
        endDate: dateStringOrDate.refine(refineDate, "Invalid endDate").optional(),
        dateOfPayment: dateStringOrDate.refine(refineDate, "Invalid dateOfPayment").nullable().optional(),
        fiscalYearId: z.string().min(1).optional(),
    }).passthrough(),
};

export const savePayrollPeriodSchema = { body: payrollPeriodBody };

// ── Workdays Configuration ─────────────────────────────────────────────────────

const workdaysBody = z.object({
    defaultMonthlyWorkdays: z.coerce.number().int().min(1).max(31),
    weeklyWorkingDays: z.coerce.number().int().min(1).max(7),
    dailyWorkingHours: z.coerce.number().min(1).max(24),
}).passthrough();

export const updateWorkdaysSchema = { body: workdaysBody };

export const patchWorkdaysSchema = {
    body: z.object({
        defaultMonthlyWorkdays: z.coerce.number().int().min(1).max(31).optional(),
        weeklyWorkingDays: z.coerce.number().int().min(1).max(7).optional(),
        dailyWorkingHours: z.coerce.number().min(1).max(24).optional(),
    }).refine(
        (d) => d.defaultMonthlyWorkdays != null || d.weeklyWorkingDays != null || d.dailyWorkingHours != null,
        { message: "At least one field must be provided" },
    ).passthrough(),
};

export const saveWorkdaysSchema = { body: workdaysBody };

// ── State Transitions ───────────────────────────────────────────────────────────

export const activateFiscalYearSchema = {
    params: z.object({ id: z.string().min(1) }),
};

export const closeFiscalYearSchema = {
    params: z.object({ id: z.string().min(1) }),
};

export const openPayrollPeriodSchema = {
    params: z.object({ id: z.string().min(1) }),
};

export const closePayrollPeriodSchema = {
    params: z.object({ id: z.string().min(1) }),
};

// ── Payroll Batch ─────────────────────────────────────────────────────────────

const payrollBatchBody = z.object({
    batchType: z.string().min(1, "batchType is required"),
    description: z.string().nullable().optional(),
    status: batchStatusEnum.optional().default("DRAFT"),
}).passthrough();

export const createPayrollBatchSchema = { body: payrollBatchBody };

export const updatePayrollBatchSchema = {
    body: z.object({
        batchType: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        status: batchStatusEnum.optional(),
    }).passthrough(),
};

export const savePayrollBatchSchema = {
    body: z.union([
        z.array(payrollBatchBody),
        z.object({ payrollBatches: z.array(payrollBatchBody) }),
    ]),
};

export const activatePayrollBatchSchema = {
    params: z.object({ id: z.string().min(1) }),
};

export const closePayrollBatchSchema = {
    params: z.object({ id: z.string().min(1) }),
};

export const archivePayrollBatchSchema = {
    params: z.object({ id: z.string().min(1) }),
};

export const generateBatchesSchema = {
    body: z.object({
        payrollPeriodId: z.string().min(1, "payrollPeriodId is required"),
        batchSize: z.coerce.number().int().min(1).max(1000).optional().default(50),
    }),
};

export const listBatchesByPeriodSchema = {
    query: z.object({
        payrollPeriodId: z.string().min(1, "payrollPeriodId is required"),
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    }),
};

export const listBatchEmployeesSchema = {
    query: z.object({
        batchId: z.string().min(1, "batchId is required"),
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        search: z.string().optional(),
    }),
};

export const moveBatchEmployeeSchema = {
    body: z.object({
        targetBatchId: z.string().min(1, "targetBatchId is required"),
    }),
    params: z.object({
        id: z.string().min(1, "id is required"),
    }),
};

// ── Payslip Notification Settings ────────────────────────────────────────────

const payslipNotificationBody = z.object({
    emailNotifications: z.boolean().optional().default(true),
    smsNotifications: z.boolean().optional().default(false),
    pushNotifications: z.boolean().optional().default(false),
    inAppNotifications: z.boolean().optional().default(false),
    digestFrequency: digestFrequencyEnum.optional().default("WEEKLY"),
    payslipFormat: payslipFormatEnum.optional().default("PDF"),
    emailTemplate: z.string().optional().nullable(),
    deliveryTriggers: z.array(deliveryTriggerEnum).optional().default(["PAYSLIP_GENERATED", "MONTHLY_DIGEST"]),
}).passthrough();

export const createPayslipNotificationSettingsSchema = { body: payslipNotificationBody };

export const updatePayslipNotificationSettingsSchema = {
    body: z.object({
        emailNotifications: z.boolean().optional(),
        smsNotifications: z.boolean().optional(),
        pushNotifications: z.boolean().optional(),
        inAppNotifications: z.boolean().optional(),
        digestFrequency: digestFrequencyEnum.optional(),
        payslipFormat: payslipFormatEnum.optional(),
        emailTemplate: z.string().optional().nullable(),
        deliveryTriggers: z.array(deliveryTriggerEnum).optional(),
    }).passthrough(),
};

export const savePayslipNotificationSettingsSchema = { body: payslipNotificationBody };

// ── Rounding Rule ────────────────────────────────────────────────────────────

const roundingRuleEnum = z.enum(["ROUND_HALF_UP", "ROUND_HALF_DOWN", "ROUND_HALF_EVEN", "TRUNCATE"]);

// ── Rate Source ──────────────────────────────────────────────────────────────

const rateSourceEnum = z.enum(["MANUAL", "AUTO_FETCH"]);

// ── System Currency ──────────────────────────────────────────────────────────

const systemCurrencyBody = z.object({
    code: z.string().min(1, "code is required").max(10),
    name: z.string().min(1, "name is required").max(100),
    symbol: z.string().min(1, "symbol is required").max(10),
    decimalPlaces: z.coerce.number().int().min(0).max(10).optional().default(2),
    roundingRule: roundingRuleEnum.optional().default("ROUND_HALF_UP"),
    isBase: z.boolean().optional().default(false),
    isActive: z.boolean().optional().default(true),
    autoFetchRate: z.boolean().optional().default(false),
}).passthrough();

export const createSystemCurrencySchema = { body: systemCurrencyBody };

export const updateSystemCurrencySchema = {
    body: z.object({
        code: z.string().min(1).max(10).optional(),
        name: z.string().min(1).max(100).optional(),
        symbol: z.string().min(1).max(10).optional(),
        decimalPlaces: z.coerce.number().int().min(0).max(10).optional(),
        roundingRule: roundingRuleEnum.optional(),
        isBase: z.boolean().optional(),
        isActive: z.boolean().optional(),
        autoFetchRate: z.boolean().optional(),
    }).passthrough(),
};

export const setBaseCurrencySchema = {
    params: z.object({ id: z.string().min(1) }),
};

// ── Currency Rate ────────────────────────────────────────────────────────────

const currencyRateBody = z.object({
    fromCurrencyId: z.string().min(1, "fromCurrencyId is required"),
    toCurrencyId: z.string().min(1, "toCurrencyId is required"),
    rate: z.coerce.number().positive("rate must be positive"),
    source: rateSourceEnum.optional().default("MANUAL"),
    overrideReason: z.string().optional().nullable(),
    effectiveDate: dateStringOrDate.refine(refineDate, "Invalid effectiveDate"),
}).passthrough();

export const createCurrencyRateSchema = { body: currencyRateBody };

export const updateCurrencyRateSchema = {
    body: z.object({
        fromCurrencyId: z.string().min(1).optional(),
        toCurrencyId: z.string().min(1).optional(),
        rate: z.coerce.number().positive().optional(),
        source: rateSourceEnum.optional(),
        overrideReason: z.string().optional().nullable(),
        effectiveDate: dateStringOrDate.refine(refineDate, "Invalid effectiveDate").optional(),
    }).passthrough(),
};

export const saveCurrencyRateBatchSchema = {
    body: z.object({ currencyRates: z.array(currencyRateBody) }),
};

// ── Pay Frequency ────────────────────────────────────────────────────────────

const payFrequencyBody = z.object({
    name: z.string().min(1, "name is required"),
    frequency: payrollCycleEnum,
    periodsPerYear: z.coerce.number().int().positive("periodsPerYear must be positive"),
    isActive: z.boolean().optional().default(true),
    // Pay day rules
    payDayRule: payDayRuleEnum.optional().nullable(),
    fixedPayDate: z.coerce.number().int().min(1).max(31).optional().nullable(),
    offsetDays: z.coerce.number().int().min(0).optional().nullable(),
    weekendRollover: weekendRolloverEnum.optional().nullable(),
    holidayRollover: weekendRolloverEnum.optional().nullable(),
    // Employee group
    applicableEmployeeGroup: z.string().optional().nullable(),
    autoGeneratePeriods: z.boolean().optional().default(true),
    // Daily-pay specifics
    dailyRateBasis: dailyRateBasisEnum.optional().nullable(),
    workingDaysPerYear: z.coerce.number().int().positive().optional().nullable(),
    minimumPayableDays: z.coerce.number().int().min(0).optional().nullable(),
    overtimeEligible: z.boolean().optional().default(true),
}).passthrough();

export const createPayFrequencySchema = { body: payFrequencyBody };

export const updatePayFrequencySchema = {
    body: z.object({
        name: z.string().min(1).optional(),
        frequency: payrollCycleEnum.optional(),
        periodsPerYear: z.coerce.number().int().positive().optional(),
        isActive: z.boolean().optional(),
        payDayRule: payDayRuleEnum.optional().nullable(),
        fixedPayDate: z.coerce.number().int().min(1).max(31).optional().nullable(),
        offsetDays: z.coerce.number().int().min(0).optional().nullable(),
        weekendRollover: weekendRolloverEnum.optional().nullable(),
        holidayRollover: weekendRolloverEnum.optional().nullable(),
        applicableEmployeeGroup: z.string().optional().nullable(),
        autoGeneratePeriods: z.boolean().optional(),
        dailyRateBasis: dailyRateBasisEnum.optional().nullable(),
        workingDaysPerYear: z.coerce.number().int().positive().optional().nullable(),
        minimumPayableDays: z.coerce.number().int().min(0).optional().nullable(),
        overtimeEligible: z.boolean().optional(),
    }).passthrough(),
};

export const savePayFrequencyBatchSchema = {
    body: z.object({ payFrequencies: z.array(payFrequencyBody) }),
};
