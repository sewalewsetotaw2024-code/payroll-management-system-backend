/**
 * Acting Allowance — Zod Validation Schemas
 * ==========================================
 *
 * Validates all incoming request bodies, params, and queries for the
 * Acting Allowance Rules CRUD and Acting Assignments CRUD endpoints.
 *
 * Supports three calculation methods:
 *  - PERCENTAGE: Tiered percentage brackets based on salary difference
 *  - FIXED_AMOUNT: Fixed amount per-assignment (assignment-level override)
 *  - RULE_FIXED_AMOUNT: Fixed amount from rule.fixedAmount, shared across all assignments
 */

import { z } from "zod";

// ── Tier bracket schema ──────────────────────────────────────
const tierSchema = z.object({
    startMonth: z.number().int().min(1),
    endMonth: z.number().int().min(1),
    percent: z.number().min(0).max(100),
});

// ── Acting Allowance Rules ───────────────────────────────────

/** POST /api/v1/acting-allowance-rules — Create a new rule. */
export const createRuleSchema = z.object({
    body: z.object({
        calculationMethod: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "RULE_FIXED_AMOUNT"]).optional().default("PERCENTAGE"),
        fixedAmount: z.number().positive("Fixed amount must be positive").optional().nullable(),
        basis: z.enum(["BASIC_DIFF", "GROSS_DIFF"]).optional().default("BASIC_DIFF"),
        tiers: z.array(tierSchema).optional(),
        payablePercent: z.number().min(0).max(1).optional(),
        minimumPeriodMonths: z.number().int().min(1).optional(),
        maximumPeriodMonths: z.number().int().min(1).optional(),
        effectiveDate: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid date"),
        isActive: z.boolean().optional().default(true),
    }).refine(
        (data) => {
            if (data.calculationMethod === "PERCENTAGE") {
                return (data.tiers && data.tiers.length > 0) || data.payablePercent !== undefined;
            }
            if (data.calculationMethod === "RULE_FIXED_AMOUNT") {
                return data.fixedAmount !== null && data.fixedAmount !== undefined && data.fixedAmount > 0;
            }
            // FIXED_AMOUNT has no specific constraints (amount is per-assignment)
            return true;
        },
        {
            message: "PERCENTAGE requires tiers or payablePercent; RULE_FIXED_AMOUNT requires a positive fixedAmount",
        },
    ),
});

/** PUT /api/v1/acting-allowance-rules/:id — Partially update a rule. */
export const updateRuleSchema = z.object({
    body: z.object({
        calculationMethod: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "RULE_FIXED_AMOUNT"]).optional(),
        fixedAmount: z.number().positive().optional().nullable(),
        basis: z.enum(["BASIC_DIFF", "GROSS_DIFF"]).optional(),
        tiers: z.array(tierSchema).optional(),
        payablePercent: z.number().min(0).max(1).optional(),
        minimumPeriodMonths: z.number().int().min(1).optional(),
        maximumPeriodMonths: z.number().int().min(1).optional(),
        effectiveDate: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid date").optional(),
        isActive: z.boolean().optional(),
    }).refine(
        (data) => {
            // PERCENTAGE requires at least one tier or a payablePercent
            if (data.calculationMethod === "PERCENTAGE") {
                return (data.tiers && data.tiers.length > 0) || data.payablePercent !== undefined;
            }
            // FIXED_AMOUNT / RULE_FIXED_AMOUNT are fine with empty or omitted tiers
            return true;
        },
        {
            message: "PERCENTAGE requires tiers or payablePercent",
        },
    ),
    params: z.object({
        id: z.string().uuid(),
    }),
});

/** DELETE /api/v1/acting-allowance-rules/:id — Soft-delete (sets isActive=false). */
export const deleteRuleSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
});

// ── Acting Assignments ───────────────────────────────────────

/**
 * POST /api/v1/acting-assignments — Create a new acting assignment.
 *
 * Either `actingPositionId` (existing Position UUID) or
 * `actingPositionTitle` (creates a new Position) must be provided.
 */
export const createAssignmentSchema = z.object({
    body: z.object({
        employeeId: z.string().min(1, "Employee ID is required"),
        replacedEmployeeId: z.string().min(1).optional(),
        actingPositionId: z.string().min(1, "Position ID is required").optional(),
        actingPositionTitle: z.string().min(1).optional(),
        actingAllowanceRuleId: z.string().uuid("Rule ID must be a valid UUID"),
        actingPositionBasicSalary: z.number().positive("Basic salary must be positive").optional(),
        actingPositionGrossSalary: z.number().positive("Gross salary must be positive").optional().nullable(),
        actingPositionSalary: z.number().positive("Salary must be positive").optional(),
        fixedAmount: z.number().positive("Fixed amount must be positive").optional(),
        startDate: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid start date"),
        expectedEndDate: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid expected end date").optional().nullable(),
        notes: z.string().optional(),
    }),
});

/** PUT /api/v1/acting-assignments/:id — Update assignment fields or status. */
export const updateAssignmentSchema = z.object({
    body: z.object({
        replacedEmployeeId: z.string().min(1).optional().nullable(),
        actingPositionId: z.string().min(1).optional(),
        actingAllowanceRuleId: z.string().uuid().optional(),
        actingPositionBasicSalary: z.number().positive().optional(),
        actingPositionGrossSalary: z.number().positive().optional().nullable(),
        actingPositionSalary: z.number().positive().optional(),
        expectedEndDate: z.string().refine((v) => !isNaN(Date.parse(v))).optional().nullable(),
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED", "EXPIRED"]).optional(),
        extensionApprovedBy: z.string().optional(),
        notes: z.string().optional(),
    }),
    params: z.object({
        id: z.string().uuid(),
    }),
});

/** GET /api/v1/acting-assignments/:id — Get a single assignment. */
export const getAssignmentSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
});

/**
 * GET /api/v1/acting-assignments — List assignments with optional filters.
 */
export const listAssignmentsSchema = z.object({
    query: z.object({
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED", "EXPIRED"]).optional(),
        employeeId: z.string().optional(),
    }).optional(),
});

/**
 * POST /api/v1/acting-assignments/preview — Preview allowance before creating.
 */
export const previewAllowanceSchema = z.object({
    body: z.object({
        employeeId: z.string().min(1, "Employee ID is required"),
        replacedEmployeeId: z.string().min(1).optional(),
        actingAllowanceRuleId: z.string().uuid("Rule ID must be a valid UUID"),
        actingPositionBasicSalary: z.number().positive("Basic salary must be positive").optional(),
        actingPositionGrossSalary: z.number().positive().optional().nullable(),
        calculationMethod: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "RULE_FIXED_AMOUNT"]).optional().default("PERCENTAGE"),
        fixedAmount: z.number().positive().optional().nullable(),
        startDate: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid start date"),
        payrollPeriodEndDate: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid period end date"),
    }),
});
