import prisma from "../config/database";
import CustomError from "../utils/customError";
import httpStatus from "http-status";
import { Prisma } from "../generated/prisma";
import { $Enums } from "../generated/prisma";
import logger from "../utils/logger";
import { calculateActingAllowance, type Tier } from "./actingAllowance.service";

type Decimal = Prisma.Decimal;
type OvertimeCategory = $Enums.OvertimeCategory;
type PensionBasis = $Enums.PensionBasis;
type EarningType = $Enums.EarningType;
type PayrollStatus = $Enums.PayrollStatus;

const PayrollStatusConst = $Enums.PayrollStatus;
const OvertimeCategoryConst = $Enums.OvertimeCategory;
const AllowanceTypeConst = $Enums.AllowanceType;

// ─────────────────────────────────────────────────────────────
// Pure calculation helpers
// ─────────────────────────────────────────────────────────────

interface WorkdaysConfig {
    defaultMonthlyWorkdays: number;
    weeklyWorkingDays: number;
    dailyWorkingHours: number;
    nonTaxableTransportExemption: number;
}

interface OvertimeRuleConfig {
    category: OvertimeCategory;
    rate: Decimal;
    weeklyCapHours: Decimal;
    calculationBase: string;
    isTaxable: boolean;
    monthlyCapHours: Decimal | null;
}

interface TaxBracketConfig {
    lowerBound: Decimal;
    upperBound: Decimal | null;
    rate: Decimal;
    deductionAmount: Decimal;
}

interface EmployeeOvertimeRecord {
    category: OvertimeCategory;
    hours: Decimal;
}

/**
 * Calculate prorated factor for mid-month hires.
 * Returns 1.0 if employee was employed before period start.
 */
/**
 * Calculate the proration factor for a mid-month hire.
 *
 * Counting convention: the hire date itself is a PAID day (Ethiopian payroll standard).
 * Both totalDays and workedDays use inclusive counting (+1), so the hire date is
 * counted once in each, cancelling out in the ratio.
 *
 * Examples (period: Feb 1–28, hire: Feb 15):
 *   totalDays  = (Feb28 − Feb1) + 1 = 28
 *   workedDays = (Feb28 − Feb15) + 1 = 14
 *   factor     = 14 / 28 = 0.5
 *
 * Guard: if hireDate ≤ periodStart, the employee was present for the entire period
 * and no proration is applied (factor = 1).
 *
 * @returns factor in (0, 1], totalDays, workedDays
 */
function calculateProrationFactor(
    hireDate: Date,
    periodStart: Date,
    periodEnd: Date,
): { factor: Decimal; totalDays: number; workedDays: number } {
    if (hireDate <= periodStart) {
        return { factor: new Prisma.Decimal(1), totalDays: 0, workedDays: 0 };
    }

    const msPerDay = 86_400_000;
    const totalDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / msPerDay) + 1;
    const workedDays = Math.round((periodEnd.getTime() - hireDate.getTime()) / msPerDay) + 1;
    const factor = new Prisma.Decimal(workedDays).div(totalDays);

    return { factor, totalDays, workedDays };
}

/**
 * Calculate overtime amount for a single overtime record.
 * Overtime pay = hours × (salary / (workingDays × dailyHours)) × overtimeRate
 * Salary is determined by calculationBase: BASIC → basicSalary, GROSS → grossSalary
 */
function calculateOvertimeAmount(
    record: EmployeeOvertimeRecord,
    overtimeRule: OvertimeRuleConfig,
    basicSalary: Decimal,
    grossSalary: Decimal,
    workingDays: number,
    dailyHours: number,
): { amount: Decimal; hourlyRate: Decimal } {
    const totalWorkHours = new Prisma.Decimal(workingDays * dailyHours);
    const salaryBase = overtimeRule.calculationBase === "GROSS" ? grossSalary : basicSalary;
    const hourlyRate = salaryBase.div(totalWorkHours);
    const amount = hourlyRate.mul(record.hours).mul(overtimeRule.rate);
    return { amount, hourlyRate };
}

/**
 * Calculate progressive income tax using tax brackets from DB.
 * For each bracket: apply rate to the portion of income within that bracket's range.
 * Sum all bracket portions and add deductionAmount for each applicable bracket.
 *
 * Ethiopian tax system: For each bracket, tax = (min(upperBound, income) - lowerBound) * rate + deductionAmount
 * But deductionAmount accumulates — it's the cumulative tax from previous brackets.
 */
function calculateIncomeTax(
    taxableIncome: Decimal,
    brackets: TaxBracketConfig[],
): { taxAmount: Decimal; appliedBracketId: string | null; appliedRate: Decimal; appliedDeduction: Decimal } {
    if (brackets.length === 0) {
        return { taxAmount: new Prisma.Decimal(0), appliedBracketId: null, appliedRate: new Prisma.Decimal(0), appliedDeduction: new Prisma.Decimal(0) };
    }

    // Find the bracket where taxableIncome falls, then apply single-bracket formula:
    //   Tax = MAX(0, (Income × Rate) - Deduction)
    // This is the standard Ethiopian tax formula — deductionAmount is the cumulative
    // adjustment for that bracket, not added per-bracket.
    for (const bracket of brackets) {
        const lower = bracket.lowerBound;
        const upper = bracket.upperBound;

        if (taxableIncome.gt(lower) && (upper === null || taxableIncome.lte(upper))) {
            const tax = taxableIncome.mul(bracket.rate).sub(bracket.deductionAmount);
            return {
                taxAmount: Prisma.Decimal.max(tax, new Prisma.Decimal(0)),
                appliedBracketId: (bracket as any).id ?? null,
                appliedRate: bracket.rate,
                appliedDeduction: bracket.deductionAmount,
            };
        }
    }

    // Income exceeds all defined brackets — apply highest bracket rate/deduction
    const lastBracket = brackets[brackets.length - 1];
    const tax = taxableIncome.mul(lastBracket.rate).sub(lastBracket.deductionAmount);
    return {
        taxAmount: Prisma.Decimal.max(tax, new Prisma.Decimal(0)),
        appliedBracketId: (lastBracket as any).id ?? null,
        appliedRate: lastBracket.rate,
        appliedDeduction: lastBracket.deductionAmount,
    };
}

/**
 * Calculate pension contributions.
 */
function calculatePension(
    baseSalary: Decimal,
    employeeRate: Decimal,
    employerRate: Decimal,
): { employeeContribution: Decimal; employerContribution: Decimal } {
    return {
        employeeContribution: baseSalary.mul(employeeRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        employerContribution: baseSalary.mul(employerRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
    };
}

/**
 * Validate the 1/3 deduction cap.
 * Returns true if totalDeductions > basicSalary / 3.
 */
function isDeductionCapBreached(totalDeductions: Decimal, basicSalary: Decimal): boolean {
    return totalDeductions.gt(basicSalary.div(3));
}

// ── Allowance mapping ────────────────────────────────────────
// Maps EarningType (from AllowanceConfig) to AllowanceType (from EmployeeAllowance).
// Employee allowances are stored as EmployeeAllowance records with an AllowanceType enum,
// while configuration uses EarningType. This bridge allows config-driven allowance lookup.
const earningTypeToAllowanceType: Record<string, $Enums.AllowanceType> = {
    TRANSPORT_TAXABLE: AllowanceTypeConst.TRANSPORTATION,
    TRANSPORT_NON_TAXABLE: AllowanceTypeConst.TRANSPORTATION,
    TELEPHONE_ALLOWANCE: AllowanceTypeConst.TELEPHONE,
    RESPONSIBILITY_ALLOWANCE: AllowanceTypeConst.REPRESENTATION,
    HOUSING_ALLOWANCE: AllowanceTypeConst.HOUSING,
    MEAL_ALLOWANCE: AllowanceTypeConst.MEAL,
    OTHER: AllowanceTypeConst.OTHER,
};

// ─────────────────────────────────────────────────────────────
// Types for internal data flow
// ─────────────────────────────────────────────────────────────

/** Shape of computed detail records for a single employee payroll item. */
type RunItemInput = {
    employeeId: string;
    workDays: Decimal;
    basicSalary: Decimal;
    proratedSalary: Decimal;
    grossTaxableIncome: Decimal;
    grossSalary: Decimal;
    costToCompany: Decimal;
    totalDeductions: Decimal;
    netSalary: Decimal;
    currency: $Enums.Currency;
    isMidMonthHire: boolean;
    deductionCapBreached: boolean;
    earnings: { earningType: EarningType; label: string; amount: Decimal; isTaxable: boolean }[];
    deductions: { deductionType: $Enums.DeductionType; label: string; amount: Decimal }[];
    tax: { grossTaxableIncome: Decimal; taxBracketId: string | null; appliedRate: Decimal; appliedDeduction: Decimal; taxAmount: Decimal } | null;
    pension: { basis: PensionBasis; baseSalary: Decimal; employeeContribution: Decimal; employerContribution: Decimal } | null;
    overtime: { category: OvertimeCategory; hours: Decimal; rate: Decimal; hourlyRate: Decimal; amount: Decimal; isTaxable: boolean }[];
    allowances: { label: string; amount: Decimal; isTaxable: boolean; isExempt: boolean; exemptPercent: Decimal | null; isProrated: boolean; proratedDays: number | null }[];
    proration: { hireDate: Date; periodStart: Date; periodEnd: Date; totalDays: number; workedDays: number; proratedFactor: Decimal } | null;
};

/** Aggregated configuration snapshot for a single payroll run. */
interface PayrollRunConfig {
    workdays: WorkdaysConfig;
    taxBrackets: (TaxBracketConfig & { id: string })[];
    pensionRule: { basis: PensionBasis; employeeRate: Decimal; employerRate: Decimal };
    overtimeRules: Map<OvertimeCategory, OvertimeRuleConfig>;
    allowanceConfigs: { earningType: EarningType; label: string; isTaxable: boolean; isExempt: boolean; exemptPercent: Decimal | null }[];
}

// ─────────────────────────────────────────────────────────────
// PayrollRunService
// ─────────────────────────────────────────────────────────────

/**
 * Service for executing payroll runs against a payroll period.
 * Orchestrates the full payroll calculation: proration, allowances, overtime,
 * manual adjustments, acting allowance, gross pay, taxable income, tax, pension,
 * other deductions, and net pay.
 * Supports paginated processing for large employee populations.
 */
export class PayrollRunService {
    // ── Config loaders ───────────────────────────────────────

    /**
     * Loads the workday configuration (monthly workdays, weekly working days, daily hours)
     * for a company from the configuration table.
     */
    async loadWorkdaysConfig(companyId: number): Promise<WorkdaysConfig> {
        const keys = ["DEFAULT_MONTHLY_WORKDAYS", "WEEKLY_WORKING_DAYS", "DAILY_WORKING_HOURS", "NON_TAXABLE_TRANSPORT_EXEMPTION"];
        const configs = await prisma.configuration.findMany({
            where: { companyId, key: { in: keys } },
        });

        const get = (key: string, fallback: number) =>
            Number(configs.find((c) => c.key === key)?.value ?? fallback);

        return {
            defaultMonthlyWorkdays: get("DEFAULT_MONTHLY_WORKDAYS", 30),
            weeklyWorkingDays: get("WEEKLY_WORKING_DAYS", 6),
            dailyWorkingHours: get("DAILY_WORKING_HOURS", 8),
            nonTaxableTransportExemption: get("NON_TAXABLE_TRANSPORT_EXEMPTION", 600),
        };
    }

    /**
     * Loads active tax brackets for a company, ordered by lower bound ascending.
     * @throws {CustomError} If no tax brackets are configured.
     */
    async loadTaxBrackets(companyId: number): Promise<(TaxBracketConfig & { id: string })[]> {
        const brackets = await prisma.taxBracket.findMany({
            where: { companyId, isActive: { not: false } },
            orderBy: { lowerBound: "asc" },
        });
        if (brackets.length === 0) {
            throw new CustomError(
                httpStatus.BAD_REQUEST,
                "No tax brackets configured. Go to Configuration > Tax Brackets and add tax brackets before running payroll.",
            );
        }
        return brackets.map((b) => ({
            id: b.id,
            lowerBound: new Prisma.Decimal(b.lowerBound.toString()),
            upperBound: b.upperBound ? new Prisma.Decimal(b.upperBound.toString()) : null,
            rate: new Prisma.Decimal(b.rate.toString()),
            deductionAmount: new Prisma.Decimal(b.deductionAmount.toString()),
        }));
    }

    /**
     * Loads active pension rules for a company.
     * @throws {CustomError} If no pension rules are configured.
     */
    async loadPensionRules(companyId: number) {
        const rules = await prisma.pensionRule.findMany({
            where: { companyId, isActive: true },
        });
        if (rules.length === 0) {
            throw new CustomError(
                httpStatus.BAD_REQUEST,
                "No pension rules configured. Go to Configuration > Pension Rules and add a pension rule before running payroll.",
            );
        }
        return rules.map((r) => ({
            basis: r.basis as PensionBasis,
            employeeRate: new Prisma.Decimal(r.employeeRate.toString()),
            employerRate: new Prisma.Decimal(r.employerRate.toString()),
        }));
    }

    /**
     * Loads active overtime rules for a company, mapped by overtime category.
     */
    async loadOvertimeRules(companyId: number): Promise<Map<OvertimeCategory, OvertimeRuleConfig>> {
        const rules = await prisma.overtimeRule.findMany({
            where: { companyId, isActive: true },
        });
        const map = new Map<OvertimeCategory, OvertimeRuleConfig>();
        for (const r of rules) {
            map.set(r.category as OvertimeCategory, {
                category: r.category as OvertimeCategory,
                rate: new Prisma.Decimal(r.rate.toString()),
                weeklyCapHours: new Prisma.Decimal(r.weeklyCapHours.toString()),
                calculationBase: r.calculationBase,
                isTaxable: r.isTaxable,
                monthlyCapHours: r.monthlyCapHours ? new Prisma.Decimal(r.monthlyCapHours.toString()) : null,
            });
        }
        return map;
    }

    /**
     * Loads active allowance configurations for a company.
     */
    async loadAllowanceConfigs(companyId: number) {
        const configs = await prisma.allowanceConfig.findMany({
            where: { companyId, isActive: true },
        });
        return configs.map((c) => ({
            earningType: c.earningType as EarningType,
            label: c.label,
            isTaxable: c.isTaxable,
            isExempt: c.isExempt,
            exemptPercent: c.exemptPercent ? new Prisma.Decimal(c.exemptPercent.toString()) : null,
        }));
    }

    /**
     * Loads active employees for a company with optional pagination.
     * Includes compensation and active allowance records.
     */
    async loadActiveEmployees(companyId: number, skip?: number, take?: number) {
        const where = { companyId, status: "ACTIVE" as const };
        const [employees, total] = await Promise.all([
            prisma.employee.findMany({
                where,
                skip,
                take,
                include: {
                    compensation: true,
                    allowances: { where: { isActive: true } },
                },
                orderBy: { firstName: "asc" }
            }),
            prisma.employee.count({ where }),
        ]);
        return { employees, total };
    }

    /**
     * Loads all active employee deductions for a company, grouped by employee ID.
     */
    async loadEmployeeDeductionsForPeriod(companyId: number) {
        const deductions = await prisma.employeeDeduction.findMany({
            where: {
                companyId,
                isActive: true,
                status: $Enums.EmployeeDeductionStatus.ACTIVE,
            },
            include: { paymentPlan: true },
        });
        const grouped = new Map<string, typeof deductions>();
        for (const d of deductions) {
            const existing = grouped.get(d.employeeId) ?? [];
            existing.push(d);
            grouped.set(d.employeeId, existing);
        }
        return grouped;
    }

    /**
     * Loads manual adjustments associated with a specific payroll period.
     */
    async loadManualAdjustments(payrollPeriodId: string) {
        return prisma.manualAdjustment.findMany({
            where: { payrollRunId: payrollPeriodId },
        });
    }

    /**
     * Loads overtime records for a set of employees, scoped to the ACTIVE attendance import only.
     * This prevents pulling OT from previous imports for the same payroll period.
     */
    async loadOvertimeRecordsForPeriod(employees: string[], periodStart: Date, periodEnd: Date, activeImportId?: string) {
        // Find OvertimeRecords linked either via AttendanceRecord (per-day OT) or
        // via AttendanceMonthlySummary → AttendanceImport (column-imported OT).
        // When activeImportId is provided, restrict to that import only.
        const records = await prisma.overtimeRecord.findMany({
            where: {
                OR: [
                    {
                        attendanceRecord: {
                            employeeId: { in: employees },
                            date: { gte: periodStart, lte: periodEnd },
                            ...(activeImportId ? { attendanceImportId: activeImportId } : {}),
                        },
                    },
                    {
                        attendanceMonthlySummary: {
                            employeeId: { in: employees },
                            ...(activeImportId
                                ? { attendanceImportId: activeImportId }
                                : { attendanceImport: { payrollPeriod: { startDate: { gte: periodStart }, endDate: { lte: periodEnd } } } }),
                        },
                    },
                ],
            },
            include: {
                attendanceRecord: {
                    select: { employeeId: true },
                },
                attendanceMonthlySummary: {
                    select: { employeeId: true },
                },
            },
        });

        const grouped = new Map<string, EmployeeOvertimeRecord[]>();
        for (const r of records) {
            const empId = r.attendanceRecord?.employeeId ?? r.attendanceMonthlySummary?.employeeId;
            if (!empId) continue;
            const existing = grouped.get(empId) ?? [];
            existing.push({
                category: r.category as OvertimeCategory,
                hours: new Prisma.Decimal(r.hours.toString()),
            });
            grouped.set(empId, existing);
        }
        return grouped;
    }

    /**
     * Loads active allowance assignments (acting assignments) for all specified employees
     * that overlap with the given date range.
     */
    async loadActiveAllowancesForPeriod(employeeIds: string[], periodStart: Date, periodEnd: Date) {
        const assignments = await prisma.actingAssignment.findMany({
            where: {
                employeeId: { in: employeeIds },
                status: $Enums.ActingAssignmentStatus.ACTIVE as any,
                OR: [
                    { endDate: null },
                    { endDate: { gte: periodStart } },
                ],
                startDate: { lte: periodEnd },
            },
            include: {
                actingAllowanceRule: true,
                actingPosition: { select: { title: true } },
            },
        });

        const map = new Map<string, typeof assignments>();
        for (const a of assignments) {
            const list = map.get(a.employeeId) ?? [];
            list.push(a);
            map.set(a.employeeId, list);
        }
        return map;
    }

    /**
     * Loads actual workdays per employee from AttendanceMonthlySummary.
     * Returns a map of employeeId → actual workdays (regularHours / dailyWorkingHours).
     * Falls back gracefully when no attendance data exists.
     */
    async loadAttendanceWorkdaysMap(
        employeeIds: string[],
        periodStart: Date,
        periodEnd: Date,
        dailyWorkingHours: number,
        attendanceImportId?: string,
    ): Promise<Map<string, number>> {
        // Use actualDays from AttendancePeriodSummary (includes paid leave, excludes absence)
        // Falls back to regularHours-based calculation if no summary exists
        // When attendanceImportId is provided, filter to ONLY that import's summaries
        // (prevents pulling data from multiple imports for the same period)
        const where: any = {
            employeeId: { in: employeeIds },
        };
        if (attendanceImportId) {
            // Only use summaries from the specific (active) import
            where.attendanceImportId = attendanceImportId;
        } else {
            // Fallback: match by payroll period dates (original behaviour)
            where.attendanceImport = {
                payrollPeriod: {
                    startDate: { gte: periodStart },
                    endDate: { lte: periodEnd },
                },
            };
        }

        const summaries = await prisma.attendancePeriodSummary.findMany({
            where,
            select: {
                employeeId: true,
                actualDays: true,
                regularHours: true,
            },
        });

        const map = new Map<string, number>();
        for (const s of summaries) {
            // Prefer actualDays from summary (attendance-based)
            // Use the exact decimal value — do NOT round to integer.
            // The attendance summary computes: actualDays = workingDays - absentDays + paidLeaveDays
            // which can be fractional (e.g. 27.5). Rounding here would lose precision
            // and produce incorrect proration factors.
            if (s.actualDays && Number(s.actualDays) > 0) {
                map.set(s.employeeId, Math.max(1, Number(s.actualDays)));
            } else if (Number(s.regularHours) > 0 && dailyWorkingHours > 0) {
                // Fallback: compute from regular hours (also keep decimal)
                const workdays = Number(s.regularHours) / dailyWorkingHours;
                map.set(s.employeeId, Math.max(1, workdays));
            }
        }
        return map;
    }

    // ── Payroll period validation ────────────────────────────

    /**
     * Validates that a payroll period exists and is in a processable state.
     *
     * @param payrollPeriodId - The ID of the payroll period.
     * @param companyId - The numeric ID of the company.
     * @returns The payroll period record.
     * @throws {CustomError} If the period is not found or not in DRAFT/ACTIVE status.
     */
    async validatePayrollPeriod(payrollPeriodId: string, companyId: number) {
        const period = await prisma.payrollPeriod.findFirst({
            where: { id: payrollPeriodId, companyId },
        });
        if (!period) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll period not found");
        }
        if (period.status !== $Enums.PayrollPeriodStatus.DRAFT && period.status !== $Enums.PayrollPeriodStatus.ACTIVE) {
            throw new CustomError(httpStatus.CONFLICT, `Payroll period is in status ${period.status}. Only DRAFT or ACTIVE periods can be processed.`);
        }
        return period;
    }

    /**
     * Finds an existing payroll run for the given period (supports paginated append).
     */
    async findExistingRun(payrollPeriodId: string) {
        return prisma.payrollRun.findFirst({
            where: { payrollPeriodId },
        });
    }

    // ── Per-employee calculation ─────────────────────────────

    /**
     * Computes the full payroll calculation for a single employee.
     *
     * Steps: proration → allowances → overtime → manual adjustments → acting allowance →
     *        gross pay → taxable income → income tax → pension → other deductions → net pay
     */
    async calculateEmployeePayroll(
        employee: any,
        period: { startDate: Date; endDate: Date },
        config: PayrollRunConfig,
        data: {
            employeeDeductionsMap: Map<string, any[]>;
            overtimeRecordsMap: Map<string, EmployeeOvertimeRecord[]>;
            manualAdjustmentsByEmployee: Map<string, any[]>;
            actingAssignmentsMap: Map<string, any[]>;
            attendanceWorkdaysMap: Map<string, number>;
        },
        payrollRunItemId: string,
    ): Promise<RunItemInput> {
        logger.info({ employeeId: employee.id, payrollRunItemId }, "Calculating employee payroll");

        const { workdays, taxBrackets, pensionRule, overtimeRules, allowanceConfigs } = config;
        const basicSalary = new Prisma.Decimal(employee.compensation?.basicSalary?.toString() ?? "0");

        // ══════════════════════════════════════════════════════════════════════════════
        // STEP 1: PRORATION
        // ══════════════════════════════════════════════════════════════════════════════
        // Two proration strategies:
        //   A) Mid-month hire (hireDate > periodStart): prorate by days remaining in period
        //   B) Full-period employee: prorate by attendance ratio (actualDays / monthlyWorkdays)
        //
        // Example A (mid-month hire):
        //   hireDate = 2027-02-15, periodStart = 2027-02-01, periodEnd = 2027-02-28
        //   workedDays = 14 (Feb 15-28), totalDays = 28
        //   prorationFactor = 14/28 = 0.5
        //   basicSalary = 25,000 → proratedSalary = 12,500
        //
        // Example B (full-period, 25 days attendance out of 30):
        //   attendanceWorkdays = 25, defaultMonthlyWorkdays = 30
        //   prorationFactor = 25/30 = 0.8333
        //   basicSalary = 25,000 → proratedSalary = 20,833.33
        // ══════════════════════════════════════════════════════════════════════════════
        const hireDate = employee.hireDate ?? period.startDate;
        const hireProration = calculateProrationFactor(hireDate, period.startDate, period.endDate);
        const isMidMonthHire = hireProration.factor.lt(1);

        // Get attendance-based workdays from AttendancePeriodSummary.actualDays
        const attendanceWorkdays = data.attendanceWorkdaysMap.get(employee.id);

        let prorationFactor: Prisma.Decimal;
        let proratedSalary: Prisma.Decimal;

        if (isMidMonthHire) {
            // Mid-month hire: prorate by hire date
            prorationFactor = hireProration.factor;
            proratedSalary = basicSalary.mul(prorationFactor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        } else if (attendanceWorkdays && workdays.defaultMonthlyWorkdays > 0) {
            // Full-period employee with attendance data: prorate by attendance ratio
            // Example: actualDays=25, monthlyWorkdays=30 → factor=0.8333
            prorationFactor = new Prisma.Decimal(attendanceWorkdays).div(workdays.defaultMonthlyWorkdays);
            proratedSalary = basicSalary.mul(prorationFactor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        } else {
            // No attendance data: full salary (no proration)
            prorationFactor = new Prisma.Decimal(1);
            proratedSalary = basicSalary;
        }

        // ══════════════════════════════════════════════════════════════════════════════
        // STEP 2: ALLOWANCES (prorated by same factor as basic salary)
        // ══════════════════════════════════════════════════════════════════════════════
        // Each allowance from EmployeeAllowance is matched to an AllowanceConfig.
        // If prorationFactor < 1, allowance is prorated.
        //
        // Example (prorationFactor = 0.8333):
        //   Transportation = 3,000 → prorated = 2,500.00
        //   Telephone     = 2,000 → prorated = 1,666.67
        //   Housing       = 3,000 → prorated = 2,500.00
        // ══════════════════════════════════════════════════════════════════════════════
        type AllowanceWithEarningType = RunItemInput["allowances"][0] & { earningType: EarningType };
        const employeeAllowances: AllowanceWithEarningType[] = [];
        for (const cfg of allowanceConfigs) {
            const allowanceType = earningTypeToAllowanceType[cfg.earningType];
            if (!allowanceType) continue;

            const empAllowance = employee.allowances?.find(
                (a: any) => a.allowanceType === allowanceType,
            );
            if (!empAllowance) continue;

            const amount = new Prisma.Decimal(empAllowance.amount.toString());
            if (amount.lte(0)) continue;

            // Prorate allowance by same factor as basic salary
            const proratedAmount = prorationFactor.lt(1)
                ? amount.mul(prorationFactor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
                : amount;

            employeeAllowances.push({
                earningType: cfg.earningType,
                label: cfg.label,
                amount: proratedAmount,
                isTaxable: cfg.isTaxable,
                isExempt: cfg.isExempt,
                exemptPercent: cfg.exemptPercent,
                isProrated: prorationFactor.lt(1),
                proratedDays: null,
            });
        }

        // Sum of regular (non-acting) allowances — used to compute contracted employee
        // gross for GROSS_DIFF acting allowance. Must be computed here, before acting
        // allowance is added, so the difference is based on the employee's own gross.
        const regularAllowanceTotal = employeeAllowances.reduce(
            (sum, a) => sum.add(a.amount),
            new Prisma.Decimal(0),
        );

        // ══════════════════════════════════════════════════════════════════════════════
        // STEP 3: OVERTIME
        // ══════════════════════════════════════════════════════════════════════════════
        // Overtime pay = hours × (salary / (workingDays × dailyHours)) × overtimeRate
        //
        // Example:
        //   basicSalary = 25,000, workingDays = 30, dailyHours = 8
        //   hourlyRate = 25,000 / (30 × 8) = 104.17
        //   overtimeHours = 10, rate = 1.5
        //   overtimePay = 10 × 104.17 × 1.5 = 1,562.50
        // ══════════════════════════════════════════════════════════════════════════════
        const empOvertimeRecords = data.overtimeRecordsMap.get(employee.id) ?? [];
        const overtimeResults: RunItemInput["overtime"] = [];
        // For GROSS-basis overtime, use the computed pre-overtime gross
        // (prorated basic + allowances), NOT the contracted compensation gross.
        // This ensures prorated employees get overtime calculated on their actual pay.
        const preOvertimeGross = proratedSalary.add(
            employeeAllowances.reduce((sum, a) => sum.add(a.amount), new Prisma.Decimal(0)),
        );
        for (const rec of empOvertimeRecords) {
            const rule = overtimeRules.get(rec.category);
            if (!rule) continue;
            if (rec.hours.isZero()) continue;   // skip zero-hour records — just clutter
            const { amount, hourlyRate } = calculateOvertimeAmount(
                rec,
                rule,
                basicSalary,
                preOvertimeGross,
                workdays.defaultMonthlyWorkdays,
                workdays.dailyWorkingHours,
            );
            overtimeResults.push({
                category: rec.category,
                hours: rec.hours,
                rate: rule.rate,
                hourlyRate,
                amount: amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
                isTaxable: rule.isTaxable,
            });
        }

        // ══════════════════════════════════════════════════════════════════════════════
        // STEP 4: MANUAL ADJUSTMENTS
        // ══════════════════════════════════════════════════════════════════════════════
        // Adjustments can be taxable (bonuses, corrections) or non-taxable (reimbursements).
        // Taxable portion flows into grossTaxableIncome; non-taxable portion only affects
        // grossSalary (and thus net pay) but is excluded from income tax.
        const empAdjustments = data.manualAdjustmentsByEmployee.get(employee.id) ?? [];
        const manualAdjustmentTotal = empAdjustments.reduce(
            (sum: Decimal, a: any) => sum.add(new Prisma.Decimal(a.amount.toString())),
            new Prisma.Decimal(0),
        );
        const taxableAdjustmentTotal = empAdjustments
            .filter((a: any) => a.isTaxable !== false)
            .reduce(
                (sum: Decimal, a: any) => sum.add(new Prisma.Decimal(a.amount.toString())),
                new Prisma.Decimal(0),
            );

        // Initialize deduction accumulators — the employee-deductions loop (step 9) pushes into these arrays.
        const deductionItems: RunItemInput["deductions"] = [];
        let deductionTotal = new Prisma.Decimal(0);

        // ══════════════════════════════════════════════════════════════════════════════
        // STEP 5: ACTING ALLOWANCE
        // ══════════════════════════════════════════════════════════════════════════════
        // Two calculation methods based on ActingAllowanceRule.calculationMethod:
        //
        //   AMOUNT: use actingPositionSalary (fixed amount stored on the assignment)
        //           directly. The rule's `basis` does not apply — the amount is final.
        //           Proration is applied if attendance < full month.
        //
        //   PERCENTAGE: allowance = (actingSalary − employeeBasisSalary) × (percent / 100)
        //     Two bases depending on ActingAllowanceRule.basis:
        //       A) BASIC_DIFF: difference = actingPositionBasicSalary − employeeBasicSalary
        //       B) GROSS_DIFF: difference = actingPositionGrossSalary − employeeSubstantiveGross
        //
        //     Example GROSS_DIFF / PERCENTAGE:
        //       actingPositionGrossSalary = 80,000
        //       employeeSubstantiveGross   = 35,000
        //       difference                  = 45,000
        //       payablePercent              = 75%
        //       actingAllowance             = 45,000 × 0.75 = 33,750
        //
        // Guard: if difference/amount <= 0, no acting allowance is generated.
        // ══════════════════════════════════════════════════════════════════════════════
        const actingAssignments = data.actingAssignmentsMap.get(employee.id) ?? [];
        for (const assignment of actingAssignments) {
            if (!assignment.actingAllowanceRule) continue;

            const rule = assignment.actingAllowanceRule;
            const method = rule.calculationMethod as 'AMOUNT' | 'PERCENTAGE';

            // Determine the correct salary to compare based on the rule's basis
            // BASIC_DIFF → compare basic salaries; GROSS_DIFF → compare gross salaries
            //
            // For GROSS_DIFF: the employee's gross must be the CONTRACTED (unprorated) value,
            // because proration is applied to the RESULT, not the inputs. Since
            // preOvertimeGross = proratedSalary + allowanceTotal (both prorated), we recover
            // the unprorated gross by dividing allowanceTotal by prorationFactor.
            // When prorationFactor = 1, this equals basicSalary + allowanceTotal.
            const positionSalary = rule.basis === 'GROSS_DIFF'
                ? (assignment.actingPositionGrossSalary ?? assignment.actingPositionSalary)
                : (assignment.actingPositionBasicSalary ?? assignment.actingPositionSalary);
            const contractedEmployeeGross = prorationFactor.eq(1)
                ? basicSalary.add(regularAllowanceTotal)
                : basicSalary.add(regularAllowanceTotal.div(prorationFactor));
            const employeeBasisSalary = rule.basis === 'GROSS_DIFF'
                ? contractedEmployeeGross
                : basicSalary;

            // Ethiopian regulation: acting allowance is limited to 6 months
            // unless the assignment has been formally extended (extensionApprovedBy set).
            // This cap applies to BOTH calculation methods (AMOUNT and PERCENTAGE).
            const isExtended = !!assignment.extensionApprovedBy;
            const REGULATORY_MAX_MONTHS = 6;
            const monthsElapsed = (() => {
                const msPerDay = 86_400_000;
                if (period.endDate < assignment.startDate) return 0;
                const months = (period.endDate.getFullYear() - assignment.startDate.getFullYear()) * 12
                    + (period.endDate.getMonth() - assignment.startDate.getMonth());
                return Math.max(1, months + 1);
            })();
            const capHit = monthsElapsed > REGULATORY_MAX_MONTHS && !isExtended;

            if (capHit) {
                // 6-month regulatory cap — record a zero earning with explanatory label
                // so the payslip shows why no acting allowance was paid.
                employeeAllowances.push({
                    earningType: "ACTING_ALLOWANCE" as EarningType,
                    label: `Acting Allowance: ${assignment.actingPosition?.title || 'Acting Role'} [6-month cap — extend assignment to continue]`,
                    amount: new Prisma.Decimal(0),
                    isTaxable: true,
                    isExempt: false,
                    exemptPercent: null,
                    isProrated: false,
                    proratedDays: null,
                });
            } else if (method === 'AMOUNT') {
                // Fixed-amount method: the allowance is the actingPositionSalary stored
                // on the assignment (set during create/edit). No difference computation —
                // the amount is already final. The rule's `basis` does not apply here.
                const fixedAmt = new Prisma.Decimal(assignment.actingPositionSalary?.toString() ?? '0');
                if (fixedAmt.gt(0)) {
                    // Apply proration — spec: "apply the same attendance ratio to ALL components"
                    const proratedAmount = prorationFactor.lt(1)
                        ? fixedAmt.mul(prorationFactor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
                        : fixedAmt;
                    employeeAllowances.push({
                        earningType: "ACTING_ALLOWANCE" as EarningType,
                        label: `Acting Allowance: ${assignment.actingPosition?.title || 'Acting Role'}`,
                        amount: proratedAmount,
                        isTaxable: true,
                        isExempt: false,
                        exemptPercent: null,
                        isProrated: prorationFactor.lt(1),
                        proratedDays: null,
                    });
                }
            } else {
                // Percentage-based: load tiers from rule.tiers JSON if available,
                // otherwise build a single-tier bracket from min/max months + payablePercent.
                //
                // IMPORTANT: Both sources must produce plain-percentage values (e.g. 25 for 25%)
                // because calculateActingAllowance divides by 100 internally.
                //
                // - rule.payablePercent is stored as decimal (0.25 = 25%) → multiply by 100
                // - rule.tiers[].percent should be plain % (25 = 25%) but may have been
                //   stored as decimal by mistake → auto-detect and correct if ≤ 1
                const rawTiers: any[] = (rule.tiers as any) ?? [];

                /**
                 * Normalize a percent value to plain % (e.g. 0.25 → 25, 25 → 25).
                 *
                 * AMBIGUITY WARNING — values in (0, 1]:
                 *   Values ≤ 1 are treated as decimal format (0.25 = 25%).
                 *   A plain 1% would incorrectly become 100%.
                 *   In practice, acting allowance tiers are always ≥ 25%, so values
                 *   in (0, 1] should only ever be decimal format. If a DB row contains
                 *   a plain value ≤ 1, it is a data error — add a CHECK constraint
                 *   (percent >= 2 OR percent <= 1) on the tiers JSON to prevent this.
                 */
                const toPlainPercent = (v: unknown): number => {
                    const n = Number(v);
                    if (Number.isNaN(n) || n < 0) return 0;
                    return n <= 1 ? n * 100 : n;
                };

                const tiers: Tier[] = rawTiers.length > 0
                    ? rawTiers.map((t: any) => ({
                        startMonth: t.startMonth,
                        endMonth: t.endMonth,
                        percent: toPlainPercent(t.percent),
                    }))
                    : [
                        {
                            startMonth: rule.minimumPeriodMonths,
                            endMonth: rule.maximumPeriodMonths,
                            percent: toPlainPercent(rule.payablePercent),
                        },
                    ];

                const calc = calculateActingAllowance(
                    tiers,
                    positionSalary,
                    employeeBasisSalary,
                    assignment.startDate,
                    period.endDate,
                    'PERCENTAGE',
                    undefined,
                    isExtended,
                );

                if (calc.allowanceAmount.gt(0)) {
                    // Apply proration — spec: "apply the same attendance ratio to ALL components"
                    const proratedAmount = prorationFactor.lt(1)
                        ? calc.allowanceAmount.mul(prorationFactor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
                        : calc.allowanceAmount;
                    employeeAllowances.push({
                        earningType: "ACTING_ALLOWANCE" as EarningType,
                        label: `Acting Allowance: ${assignment.actingPosition?.title || 'Acting Role'}`,
                        amount: proratedAmount,
                        isTaxable: true,
                        isExempt: false,
                        exemptPercent: null,
                        isProrated: prorationFactor.lt(1),
                        proratedDays: null,
                    });
                }
            }
        }

        // ══════════════════════════════════════════════════════════════════════════════
        // STEP 6: GROSS SALARY
        // ══════════════════════════════════════════════════════════════════════════════
        // grossSalary = proratedBasic + totalAllowances + totalOvertime + manualAdjustments
        //
        // Example:
        //   proratedBasic     = 25,000.00
        //   totalAllowances   = 10,000.00 (transport + telephone + housing + representation)
        //   actingAllowance   = 33,750.00
        //   totalOvertime     =  1,562.50
        //   manualAdjustments =      0.00
        //   grossSalary       = 70,312.50
        // ══════════════════════════════════════════════════════════════════════════════
        const allowanceTotal = employeeAllowances.reduce(
            (sum, a) => sum.add(a.amount),
            new Prisma.Decimal(0),
        );
        const overtimeTotal = overtimeResults.reduce(
            (sum, o) => sum.add(o.amount),
            new Prisma.Decimal(0),
        );

        const grossSalary = proratedSalary
            .add(allowanceTotal)
            .add(overtimeTotal)
            .add(manualAdjustmentTotal)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

        // ══════════════════════════════════════════════════════════════════════════════
        // STEP 7: TAXABLE REMUNERATION (gross taxable income)
        // ══════════════════════════════════════════════════════════════════════════════
        // Start from the same base as grossSalary, but:
        //   - Only include TAXABLE manual adjustments (exclude non-taxable reimbursements)
        //   - Deduct non-taxable allowances and fixed transport exemption
        //
        // Non-taxable allowance calculation:
        //   - If isTaxable=false: entire amount is excluded
        //   - If isExempt=true + exemptPercent=0.20: 20% of amount is excluded
        //
        // Fixed transport exemption (Ethiopian law: 600 ETB/month):
        //   Only applies if employee has a transportation allowance.
        //   non_taxable_transport = 600 × prorationFactor
        // ══════════════════════════════════════════════════════════════════════════════
        const nonTaxableAllowanceTotal = employeeAllowances.reduce((sum, a) => {
            if (!a.isTaxable) {
                // Entire allowance is non-taxable
                return sum.add(a.amount);
            }
            if (a.isExempt && a.exemptPercent && a.exemptPercent.gt(0)) {
                // Partial exemption: exemptPercent of amount is non-taxable
                return sum.add(a.amount.mul(a.exemptPercent));
            }
            return sum;
        }, new Prisma.Decimal(0));

        // Apply fixed non-taxable transport exemption ( Ethiopian law: 600 ETB/month )
        // Only applies if the employee actually receives a transportation allowance.
        // Reuse prorationFactor already computed (attendance-based or hire-date-based)
        const hasTransportAllowance = employeeAllowances.some(
            (a) => a.earningType.includes('TRANSPORT'),
        );
        const transportExemption = hasTransportAllowance
            ? new Prisma.Decimal(workdays.nonTaxableTransportExemption).mul(prorationFactor)
            : new Prisma.Decimal(0);

        // grossTaxableIncome starts from the same base as grossSalary but swaps
        // manualAdjustmentTotal (all) for taxableAdjustmentTotal (taxable only),
        // then deducts non-taxable allowances and transport exemption.
        const grossTaxableIncome = grossSalary
            .sub(manualAdjustmentTotal)                     // remove all adjustments
            .add(taxableAdjustmentTotal)                    // add back only taxable ones
            .sub(nonTaxableAllowanceTotal)                  // exclude non-taxable allowances
            .sub(transportExemption)                        // exclude transport exemption
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

        // ══════════════════════════════════════════════════════════════════════════════
        // STEP 8: INCOME TAX
        // ══════════════════════════════════════════════════════════════════════════════
        // Progressive tax brackets from IncomeTaxBracket table.
        //
        // Example (Ethiopian tax brackets for 2027):
        //   Bracket 1: 0 – 2,400       @ 0%
        //   Bracket 2: 2,401 – 5,400   @ 10%  → 300
        //   Bracket 3: 5,401 – 11,400  @ 15%  → 900
        //   Bracket 4: 11,401 – 20,400 @ 20%  → 1,800
        //   Bracket 5: 20,401+          @ 30%
        //
        //   grossTaxableIncome = 69,712.50
        //   taxAmount = 300 + 900 + 1,800 + ((69,712.50 − 20,400) × 0.30) = 18,393.75
        // ══════════════════════════════════════════════════════════════════════════════
        const { taxAmount, appliedBracketId, appliedRate, appliedDeduction } = calculateIncomeTax(grossTaxableIncome, taxBrackets);
        const taxRecord: RunItemInput["tax"] = grossTaxableIncome.gt(0) ? {
            grossTaxableIncome,
            taxBracketId: appliedBracketId,
            appliedRate,
            appliedDeduction,
            taxAmount: taxAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        } : null;

        // ══════════════════════════════════════════════════════════════════════════════
        // STEP 9: PENSION CONTRIBUTION
        // ══════════════════════════════════════════════════════════════════════════════
        // Pension is ALWAYS calculated on Basic Earning (prorated basic salary) per spec.
        // The PensionBasis config is ignored at calculation time — pension base is
        // hardcoded to basic salary to prevent acting allowance or other earnings
        // from inflating the pension contribution.
        //
        // Example (7% employee rate, 11% employer rate):
        //   pensionBase = 50,000 (basic only)
        //   employeeContribution = 50,000 × 0.07 = 3,500.00
        //   employerContribution = 50,000 × 0.11 = 5,500.00
        // ══════════════════════════════════════════════════════════════════════════════
        const pensionBase = proratedSalary;
        const { employeeContribution, employerContribution } = calculatePension(
            pensionBase,
            pensionRule.employeeRate,
            pensionRule.employerRate,
        );

        // ══════════════════════════════════════════════════════════════════════════════
        // STEP 10: OTHER DEDUCTIONS (loans, advances, etc.)
        // ══════════════════════════════════════════════════════════════════════════════
        // Deduction types:
        //   FIXED_AMOUNT:            fixed monthly deduction
        //   PERCENTAGE_OF_BASIC:     deduction = basicSalary × (percent / 100)
        //   PERCENTAGE_OF_GROSS:     deduction = grossSalary × (percent / 100)
        //   REMAINING_BALANCE:       deduction = (totalAmount − paidAmount) / remainingInstallments
        // ══════════════════════════════════════════════════════════════════════════════
        const empDeductions = data.employeeDeductionsMap.get(employee.id) ?? [];

        for (const d of empDeductions) {
            let periodAmount: Prisma.Decimal;

            switch (d.calculationType) {
                case $Enums.DeductionCalculationType.FIXED_AMOUNT:
                    periodAmount = new Prisma.Decimal(d.amount?.toString() ?? "0");
                    break;

                case $Enums.DeductionCalculationType.PERCENTAGE_OF_BASIC: {
                    const pct = new Prisma.Decimal(d.percent?.toString() ?? "0");
                    periodAmount = basicSalary.mul(pct).div(100);
                    break;
                }

                case $Enums.DeductionCalculationType.PERCENTAGE_OF_GROSS: {
                    const pct = new Prisma.Decimal(d.percent?.toString() ?? "0");
                    periodAmount = grossSalary.mul(pct).div(100);
                    break;
                }

                case $Enums.DeductionCalculationType.REMAINING_BALANCE: {
                    const plan = d.paymentPlan;
                    const total = new Prisma.Decimal(plan?.totalAmount?.toString() ?? "0");
                    const paid = new Prisma.Decimal(plan?.paidAmount?.toString() ?? "0");
                    const remaining = total.sub(paid);
                    const installments = plan?.numInstallments && plan.numInstallments > 0
                        ? plan.numInstallments
                        : 1;
                    const paidInst = plan?.paidInstallments ?? 0;
                    const remainingInst = Math.max(1, installments - paidInst);
                    periodAmount = Prisma.Decimal.max(
                        remaining.div(remainingInst),
                        new Prisma.Decimal(0),
                    );
                    break;
                }

                default:
                    periodAmount = new Prisma.Decimal(0);
            }

            periodAmount = periodAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
            deductionTotal = deductionTotal.add(periodAmount);
            deductionItems.push({
                deductionType: d.deductionType as $Enums.DeductionType,
                label: d.label || "Employee Deduction",
                amount: periodAmount,
            });
        }

        // ══════════════════════════════════════════════════════════════════════════════
        // STEP 11: TOTAL DEDUCTIONS & DEDUCTION CAP CHECK
        // ══════════════════════════════════════════════════════════════════════════════
        // totalDeductions = tax + pensionEmployee + otherDeductions
        // Deduction cap: total deductions must not exceed 70% of basic salary
        // ══════════════════════════════════════════════════════════════════════════════
        const totalDeductions = taxAmount
            .add(employeeContribution)
            .add(deductionTotal)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

        const deductionCapBreached = isDeductionCapBreached(totalDeductions, basicSalary);

        // ══════════════════════════════════════════════════════════════════════════════
        // STEP 12: COST TO COMPANY & NET PAY
        // ══════════════════════════════════════════════════════════════════════════════
        // Cost to Company (CTC) = proratedBasic + totalAllowances + employerPension
        //   (employer's cost, not employee's take-home)
        //
        // Net Salary = grossSalary − totalDeductions
        //   (guaranteed minimum: max(netSalary, 0))
        //
        // Example:
        //   costToCompany = 25,000 + 10,000 + 7,734.38 = 42,734.38
        //   netSalary     = 70,312.50 − 23,315.63 = 46,996.87
        // ══════════════════════════════════════════════════════════════════════════════
        const costToCompany = proratedSalary
            .add(allowanceTotal)
            .add(employerContribution)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

        const netSalary = grossSalary.sub(totalDeductions);

        return {
            employeeId: employee.id,
            workDays: new Prisma.Decimal(workdays.defaultMonthlyWorkdays),
            basicSalary,
            proratedSalary,
            grossTaxableIncome,
            grossSalary,
            costToCompany,
            totalDeductions,
            netSalary: Prisma.Decimal.max(netSalary, new Prisma.Decimal(0)),
            currency: employee.currency as $Enums.Currency,
            isMidMonthHire,
            deductionCapBreached,
            earnings: [
                { earningType: "BASIC_SALARY" as EarningType, label: "Basic Salary", amount: proratedSalary, isTaxable: true },
                ...employeeAllowances.map((a) => ({
                    earningType: a.earningType,
                    label: a.label,
                    amount: a.amount,
                    isTaxable: a.isTaxable,
                })),
                ...overtimeResults.map((o) => ({
                    earningType: "OVERTIME" as EarningType,
                    label: `Overtime (${o.category})`,
                    amount: o.amount,
                    isTaxable: o.isTaxable,
                })),
                ...empAdjustments.map((a: any) => ({
                    earningType: "OTHER" as EarningType,
                    label: a.reason || "Manual Adjustment",
                    amount: new Prisma.Decimal(a.amount.toString()),
                    isTaxable: a.isTaxable !== false,
                })),
            ],
            deductions: [
                ...(taxRecord ? [{ deductionType: "EMPLOYMENT_INCOME_TAX" as $Enums.DeductionType, label: "Income Tax", amount: taxRecord.taxAmount }] : []),
                { deductionType: "PENSION_EMPLOYEE" as $Enums.DeductionType, label: "Employee Pension", amount: employeeContribution },
                ...deductionItems,
            ],
            tax: taxRecord,
            pension: {
                basis: "BASIC" as $Enums.PensionBasis,
                baseSalary: pensionBase,
                employeeContribution,
                employerContribution,
            },
            overtime: overtimeResults,
            allowances: employeeAllowances,
            proration: isMidMonthHire
                ? {
                    hireDate,
                    periodStart: period.startDate,
                    periodEnd: period.endDate,
                    totalDays: hireProration.totalDays,
                    workedDays: hireProration.workedDays,
                    proratedFactor: hireProration.factor,
                }
                : null,
        };
    }

    // ── Payroll run persistence ──────────────────────────────

    /**
     * Persists computed payroll items by updating the pre-created PayrollRunItems
     * and creating all detail records (earnings, deductions, tax, pension, overtime,
     * allowances, proration) in a single transaction.
     *
     * This method assumes the PayrollRun and PayrollRunItems have already been
     * created by `runPayroll`.
     */
    async persistPayrollRun(
        items: RunItemInput[],
        payrollRunId: string,
        payrollRunItemIds: string[],
        page: number,
    ) {
        const totalGross = items.reduce((sum, i) => sum.add(i.grossSalary), new Prisma.Decimal(0));
        const totalNet = items.reduce((sum, i) => sum.add(i.netSalary), new Prisma.Decimal(0));
        const totalTax = items.reduce((sum, i) => sum.add(i.tax?.taxAmount ?? new Prisma.Decimal(0)), new Prisma.Decimal(0));
        const totalPension = items.reduce((sum, i) => sum.add(i.pension?.employeeContribution ?? new Prisma.Decimal(0)), new Prisma.Decimal(0));
        const totalOvertime = items.reduce((sum, i) => sum.add(i.overtime.reduce((s, o) => s.add(o.amount), new Prisma.Decimal(0))), new Prisma.Decimal(0));
        const totalCostToCompany = items.reduce((sum, i) => sum.add(i.costToCompany), new Prisma.Decimal(0));
        const totalBonus = new Prisma.Decimal(0);

        return prisma.$transaction(
            async (tx) => {
            // Update PayrollRun aggregates
            if (page <= 1) {
                // First page of a fresh run or re-run — set aggregates
                await tx.payrollRun.update({
                    where: { id: payrollRunId },
                    data: {
                        totalGross: totalGross.toDecimalPlaces(2),
                        totalNet: totalNet.toDecimalPlaces(2),
                        totalTax: totalTax.toDecimalPlaces(2),
                        totalPension: totalPension.toDecimalPlaces(2),
                        totalBonus: totalBonus.toDecimalPlaces(2),
                        totalOvertime: totalOvertime.toDecimalPlaces(2),
                        totalCostToCompany: totalCostToCompany.toDecimalPlaces(2),
                        employeeCount: items.length,
                    },
                });
            } else {
                // Subsequent pages — increment aggregates
                await tx.payrollRun.update({
                    where: { id: payrollRunId },
                    data: {
                        totalGross: { increment: totalGross.toDecimalPlaces(2) },
                        totalNet: { increment: totalNet.toDecimalPlaces(2) },
                        totalTax: { increment: totalTax.toDecimalPlaces(2) },
                        totalPension: { increment: totalPension.toDecimalPlaces(2) },
                        totalOvertime: { increment: totalOvertime.toDecimalPlaces(2) },
                        totalCostToCompany: { increment: totalCostToCompany.toDecimalPlaces(2) },
                        employeeCount: { increment: items.length },
                    },
                });
            }

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const runItemId = payrollRunItemIds[i];

                // Update the pre-created PayrollRunItem with computed values
                await tx.payrollRunItem.update({
                    where: { id: runItemId },
                    data: {
                        workDays: item.workDays,
                        basicSalary: item.basicSalary.toDecimalPlaces(2),
                        proratedSalary: item.proratedSalary.toDecimalPlaces(2),
                        grossTaxableIncome: item.grossTaxableIncome.toDecimalPlaces(2),
                        grossSalary: item.grossSalary.toDecimalPlaces(2),
                        costToCompany: item.costToCompany.toDecimalPlaces(2),
                        totalDeductions: item.totalDeductions.toDecimalPlaces(2),
                        netSalary: item.netSalary.toDecimalPlaces(2),
                        currency: item.currency,
                        isMidMonthHire: item.isMidMonthHire,
                        deductionCapBreached: item.deductionCapBreached,
                    },
                });

                // Earnings
                if (item.earnings.length > 0) {
                    await tx.payrollEarning.createMany({
                        data: item.earnings.map((e) => ({
                            payrollRunItemId: runItemId,
                            earningType: e.earningType,
                            label: e.label,
                            amount: e.amount.toDecimalPlaces(2),
                            isTaxable: e.isTaxable,
                        })),
                    });
                }

                // Deductions
                if (item.deductions.length > 0) {
                    await tx.payrollDeduction.createMany({
                        data: item.deductions.map((d) => ({
                            payrollRunItemId: runItemId,
                            deductionType: d.deductionType,
                            label: d.label,
                            amount: d.amount.toDecimalPlaces(2),
                        })),
                    });
                }

                // Tax
                if (item.tax) {
                    await tx.payrollTax.create({
                        data: {
                            payrollRunItemId: runItemId,
                            taxBracketId: item.tax.taxBracketId,
                            appliedRate: item.tax.appliedRate.toDecimalPlaces(4),
                            appliedDeduction: item.tax.appliedDeduction.toDecimalPlaces(2),
                            taxAmount: item.tax.taxAmount.toDecimalPlaces(2),
                        },
                    });
                }

                // Pension
                if (item.pension) {
                    await tx.payrollPension.create({
                        data: {
                            payrollRunItemId: runItemId,
                            basis: item.pension.basis,
                            baseSalary: item.pension.baseSalary.toDecimalPlaces(2),
                            employeeContribution: item.pension.employeeContribution.toDecimalPlaces(2),
                            employerContribution: item.pension.employerContribution.toDecimalPlaces(2),
                        },
                    });
                }

                // Overtime
                if (item.overtime.length > 0) {
                    await tx.payrollOvertime.createMany({
                        data: item.overtime.map((o) => ({
                            payrollRunItemId: runItemId,
                            category: o.category,
                            hours: o.hours.toDecimalPlaces(2),
                            rate: o.rate.toDecimalPlaces(4),
                            hourlyRate: o.hourlyRate.toDecimalPlaces(2),
                            amount: o.amount.toDecimalPlaces(2),
                            isTaxable: o.isTaxable,
                        })),
                    });
                }

                // Allowances
                if (item.allowances.length > 0) {
                    await tx.payrollAllowance.createMany({
                        data: item.allowances.map((a) => ({
                            payrollRunItemId: runItemId,
                            label: a.label,
                            amount: a.amount.toDecimalPlaces(2),
                            isTaxable: a.isTaxable,
                            isProrated: a.isProrated,
                            proratedDays: a.proratedDays,
                        })),
                    });
                }

                // Proration
                if (item.proration) {
                    await tx.payrollProration.create({
                        data: {
                            payrollRunItemId: runItemId,
                            hireDate: item.proration.hireDate,
                            periodStart: item.proration.periodStart,
                            periodEnd: item.proration.periodEnd,
                            totalDays: item.proration.totalDays,
                            workedDays: item.proration.workedDays,
                            proratedFactor: item.proration.proratedFactor.toDecimalPlaces(6),
                        },
                    });
                }
            }

            return { payrollRunId };
        },
        { timeout: 120000 }); // 2-minute timeout for large batches
    }

    // ── Payroll run orchestrator ─────────────────────────────

    /**
     * Run payroll for a given period.
     * Orchestrates: validation → config loading → PayrollRun + Item creation →
     * per-employee computation → detail persistence.
     * Supports paginated processing for large employee populations.
     */
    async runPayroll(
        companyId: number,
        userId: number,
        payrollPeriodId: string,
        page: number = 1,
        limit: number = 100,
        batchId?: string,
        employeeId?: string,
    ): Promise<{ payrollRunId: string; totalEmployees: number; processedCount: number; hasMore: boolean }> {
        // Validate period
        const period = await this.validatePayrollPeriod(payrollPeriodId, companyId);

        // Check for existing run — page 1 creates, pages 2+ append
        // When batchId is provided, look for a run specifically for that batch
        // (so different batches each get their own run)
        let existingRun: { id: string } | null;
        if (batchId) {
            existingRun = await prisma.payrollRun.findFirst({
                where: { payrollPeriodId, payrollBatchId: batchId },
            });
        } else {
            existingRun = await this.findExistingRun(payrollPeriodId);
        }
        const isFirstPage = !existingRun;
        const isReRunOnFirstPage = !!existingRun && page <= 1;

        // Load configs (unconditionally needed for per-employee calculation)
        const [workdays, taxBrackets, pensionRules, overtimeRules, allowanceConfigs] =
            await Promise.all([
                this.loadWorkdaysConfig(companyId),
                this.loadTaxBrackets(companyId),
                this.loadPensionRules(companyId),
                this.loadOvertimeRules(companyId),
                this.loadAllowanceConfigs(companyId),
            ]);

        // Load employees — if employeeId provided, load only that employee;
        // if batchId provided, load only batch employees; otherwise use the active import's employees
        let employees: any[];
        let totalEmployees: number;
        const skip = (page - 1) * limit;

        // Find the active attendance import for this period (used for employee filtering)
        const activeImport = await prisma.attendanceImport.findFirst({
            where: { payrollPeriodId, isActive: true },
            select: { id: true, totalEmployees: true, processedAt: true },
        });

        // Block re-processing of already-processed imports
        // Batches and single-employee mode are exempt — they can run independently
        if (activeImport?.processedAt && !employeeId && !batchId) {
            throw new CustomError(
                httpStatus.BAD_REQUEST,
                `This attendance import was already processed on ${activeImport.processedAt.toLocaleDateString()}. Import new attendance data or reactivate a different import to process again.`,
            );
        }

        if (employeeId) {
            // Single employee mode — load one specific employee
            const singleEmployee = await prisma.employee.findFirst({
                where: { id: employeeId, status: "ACTIVE" },
                include: {
                    compensation: { select: { basicSalary: true, grossSalary: true } },
                    allowances: true,
                },
            });
            if (!singleEmployee) {
                throw new CustomError(httpStatus.BAD_REQUEST, `Employee ${employeeId} not found or not active.`);
            }
            employees = [singleEmployee];
            totalEmployees = 1;
        } else if (batchId) {
            // Load employees belonging to the batch
            const batchEmployees = await prisma.payrollBatchEmployee.findMany({
                where: { payrollBatchId: batchId },
                select: { employeeId: true },
            });
            const batchEmployeeIds = batchEmployees.map((be) => be.employeeId);
            totalEmployees = batchEmployeeIds.length;

            employees = await prisma.employee.findMany({
                where: { id: { in: batchEmployeeIds }, status: "ACTIVE" },
                skip,
                take: limit,
                include: {
                    compensation: { select: { basicSalary: true, grossSalary: true } },
                    allowances: true,
                },
            });
        } else {
            // "All Employees (Attendance)" — use the ACTIVE import's employees
            if (!activeImport) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    "No active attendance import for this period. Activate an attendance import before processing payroll.",
                );
            }

            // Get employee IDs from the active import's summaries
            const activeImportSummaries = await prisma.attendancePeriodSummary.findMany({
                where: { attendanceImportId: activeImport.id },
                select: { employeeId: true },
            });
            const importEmployeeIds = [...new Set(activeImportSummaries.map((s) => s.employeeId))];

            if (importEmployeeIds.length === 0) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    "The active attendance import has no employee summaries. Re-import attendance data before processing.",
                );
            }

            totalEmployees = importEmployeeIds.length;
            employees = await prisma.employee.findMany({
                where: { id: { in: importEmployeeIds }, status: "ACTIVE" },
                skip,
                take: limit,
                include: {
                    compensation: { select: { basicSalary: true, grossSalary: true } },
                    allowances: { where: { isActive: true } },
                },
                orderBy: { firstName: "asc" },
            });
        }

        if (employees.length === 0) {
            if (page === 1) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    batchId
                        ? "No active employees found in the selected batch."
                        : "No active employees found. Sync employees from the Employee Management System and import attendance before running payroll.",
                );
            }
            throw new CustomError(httpStatus.NOT_FOUND, "No more employees to process on this page.");
        }

        const allEmployeeIds = employees.map((e) => e.id);

        // Load per-employee data in parallel (uses ALL employee IDs before filtering)
        const [employeeDeductionsMap, overtimeRecordsMap, manualAdjustments, actingAssignmentsMap, attendanceWorkdaysMap] = await Promise.all([
            this.loadEmployeeDeductionsForPeriod(companyId),
            this.loadOvertimeRecordsForPeriod(allEmployeeIds, period.startDate, period.endDate, activeImport?.id),
            this.loadManualAdjustments(payrollPeriodId),
            this.loadActiveAllowancesForPeriod(allEmployeeIds, period.startDate, period.endDate),
            this.loadAttendanceWorkdaysMap(allEmployeeIds, period.startDate, period.endDate, workdays.dailyWorkingHours, activeImport?.id),
        ]);

        // ──────────────────────────────────────────────────────────
        // Filter: skip full-period employees with no attendance data.
        // Mid-month hires are kept (they use hire-date proration).
        // ──────────────────────────────────────────────────────────
        const filteredEmployees = employees.filter((emp) => {
            const hireDate = emp.hireDate ?? period.startDate;
            const hireProration = calculateProrationFactor(hireDate, period.startDate, period.endDate);
            const isMidMonthHire = hireProration.factor.lt(1);
            if (isMidMonthHire) return true; // mid-month hires always included
            return attendanceWorkdaysMap.has(emp.id); // full-period: must have attendance
        });

        const skippedCount = employees.length - filteredEmployees.length;
        if (filteredEmployees.length === 0 && employees.length > 0) {
            throw new CustomError(
                httpStatus.BAD_REQUEST,
                `All ${skippedCount} employee(s) have no attendance records for this period. Import attendance data before running payroll.`,
            );
        }

        // Update employee list and IDs after filtering
        employees = filteredEmployees;
        const employeeIds = employees.map((e) => e.id);
        const processedCount = employees.length;
        const hasMore = (skip + processedCount) < totalEmployees;

        // Group manual adjustments by employee
        const manualAdjustmentsByEmployee = new Map<string, typeof manualAdjustments>();
        for (const adj of manualAdjustments) {
            const list = manualAdjustmentsByEmployee.get(adj.employeeId) ?? [];
            list.push(adj);
            manualAdjustmentsByEmployee.set(adj.employeeId, list);
        }

        // Select pension rule — require BASIC basis (pension is always on basic earning per spec)
        const pensionRule = pensionRules.find((r) => r.basis === $Enums.PensionBasis.BASIC);
        if (!pensionRule) {
            throw new CustomError(
                httpStatus.BAD_REQUEST,
                "No pension rule with BASIC basis configured. Go to Configuration > Pension Rules and add a pension rule with basis set to BASIC before running payroll.",
            );
        }

        // Build config snapshot for per-employee calculation
        const config: PayrollRunConfig = {
            workdays,
            taxBrackets,
            pensionRule,
            overtimeRules,
            allowanceConfigs,
        };

        const data = { employeeDeductionsMap, overtimeRecordsMap, manualAdjustmentsByEmployee, actingAssignmentsMap, attendanceWorkdaysMap };

        // ──────────────────────────────────────────────────────────
        // Phase 1 — Create PayrollRun + PayrollRunItems
        // ──────────────────────────────────────────────────────────

        let payrollRunId: string;

        // On page 1 of a re-run, delete existing items + children first
        // For single employee mode, only delete that employee's existing item (not all items)
        if (isReRunOnFirstPage) {
            if (employeeId) {
                // Single employee re-calculation: delete only this employee's existing item
                const existingItem = await prisma.payrollRunItem.findFirst({
                    where: { payrollRunId: existingRun!.id, employeeId },
                    select: { id: true },
                });
                if (existingItem) {
                    await prisma.payrollProration.deleteMany({ where: { payrollRunItemId: existingItem.id } });
                    await prisma.payrollAllowance.deleteMany({ where: { payrollRunItemId: existingItem.id } });
                    await prisma.payrollOvertime.deleteMany({ where: { payrollRunItemId: existingItem.id } });
                    await prisma.payrollPension.deleteMany({ where: { payrollRunItemId: existingItem.id } });
                    await prisma.payrollTax.deleteMany({ where: { payrollRunItemId: existingItem.id } });
                    await prisma.payrollDeduction.deleteMany({ where: { payrollRunItemId: existingItem.id } });
                    await prisma.payrollEarning.deleteMany({ where: { payrollRunItemId: existingItem.id } });
                    await prisma.payrollRunItem.delete({ where: { id: existingItem.id } });
                }
            } else {
                // Batch re-run: delete ALL items for this run
                const oldItems = await prisma.payrollRunItem.findMany({
                    where: { payrollRunId: existingRun!.id },
                    select: { id: true },
                });
                const oldItemIds = oldItems.map((i) => i.id);
                if (oldItemIds.length > 0) {
                    await prisma.payrollProration.deleteMany({ where: { payrollRunItemId: { in: oldItemIds } } });
                    await prisma.payrollAllowance.deleteMany({ where: { payrollRunItemId: { in: oldItemIds } } });
                    await prisma.payrollOvertime.deleteMany({ where: { payrollRunItemId: { in: oldItemIds } } });
                    await prisma.payrollPension.deleteMany({ where: { payrollRunItemId: { in: oldItemIds } } });
                    await prisma.payrollTax.deleteMany({ where: { payrollRunItemId: { in: oldItemIds } } });
                    await prisma.payrollDeduction.deleteMany({ where: { payrollRunItemId: { in: oldItemIds } } });
                    await prisma.payrollEarning.deleteMany({ where: { payrollRunItemId: { in: oldItemIds } } });
                    await prisma.payrollRunItem.deleteMany({ where: { id: { in: oldItemIds } } });
                }
            }
        }

        // Adjust aggregates for re-runs:
        // - Batch re-run: zero-reset all aggregates (all items will be recalculated)
        // - Single-employee re-run: decrement the old employee's values from aggregates
        //   (only that employee is being recalculated, others remain)
        if (isReRunOnFirstPage) {
            if (employeeId) {
                // Single-employee: read old item before deletion and subtract from aggregates
                const oldItem = await prisma.payrollRunItem.findFirst({
                    where: { payrollRunId: existingRun!.id, employeeId },
                    select: {
                        grossSalary: true, netSalary: true,
                        totalDeductions: true, costToCompany: true,
                    },
                });
                if (oldItem) {
                    await prisma.payrollRun.update({
                        where: { id: existingRun!.id },
                        data: {
                            totalGross: { decrement: oldItem.grossSalary },
                            totalNet: { decrement: oldItem.netSalary },
                            totalTax: { decrement: new Prisma.Decimal(0) }, // tax is recalculated below
                            totalPension: { decrement: new Prisma.Decimal(0) }, // pension is recalculated below
                            totalBonus: { decrement: new Prisma.Decimal(0) },
                            totalOvertime: { decrement: new Prisma.Decimal(0) },
                            totalCostToCompany: { decrement: oldItem.costToCompany },
                            employeeCount: { decrement: 1 },
                        },
                    });
                }
            } else {
                // Batch re-run: zero-reset all aggregates
                await prisma.payrollRun.update({
                    where: { id: existingRun!.id },
                    data: {
                        totalGross: new Prisma.Decimal(0),
                        totalNet: new Prisma.Decimal(0),
                        totalTax: new Prisma.Decimal(0),
                        totalPension: new Prisma.Decimal(0),
                        totalBonus: new Prisma.Decimal(0),
                        totalOvertime: new Prisma.Decimal(0),
                        totalCostToCompany: new Prisma.Decimal(0),
                        employeeCount: 0,
                    },
                });
            }
        }

        if (isFirstPage) {
            const run = await prisma.payrollRun.create({
                data: {
                    payrollPeriod: { connect: { id: payrollPeriodId } },
                    ...(batchId ? { payrollBatch: { connect: { id: batchId } } } : {}),
                    status: PayrollStatusConst.DRAFT,
                    totalGross: new Prisma.Decimal(0),
                    totalNet: new Prisma.Decimal(0),
                    totalTax: new Prisma.Decimal(0),
                    totalPension: new Prisma.Decimal(0),
                    totalBonus: new Prisma.Decimal(0),
                    totalOvertime: new Prisma.Decimal(0),
                    totalCostToCompany: new Prisma.Decimal(0),
                    employeeCount: 0,
                    monthlyWorkdays: workdays.defaultMonthlyWorkdays,
                    createdBy: userId,
                },
            });
            payrollRunId = run.id;

            // Update period status (only on first page, first run)
            await prisma.payrollPeriod.update({
                where: { id: payrollPeriodId },
                data: { status: $Enums.PayrollPeriodStatus.ACTIVE },
            });
        } else {
            payrollRunId = existingRun!.id;
        }

        // Create PayrollRunItems for each employee (placeholder values, updated after calculation)
        const payrollRunItems = await Promise.all(
            employees.map((employee) =>
                prisma.payrollRunItem.create({
                    data: {
                        payrollRunId,
                        employeeId: employee.id,
                        workDays: new Prisma.Decimal(0),
                        basicSalary: new Prisma.Decimal(0),
                        proratedSalary: new Prisma.Decimal(0),
                        grossTaxableIncome: new Prisma.Decimal(0),
                        grossSalary: new Prisma.Decimal(0),
                        totalDeductions: new Prisma.Decimal(0),
                        netSalary: new Prisma.Decimal(0),
                        currency: employee.currency as $Enums.Currency,
                    },
                })
            ),
        );

        // ──────────────────────────────────────────────────────────
        // Phase 2 — Calculate payroll for each employee
        // ──────────────────────────────────────────────────────────
        const items: RunItemInput[] = await Promise.all(
            employees.map((employee, index) =>
                this.calculateEmployeePayroll(
                    employee, period, config, data, payrollRunItems[index].id,
                ),
            ),
        );

        // ──────────────────────────────────────────────────────────
        // Phase 4 — Persist detail records
        // ──────────────────────────────────────────────────────────
        // Update the PayrollRunItems with computed values and create
        // all detail records (earnings, deductions, tax, etc.).
        const result = await this.persistPayrollRun(
            items, payrollRunId, payrollRunItems.map(i => i.id),
            page,
        );

        // Mark the active import as processed on the first page run of a non-batch flow
        // Batches each get their own PayrollRun, so the import stays open for other batches
        if (isFirstPage && activeImport && !batchId) {
            await prisma.attendanceImport.update({
                where: { id: activeImport.id },
                data: { processedAt: new Date() },
            });
        }

        // After a batch run, check if ALL employees in the period have been processed
        // across all batches. If so, mark the import as fully processed to prevent
        // any further runs.
        if (activeImport && batchId) {
            const totalImportEmployees = await prisma.attendancePeriodSummary.groupBy({
                by: ["employeeId"],
                where: {
                    attendanceImport: { payrollPeriodId },
                },
            });
            const totalImportCount = totalImportEmployees.length;

            const processedRuns = await prisma.payrollRun.findMany({
                where: { payrollPeriodId },
                select: { id: true },
            });
            const processedRunIds = processedRuns.map(r => r.id);

            const processedEmployees = await prisma.payrollRunItem.groupBy({
                by: ["employeeId"],
                where: { payrollRunId: { in: processedRunIds } },
            });

            if (totalImportCount > 0 && processedEmployees.length >= totalImportCount) {
                await prisma.attendanceImport.update({
                    where: { id: activeImport.id },
                    data: { processedAt: new Date() },
                });
            }
        }

        return { ...result, totalEmployees, processedCount, hasMore };
    }

    // ── Read methods ─────────────────────────────────────────

    /**
     * Retrieves a paginated list of payroll runs for a company, ordered by creation date descending.
     */
    async getPayrollRuns(companyId: number, skip: number, take: number, payrollPeriodId?: string) {
        const where: Prisma.PayrollRunWhereInput = {
            payrollPeriod: { companyId },
            ...(payrollPeriodId ? { payrollPeriodId } : {}),
        };
        const [runs, totalItems] = await Promise.all([
            prisma.payrollRun.findMany({
                where,
                include: { payrollPeriod: { select: { name: true, startDate: true, endDate: true } } },
                skip,
                take,
                orderBy: { createdAt: "desc" },
            }),
            prisma.payrollRun.count({ where }),
        ]);
        return { runs, totalItems };
    }

    /**
     * Retrieves a single payroll run by ID, scoped to a company.
     * @throws {CustomError} If the payroll run is not found.
     */
    async getPayrollRun(companyId: number, runId: string) {
        const run = await prisma.payrollRun.findFirst({
            where: { id: runId, payrollPeriod: { companyId } },
            include: {
                payrollPeriod: { select: { name: true, startDate: true, endDate: true, cycle: true } },
            },
        });
        if (!run) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll run not found");
        }
        return run;
    }

    /**
     * Retrieves paginated payroll run items for a specific run, including employee details.
     * @throws {CustomError} If the payroll run is not found.
     */
    async getPayrollRunItems(companyId: number, runId: string, skip: number, take: number) {
        const run = await prisma.payrollRun.findFirst({
            where: { id: runId, payrollPeriod: { companyId } },
            select: { id: true },
        });
        if (!run) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll run not found");
        }

        const [items, totalItems] = await Promise.all([
            prisma.payrollRunItem.findMany({
                where: { payrollRunId: runId },
                include: {
                    employee: {
                        select: { id: true, firstName: true, lastName: true, department: { select: { name: true } }, tinNumber: true },
                    },
                    payrollAllowances: { select: { amount: true } },
                },
                skip,
                take,
                orderBy: { createdAt: "asc" },
            }),
            prisma.payrollRunItem.count({ where: { payrollRunId: runId } }),
        ]);

        // Flatten department name in each item
        for (const item of items) {
            (item.employee as any).departmentName = (item.employee as any).department?.name ?? null;
            delete (item.employee as any).department;
        }
        return { items, totalItems };
    }

    /**
     * Retrieves a single payroll run item with full detail (earnings, deductions, tax, pension, overtime,
     * allowances, proration, and bonuses).
     * @throws {CustomError} If the payroll run or item is not found.
     */
    async getPayrollRunItem(companyId: number, runId: string, itemId: string) {
        const run = await prisma.payrollRun.findFirst({
            where: { id: runId, payrollPeriod: { companyId } },
            select: { id: true },
        });
        if (!run) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll run not found");
        }

        const item = await prisma.payrollRunItem.findFirst({
            where: { id: itemId, payrollRunId: runId },
            include: {
                employee: {
                    select: {
                        id: true, firstName: true, lastName: true, department: { select: { name: true } },
                        tinNumber: true, jobPosition: true, hireDate: true,
                        compensation: {
                            select: {
                                basicSalary: true,
                                grossSalary: true,
                            }
                        }
                    },
                },
                payrollEarnings: true,
                payrollDeductions: true,
                payrollTax: true,
                payrollPension: true,
                payrollOvertime: true,
                payrollAllowances: true,
                payrollProration: true,
                payrollBonuses: { include: { bonusRule: true } },
            },
        });
        if (!item) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll run item not found");
        }
        // Flatten department name
        (item.employee as any).departmentName = (item.employee as any).department?.name ?? null;
        delete (item.employee as any).department;

        // Add acting allowance tier breakdown if there's an ACTING_ALLOWANCE earning
        const hasActingEarning = item.payrollEarnings.some(
            (e: any) => e.earningType === 'ACTING_ALLOWANCE' && Number(e.amount) > 0,
        );
        if (hasActingEarning) {
            // Find the active acting assignment for this employee during the payroll period
            const run = await prisma.payrollRun.findFirst({
                where: { id: runId },
                select: { payrollPeriod: { select: { startDate: true, endDate: true } } },
            });
            const periodStart = run?.payrollPeriod?.startDate;
            const periodEnd = run?.payrollPeriod?.endDate;
            if (periodStart && periodEnd) {
                const assignment = await prisma.actingAssignment.findFirst({
                    where: {
                        employeeId: item.employeeId,
                        status: 'ACTIVE',
                        startDate: { lte: periodEnd },
                        OR: [
                            { expectedEndDate: null },
                            { expectedEndDate: { gte: periodStart } },
                        ],
                    },
                    include: {
                        actingAllowanceRule: {
                            select: {
                                tiers: true, basis: true, calculationMethod: true,
                                minimumPeriodMonths: true, maximumPeriodMonths: true,
                                payablePercent: true,
                            },
                        },
                        employee: {
                            select: {
                                compensation: { select: { basicSalary: true, grossSalary: true } },
                            },
                        },
                    },
                });
                if (assignment?.actingAllowanceRule) {
                    const rule = assignment.actingAllowanceRule;
                    const basis = rule.basis ?? 'BASIC_DIFF';
                    // Compute salary difference
                    let salaryDiff = 0;
                    if (basis === 'GROSS_DIFF') {
                        const posGross = assignment.actingPositionGrossSalary
                            ? Number(assignment.actingPositionGrossSalary)
                            : Number(assignment.actingPositionBasicSalary ?? 0);
                        const empGross = assignment.employee?.compensation?.grossSalary
                            ? Number(assignment.employee.compensation.grossSalary) : 0;
                        salaryDiff = Math.max(0, posGross - empGross);
                    } else {
                        const posBasic = Number(assignment.actingPositionBasicSalary ?? 0);
                        const empBasic = assignment.employee?.compensation?.basicSalary
                            ? Number(assignment.employee.compensation.basicSalary) : 0;
                        salaryDiff = Math.max(0, posBasic - empBasic);
                    }

                    // Resolve tiers
                    const rawTiers: any[] = (rule.tiers as any) ?? [];
                    const toPlainPercent = (v: unknown): number => {
                        const n = Number(v);
                        if (Number.isNaN(n) || n < 0) return 0;
                        return n <= 1 ? n * 100 : n;
                    };
                    const tiers: Tier[] = rawTiers.length > 0
                        ? rawTiers.map((t: any) => ({
                            startMonth: t.startMonth,
                            endMonth: t.endMonth,
                            percent: toPlainPercent(t.percent),
                        }))
                        : [{
                            startMonth: rule.minimumPeriodMonths,
                            endMonth: rule.maximumPeriodMonths,
                            percent: toPlainPercent(rule.payablePercent),
                        }];

                    // Compute months elapsed
                    const startD = new Date(assignment.startDate);
                    const endD = new Date(periodEnd);
                    const monthsElapsed = Math.max(1,
                        (endD.getFullYear() - startD.getFullYear()) * 12
                        + (endD.getMonth() - startD.getMonth()) + 1,
                    );

                    // Build month-by-month breakdown
                    const sortedTiers = [...tiers].sort((a, b) => a.startMonth - b.startMonth);
                    const tierBreakdown = Array.from({ length: Math.min(monthsElapsed, 12) }, (_, i) => {
                        const m = i + 1;
                        const matched = sortedTiers.reduceRight<Tier | null>(
                            (found, t) => found ?? (m >= t.startMonth && (!t.endMonth || m <= t.endMonth) ? t : null),
                            null,
                        );
                        const percent = matched?.percent ?? 0;
                        const amount = salaryDiff * (percent / 100);
                        return { month: m, percent, amount };
                    });

                    (item as any).actingAllowanceBreakdown = {
                        salaryDiff,
                        monthsElapsed,
                        currentMonth: monthsElapsed,
                        tiers: sortedTiers,
                        tierBreakdown,
                    };
                }
            }
        }

        return item;
    }

    /**
     * Get the latest payroll run for a given period.
     */
    async getLatestRunForPeriod(companyId: number, payrollPeriodId: string) {
        const run = await prisma.payrollRun.findFirst({
            where: { payrollPeriodId, payrollPeriod: { companyId } },
            orderBy: { createdAt: "desc" },
            include: {
                payrollPeriod: { select: { name: true, startDate: true, endDate: true } },
            },
        });
        return run;
    }
}

export const payrollRunService = new PayrollRunService();
