/**
 * Acting Allowance — Calculation Service
 * ========================================
 *
 * Pure (stateless) functions for computing acting allowance amounts.
 * These functions are used by:
 *  1. The controller (preview endpoint) to return a preview without persisting.
 *  2. The payroll run service (Step 2b) to persist allowance during batch processing.
 *
 * Two calculation methods are supported:
 *
 * **PERCENTAGE** — Tiered percentage of the salary difference:
 *   salaryDiff     = actingPositionBasicSalary − employeeBasicSalary
 *   allowanceAmount = salaryDiff × (matchedTier.percent / 100)
 *
 * **AMOUNT** — Fixed amount regardless of salary difference or months elapsed:
 *   allowanceAmount = fixedAmount
 *   (no tier matching, no month breakdown)
 *
 * Default tier brackets (PERCENTAGE method):
 *   Month 1       →  0%   (probationary / first-month transition)
 *   Months 2–3    → 25%   (ramp-up)
 *   Months 4–5    → 50%   (half allowance)
 *   Months 6+     → 100%  (full acting allowance)
 */

import { Prisma } from "../generated/prisma";

/** A single percentage bracket in the tier table. */
export interface Tier {
    startMonth: number;
    /**
     * Last month this tier applies to. Use 0 or falsy for open-ended tiers
     * (e.g. "month 6 and above"). Tier matching checks: startMonth ≤ m ≤ endMonth,
     * so an open-ended tier (endMonth=0) matches any month ≥ startMonth.
     */
    endMonth: number;
    percent: number;
}

/** The full result of a calculation, including a per-month breakdown. */
export interface CalculationResult {
    /** Number of whole calendar months elapsed (minimum 1). Only meaningful for PERCENTAGE. */
    monthsElapsed: number;
    /** The tier bracket that applies at `monthsElapsed`, or null for AMOUNT method. */
    matchedTier: Tier | null;
    /** `actingPositionBasicSalary − employeeBasicSalary` (can be negative → zeroed out). */
    salaryDiff: Prisma.Decimal;
    /** The allowance amount payable for the current period. */
    allowanceAmount: Prisma.Decimal;
    /** Per-month detail (only populated for PERCENTAGE method). */
    monthBreakdown: { month: number; percent: number; amount: Prisma.Decimal }[];
    /** True if the 6-month regulatory cap was applied (allowance zeroed). */
    capApplied: boolean;
}

/**
 * Calculate the number of whole calendar months between two dates.
 *
 * Rules:
 *  - If `endDate < startDate` → returns 0.
 *  - A partial first month (e.g. starting on the 20th) counts as month 1.
 *  - This aligns with the business rule: an employee gets the Month-1 tier
 *    as soon as they start, even if it's mid-month.
 *
 * @param startDate — When the acting assignment started.
 * @param endDate   — The payroll period end date (usually month-end).
 * @returns Whole calendar months elapsed, minimum 1 if there's any overlap.
 */
export function calculateMonthsElapsed(startDate: Date, endDate: Date): number {
    if (endDate < startDate) return 0;
    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12
        + (endDate.getMonth() - startDate.getMonth());
    // Months are 1-indexed: the first payroll period after start is month 1.
    // e.g. start Jan 1, pay period ending Jan 31 → months=0 → return 1
    //      start Jan 1, pay period ending Jun 30 → months=5 → return 6
    return Math.max(1, months + 1);
}

/**
 * Calculate the acting allowance for a single assignment within a payroll period.
 *
 * Supports two methods:
 *  - **PERCENTAGE**: Computes allowance from salary difference × tier percentage.
 *  - **AMOUNT**: Returns the fixed amount directly.
 *
 * Ethiopian regulation limits acting allowance to 6 months total.  If the
 * assignment has been running longer than 6 months, the `isExtended` flag
 * (derived from `extensionApprovedBy` on the assignment) is required to
 * continue paying.
 *
 * @param tiers               — The tier brackets from the selected ActingAllowanceRule.
 * @param actingPositionSalary — The salary of the position being acted in (used as basic salary diff).
 * @param basicSalary          — The employee's regular basic salary.
 * @param startDate            — When the acting assignment started.
 * @param periodEndDate        — End of the payroll period (e.g. month end).
 * @param calculationMethod    — "AMOUNT" or "PERCENTAGE" (defaults to PERCENTAGE).
 * @param fixedAmount          — The fixed allowance amount (only used when method is AMOUNT).
 * @param isExtended           — Whether the assignment has been formally extended beyond 6 months.
 * @returns A CalculationResult with the allowance amount.
 */
export function calculateActingAllowance(
    tiers: Tier[],
    actingPositionSalary: Prisma.Decimal | number | string,
    basicSalary: Prisma.Decimal | number | string,
    startDate: Date,
    periodEndDate: Date,
    calculationMethod: 'AMOUNT' | 'PERCENTAGE' = 'PERCENTAGE',
    fixedAmount?: Prisma.Decimal | number | string,
    isExtended: boolean = false,
): CalculationResult {
    if (calculationMethod === 'AMOUNT') {
        const amount = fixedAmount !== undefined
            ? new Prisma.Decimal(fixedAmount)
            : new Prisma.Decimal(0);

        const monthsElapsed = calculateMonthsElapsed(startDate, periodEndDate);
        const REGULATORY_MAX_MONTHS = 6;

        // Ethiopian regulation: acting allowance capped at 6 months unless formally extended
        if (monthsElapsed > REGULATORY_MAX_MONTHS && !isExtended) {
            return {
                monthsElapsed,
                matchedTier: null,
                salaryDiff: new Prisma.Decimal(0),
                allowanceAmount: new Prisma.Decimal(0),
                monthBreakdown: [],
                capApplied: true,
            };
        }

        return {
            monthsElapsed,
            matchedTier: null,
            salaryDiff: new Prisma.Decimal(0),
            allowanceAmount: amount,
            monthBreakdown: [],
            capApplied: false,
        };
    }

    // ── PERCENTAGE method ──────────────────────────────────
    const actingSalary = new Prisma.Decimal(actingPositionSalary);
    const basic = new Prisma.Decimal(basicSalary);
    const salaryDiff = actingSalary.sub(basic);

    if (salaryDiff.lte(0)) {
        return {
            monthsElapsed: 0,
            matchedTier: null,
            salaryDiff: new Prisma.Decimal(0),
            allowanceAmount: new Prisma.Decimal(0),
            monthBreakdown: [],
            capApplied: false,
        };
    }

    const monthsElapsed = calculateMonthsElapsed(startDate, periodEndDate);
    const REGULATORY_MAX_MONTHS = 6;

    // Ethiopian regulation: acting allowance capped at 6 months unless formally extended
    if (monthsElapsed > REGULATORY_MAX_MONTHS && !isExtended) {
        return {
            monthsElapsed,
            matchedTier: null,
            salaryDiff,
            allowanceAmount: new Prisma.Decimal(0),
            monthBreakdown: [],
            capApplied: true,
        };
    }

    // Sort tiers by startMonth for predictable matching
    const sortedTiers = [...tiers].sort((a, b) => a.startMonth - b.startMonth);

    /**
     * Find the tier that applies for a given month.
     * Matches if: startMonth ≤ m AND (endMonth is open-ended OR m ≤ endMonth).
     * An open-ended tier has endMonth = 0 or falsy (meaning "month 6 and above").
     */
    const findTierForMonth = (m: number): Tier | null => {
        return sortedTiers.reduceRight<Tier | null>(
            (found, t) => found ?? (
                m >= t.startMonth && (!t.endMonth || m <= t.endMonth) ? t : null
            ),
            null,
        );
    };

    // Build a full month-by-month breakdown for UI preview / audit trail
    const monthBreakdown: { month: number; percent: number; amount: Prisma.Decimal }[] = [];
    for (let m = 1; m <= Math.max(monthsElapsed, 1); m++) {
        const tier = findTierForMonth(m);
        const percent = tier?.percent ?? 0;
        const amount = salaryDiff.mul(percent).div(100);
        monthBreakdown.push({ month: m, percent, amount });
    }

    const matchedTier = findTierForMonth(monthsElapsed);
    const allowanceAmount = matchedTier
        ? salaryDiff.mul(matchedTier.percent).div(100)
        : new Prisma.Decimal(0);

    return {
        monthsElapsed,
        matchedTier,
        salaryDiff,
        allowanceAmount,
        monthBreakdown,
        capApplied: false,
    };
}
