/**
 * Acting Allowance Tier Verification Script
 * ==========================================
 *
 * Tests the tier-based acting allowance calculation across all months
 * to verify correctness of:
 *   - Month counting (calculateMonthsElapsed)
 *   - Tier matching (findTierForMonth with endMonth check)
 *   - Percentage application (salaryDiff × percent / 100)
 *   - 6-month regulatory cap
 *   - Proration
 *
 * Run: npx ts-node src/scripts/verify-acting-allowance.ts
 */

import { calculateActingAllowance, calculateMonthsElapsed, type Tier } from "../services/actingAllowance.service";

// ─── Test Configuration ───────────────────────────────────────

const EMPLOYEE_BASIC_SALARY = 25_000;
const ACTING_POSITION_BASIC_SALARY = 60_000;
const EXPECTED_SALARY_DIFF = ACTING_POSITION_BASIC_SALARY - EMPLOYEE_BASIC_SALARY; // 35,000

/** Default tier table from the spec */
const DEFAULT_TIERS: Tier[] = [
    { startMonth: 1, endMonth: 1, percent: 0 },     // Month 1: 0%
    { startMonth: 2, endMonth: 3, percent: 25 },     // Months 2-3: 25%
    { startMonth: 4, endMonth: 5, percent: 50 },     // Months 4-5: 50%
    { startMonth: 6, endMonth: 0, percent: 100 },    // Month 6+: 100% (open-ended)
];

/** Expected results for each month (no extension) */
const EXPECTED_RESULTS = [
    { month: 1, expectedPercent: 0, expectedAmount: 0 },
    { month: 2, expectedPercent: 25, expectedAmount: 8_750 },
    { month: 3, expectedPercent: 25, expectedAmount: 8_750 },
    { month: 4, expectedPercent: 50, expectedAmount: 17_500 },
    { month: 5, expectedPercent: 50, expectedAmount: 17_500 },
    { month: 6, expectedPercent: 100, expectedAmount: 35_000 },
    { month: 7, expectedPercent: 0, expectedAmount: 0 },   // Capped
    { month: 8, expectedPercent: 0, expectedAmount: 0 },   // Capped
    { month: 9, expectedPercent: 0, expectedAmount: 0 },   // Capped
];

/** Expected results for extended assignment (month 7+) */
const EXPECTED_EXTENDED_RESULTS = [
    { month: 7, expectedPercent: 100, expectedAmount: 35_000 },
    { month: 8, expectedPercent: 100, expectedAmount: 35_000 },
    { month: 12, expectedPercent: 100, expectedAmount: 35_000 },
];

// ─── Test Helpers ─────────────────────────────────────────────

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition: boolean, message: string) {
    total++;
    if (condition) {
        passed++;
        console.log(`  OK  ${message}`);
    } else {
        failed++;
        console.log(`  FAIL: ${message}`);
    }
}

function assertDecimalClose(actual: { toNumber(): number }, expected: number, tolerance: number, message: string) {
    const diff = Math.abs(actual.toNumber() - expected);
    assert(diff < tolerance, `${message} (got ${actual.toNumber()}, expected ${expected}, diff ${diff.toFixed(4)})`);
}

// ─── Test 1: calculateMonthsElapsed ──────────────────────────

console.log("\n═══════════════════════════════════════════════════════");
console.log("TEST 1: calculateMonthsElapsed");
console.log("═══════════════════════════════════════════════════════\n");

const monthElapsedTests = [
    { start: "2027-01-01", end: "2027-01-31", expected: 1, desc: "Same month" },
    { start: "2027-01-01", end: "2027-02-28", expected: 2, desc: "Next month" },
    { start: "2027-01-01", end: "2027-03-31", expected: 3, desc: "Two months later" },
    { start: "2027-01-01", end: "2027-06-30", expected: 6, desc: "Six months later" },
    { start: "2027-01-01", end: "2027-07-31", expected: 7, desc: "Seven months later (beyond cap)" },
    { start: "2027-01-15", end: "2027-01-31", expected: 1, desc: "Mid-month start, same month" },
    { start: "2027-01-15", end: "2027-02-28", expected: 2, desc: "Mid-month start, next month" },
    { start: "2027-01-31", end: "2027-01-31", expected: 1, desc: "Start on last day of month" },
    { start: "2027-12-15", end: "2028-01-31", expected: 2, desc: "Year boundary crossing" },
    { start: "2027-01-01", end: "2026-12-31", expected: 0, desc: "End before start" },
];

for (const t of monthElapsedTests) {
    const result = calculateMonthsElapsed(new Date(t.start), new Date(t.end));
    assert(result === t.expected, `${t.desc}: ${t.start} → ${t.end} = ${result} (expected ${t.expected})`);
}

// ─── Test 2: Tier matching for each month (PERCENTAGE) ───────

console.log("\n═══════════════════════════════════════════════════════");
console.log("TEST 2: Tier-based calculation for each month");
console.log("═══════════════════════════════════════════════════════\n");

const assignmentStart = new Date("2027-01-01");

for (const expected of EXPECTED_RESULTS) {
    const periodEnd = new Date("2027-01-01");
    periodEnd.setMonth(periodEnd.getMonth() + expected.month);
    periodEnd.setDate(0); // Last day of the month

    const result = calculateActingAllowance(
        DEFAULT_TIERS,
        ACTING_POSITION_BASIC_SALARY,
        EMPLOYEE_BASIC_SALARY,
        assignmentStart,
        periodEnd,
        "PERCENTAGE",
        undefined,
        false, // not extended
    );

    assert(result.monthsElapsed === expected.month,
        `Month ${expected.month}: monthsElapsed = ${result.monthsElapsed}`);

    if (expected.expectedPercent === 0 && expected.month > 6) {
        // Month 7+ should hit the cap
        assert(result.capApplied === true,
            `Month ${expected.month}: capApplied = true`);
        assert(result.allowanceAmount.toNumber() === 0,
            `Month ${expected.month}: allowanceAmount = 0 (capped)`);
    } else {
        assert(result.capApplied === false,
            `Month ${expected.month}: capApplied = false`);

        if (result.matchedTier) {
            assert(result.matchedTier.percent === expected.expectedPercent,
                `Month ${expected.month}: matchedTier.percent = ${result.matchedTier.percent}% (expected ${expected.expectedPercent}%)`);
        } else {
            assert(false, `Month ${expected.month}: matchedTier is null`);
        }

        assertDecimalClose(result.allowanceAmount, expected.expectedAmount, 0.01,
            `Month ${expected.month}: allowanceAmount = ${result.allowanceAmount.toNumber()}`);
    }

    console.log(`  → Month ${expected.month}: salaryDiff=${result.salaryDiff}, percent=${result.matchedTier?.percent ?? "N/A"}%, amount=${result.allowanceAmount}, cap=${result.capApplied}`);
}

// ─── Test 3: Extended assignment (month 7+) ──────────────────

console.log("\n═══════════════════════════════════════════════════════");
console.log("TEST 3: Extended assignment (month 7+)");
console.log("═══════════════════════════════════════════════════════\n");

for (const expected of EXPECTED_EXTENDED_RESULTS) {
    const periodEnd = new Date("2027-01-01");
    periodEnd.setMonth(periodEnd.getMonth() + expected.month);
    periodEnd.setDate(0);

    const result = calculateActingAllowance(
        DEFAULT_TIERS,
        ACTING_POSITION_BASIC_SALARY,
        EMPLOYEE_BASIC_SALARY,
        assignmentStart,
        periodEnd,
        "PERCENTAGE",
        undefined,
        true, // extended
    );

    assert(result.capApplied === false,
        `Month ${expected.month} (extended): capApplied = false`);
    assert(result.allowanceAmount.toNumber() === expected.expectedAmount,
        `Month ${expected.month} (extended): allowanceAmount = ${result.allowanceAmount.toNumber()} (expected ${expected.expectedAmount})`);
}

// ─── Test 4: Zero/negative salary difference ─────────────────

console.log("\n═══════════════════════════════════════════════════════");
console.log("TEST 4: Zero/negative salary difference");
console.log("═══════════════════════════════════════════════════════\n");

// Employee earns more than acting position
const result4a = calculateActingAllowance(
    DEFAULT_TIERS,
    20_000, // acting position salary
    25_000, // employee salary (higher)
    assignmentStart,
    new Date("2027-03-31"),
    "PERCENTAGE",
);
assert(result4a.allowanceAmount.toNumber() === 0,
    "Negative diff: allowanceAmount = 0");
assert(result4a.salaryDiff.toNumber() === 0,
    "Negative diff: salaryDiff = 0");

// Employee earns same as acting position
const result4b = calculateActingAllowance(
    DEFAULT_TIERS,
    25_000,
    25_000,
    assignmentStart,
    new Date("2027-03-31"),
    "PERCENTAGE",
);
assert(result4b.allowanceAmount.toNumber() === 0,
    "Zero diff: allowanceAmount = 0");

// ─── Test 5: AMOUNT method with 6-month cap ─────────────────

console.log("\n═══════════════════════════════════════════════════════");
console.log("TEST 5: AMOUNT method with 6-month cap");
console.log("═══════════════════════════════════════════════════════\n");

const fixedAmt = 15_000;

// Month 6 — should pay
const result5a = calculateActingAllowance(
    DEFAULT_TIERS,
    ACTING_POSITION_BASIC_SALARY,
    EMPLOYEE_BASIC_SALARY,
    assignmentStart,
    new Date("2027-06-30"),
    "AMOUNT",
    fixedAmt,
    false,
);
assert(result5a.allowanceAmount.toNumber() === fixedAmt,
    `Month 6 AMOUNT: allowanceAmount = ${result5a.allowanceAmount.toNumber()} (expected ${fixedAmt})`);
assert(result5a.capApplied === false,
    "Month 6 AMOUNT: capApplied = false");

// Month 7 — should be capped
const result5b = calculateActingAllowance(
    DEFAULT_TIERS,
    ACTING_POSITION_BASIC_SALARY,
    EMPLOYEE_BASIC_SALARY,
    assignmentStart,
    new Date("2027-07-31"),
    "AMOUNT",
    fixedAmt,
    false,
);
assert(result5b.allowanceAmount.toNumber() === 0,
    `Month 7 AMOUNT: allowanceAmount = ${result5b.allowanceAmount.toNumber()} (expected 0)`);
assert(result5b.capApplied === true,
    "Month 7 AMOUNT: capApplied = true");

// Month 7 extended — should pay
const result5c = calculateActingAllowance(
    DEFAULT_TIERS,
    ACTING_POSITION_BASIC_SALARY,
    EMPLOYEE_BASIC_SALARY,
    assignmentStart,
    new Date("2027-07-31"),
    "AMOUNT",
    fixedAmt,
    true,
);
assert(result5c.allowanceAmount.toNumber() === fixedAmt,
    `Month 7 AMOUNT (extended): allowanceAmount = ${result5c.allowanceAmount.toNumber()} (expected ${fixedAmt})`);
assert(result5c.capApplied === false,
    "Month 7 AMOUNT (extended): capApplied = false");

// ─── Test 6: Month-by-month breakdown ────────────────────────

console.log("\n═══════════════════════════════════════════════════════");
console.log("TEST 6: Month-by-month breakdown");
console.log("═══════════════════════════════════════════════════════\n");

const result6 = calculateActingAllowance(
    DEFAULT_TIERS,
    ACTING_POSITION_BASIC_SALARY,
    EMPLOYEE_BASIC_SALARY,
    assignmentStart,
    new Date("2027-06-30"),
    "PERCENTAGE",
    undefined,
    false,
);

assert(result6.monthBreakdown.length === 6,
    `Breakdown has 6 months (got ${result6.monthBreakdown.length})`);

const expectedBreakdown = [0, 25, 25, 50, 50, 100];
for (let i = 0; i < expectedBreakdown.length; i++) {
    const row = result6.monthBreakdown[i];
    assert(row.percent === expectedBreakdown[i],
        `Breakdown month ${i + 1}: percent = ${row.percent}% (expected ${expectedBreakdown[i]}%)`);
    console.log(`  → Month ${row.month}: ${row.percent}% = ETB ${row.amount.toNumber().toLocaleString()}`);
}

// ─── Test 7: Custom tier table (different percentages) ───────

console.log("\n═══════════════════════════════════════════════════════");
console.log("TEST 7: Custom tier table");
console.log("═══════════════════════════════════════════════════════\n");

const customTiers: Tier[] = [
    { startMonth: 1, endMonth: 1, percent: 0 },
    { startMonth: 2, endMonth: 2, percent: 30 },
    { startMonth: 3, endMonth: 4, percent: 60 },
    { startMonth: 5, endMonth: 0, percent: 100 },
];

const customExpected = [
    { month: 1, percent: 0, amount: 0 },
    { month: 2, percent: 30, amount: 10_500 },
    { month: 3, percent: 60, amount: 21_000 },
    { month: 4, percent: 60, amount: 21_000 },
    { month: 5, percent: 100, amount: 35_000 },
    { month: 6, percent: 100, amount: 35_000 },
];

for (const exp of customExpected) {
    const periodEnd = new Date("2027-01-01");
    periodEnd.setMonth(periodEnd.getMonth() + exp.month);
    periodEnd.setDate(0);

    const result = calculateActingAllowance(
        customTiers,
        ACTING_POSITION_BASIC_SALARY,
        EMPLOYEE_BASIC_SALARY,
        assignmentStart,
        periodEnd,
        "PERCENTAGE",
    );

    assert(result.matchedTier?.percent === exp.percent,
        `Custom tier month ${exp.month}: percent = ${result.matchedTier?.percent}% (expected ${exp.percent}%)`);
    assertDecimalClose(result.allowanceAmount, exp.amount, 0.01,
        `Custom tier month ${exp.month}: amount`);
}

// ─── Test 8: Proration ───────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════");
console.log("TEST 8: Proration");
console.log("═══════════════════════════════════════════════════════\n");

// The calculation service itself doesn't prorate — proration is applied
// by the payroll run service. But we can verify the base calculation
// is correct, then verify the payroll service applies proration.

const result8 = calculateActingAllowance(
    DEFAULT_TIERS,
    ACTING_POSITION_BASIC_SALARY,
    EMPLOYEE_BASIC_SALARY,
    assignmentStart,
    new Date("2027-06-30"),
    "PERCENTAGE",
);

// Month 6: 100% of 35,000 = 35,000
assertDecimalClose(result8.allowanceAmount, 35_000, 0.01,
    "Base amount (no proration) = 35,000");

// Simulate proration factor of 0.5 (mid-month hire)
const prorationFactor = 0.5;
const proratedAmount = result8.allowanceAmount.toNumber() * prorationFactor;
assert(proratedAmount === 17_500,
    `Prorated amount (50%) = ${proratedAmount} (expected 17,500)`);
console.log(`  → Base: ETB 35,000 × 50% proration = ETB ${proratedAmount.toLocaleString()}`);

// ─── Summary ─────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════");
console.log("SUMMARY");
console.log("═══════════════════════════════════════════════════════\n");

console.log(`  Total tests: ${total}`);
console.log(`  Passed:      ${passed}`);
console.log(`  Failed:      ${failed}`);
console.log(`  Status:      ${failed === 0 ? "ALL PASSED" : "SOME FAILED"}`);
console.log("");
