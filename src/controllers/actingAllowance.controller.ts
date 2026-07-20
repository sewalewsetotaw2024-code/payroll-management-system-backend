/**
 * Acting Allowance — Controller
 * ===============================
 *
 * 10 handler methods covering CRUD for rules and assignments plus a
 * preview endpoint.  All handlers are scoped to the authenticated
 * company via `resolveCompanyId(req)`.
 *
 * Supports three calculation methods on rules:
 *  - **PERCENTAGE**: Tiered percentage brackets based on salary difference
 *  - **FIXED_AMOUNT**: Fixed amount per assignment (computed from salary diff at assignment time)
 *  - **RULE_FIXED_AMOUNT**: Fixed amount defined on the rule, same for all positions
 *
 * Key behaviours:
 *  - **Rules** use soft-delete (`isActive = false`) rather than hard delete.
 *  - **Assignments** support find-or-create of the `actingPositionId` FK.
 *  - **Salary difference** is computed and returned in the listing for the
 *    frontend "Salary" column — BASIC_DIFF or GROSS_DIFF per the rule basis.
 *  - **Prisma Decimal** values are serialised as JSON numbers; frontend
 *    should treat them as numbers.
 */

import type { Request, Response } from "express";
import httpStatus from "http-status";
import asyncHandler from "../utils/asyncHandler";
import CustomError from "../utils/customError";
import { resolveCompanyId } from "../utils/roleGuard";
import prisma from "../config/database";
import { Prisma } from "../generated/prisma";
import { calculateActingAllowance, type Tier } from "../services/actingAllowance.service";

/** Extract tiers from a rule — prefers stored JSON, falls back to flat fields. */
function resolveTiers(rule: {
    tiers?: Prisma.JsonValue | null;
    minimumPeriodMonths: number;
    maximumPeriodMonths: number;
    payablePercent: Prisma.Decimal | number;
}): Tier[] {
    // If we have stored tiers JSON, parse and return it
    if (rule.tiers && Array.isArray(rule.tiers)) {
        return rule.tiers as unknown as Tier[];
    }
    // Fallback: reconstruct a single tier from flat fields
    return [{
        startMonth: rule.minimumPeriodMonths,
        endMonth: rule.maximumPeriodMonths,
        percent: Number(rule.payablePercent) * 100,
    }];
}

/** Compute salary difference for an assignment based on its rule basis. */
function computeSalaryDiff(
    assignment: { actingPositionBasicSalary?: Prisma.Decimal | null; actingPositionGrossSalary?: Prisma.Decimal | null },
    employee: { basicSalary?: Prisma.Decimal | null; grossSalary?: Prisma.Decimal | null },
    basis: string,
): number {
    if (basis === "GROSS_DIFF") {
        const posGross = assignment.actingPositionGrossSalary
            ? Number(assignment.actingPositionGrossSalary)
            : Number(assignment.actingPositionBasicSalary ?? 0);
        const empGross = employee.grossSalary ? Number(employee.grossSalary) : 0;
        return Math.max(0, posGross - empGross);
    }
    // BASIC_DIFF (default)
    const posBasic = Number(assignment.actingPositionBasicSalary ?? 0);
    const empBasic = employee.basicSalary ? Number(employee.basicSalary) : 0;
    return Math.max(0, posBasic - empBasic);
}

/**
 * Compute the current monthly allowance amount for display in the assignments table.
 *
 * For FIXED_AMOUNT/RULE_FIXED_AMOUNT method: the fixed amount is stored as `actingPositionSalary`.
 * For PERCENTAGE method: salaryDiff × matchedTier.percent / 100.
 */
function computeMonthlyAllowance(
    assignment: {
        actingPositionSalary?: Prisma.Decimal | number | null;
        salaryDiff: number;
        startDate: Date | string;
    },
    rule: {
        calculationMethod: string;
        tiers?: Prisma.JsonValue | null;
        minimumPeriodMonths: number;
        maximumPeriodMonths: number;
        payablePercent: Prisma.Decimal | number;
    } | null,
): number {
    if (!rule) return 0;

    if (rule.calculationMethod === 'FIXED_AMOUNT' || rule.calculationMethod === 'RULE_FIXED_AMOUNT') {
        // FIXED_AMOUNT: amount stored on assignment as actingPositionSalary
        // RULE_FIXED_AMOUNT: amount from rule.fixedAmount (stored in actingPositionSalary at creation)
        return Number(assignment.actingPositionSalary ?? 0);
    }

    // PERCENTAGE: find matching tier and apply to salaryDiff
    const tiers = resolveTiers(rule);
    const sortedTiers = [...tiers].sort((a, b) => a.startMonth - b.startMonth);
    const startDate = new Date(assignment.startDate);
    const now = new Date();
    const months = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
    const monthsElapsed = Math.max(1, months + 1);

    const matchedTier = sortedTiers.reduceRight<Tier | null>(
        (found, t) => found ?? (monthsElapsed >= t.startMonth && (!t.endMonth || monthsElapsed <= t.endMonth) ? t : null),
        null,
    );

    if (!matchedTier) return 0;
    return assignment.salaryDiff * (matchedTier.percent / 100);
}

export const ActingAllowanceController = {
    // ═══════════════════════════════════════════════════════════
    //  RULES CRUD
    // ═══════════════════════════════════════════════════════════

    /** GET /api/v1/acting-allowance-rules — List all rules for the company. */
    listRules: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const rules = await prisma.actingAllowanceRule.findMany({
            where: { companyId },
            orderBy: { effectiveDate: "desc" },
        });

        const rulesWithTiers = rules.map((rule) => ({
            ...rule,
            fixedAmount: rule.fixedAmount ? Number(rule.fixedAmount) : null,
            payablePercent: Number(rule.payablePercent),
            // Provide tiers array for frontend that still expects it
            tiers: (rule.calculationMethod === "FIXED_AMOUNT" || rule.calculationMethod === "RULE_FIXED_AMOUNT")
                ? []
                : resolveTiers(rule),
        }));

        res.status(httpStatus.OK).json({ success: true, data: rulesWithTiers });
    }),

    /** POST /api/v1/acting-allowance-rules — Create a new rule. */
    createRule: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const {
            calculationMethod, fixedAmount, basis,
            tiers, payablePercent, minimumPeriodMonths, maximumPeriodMonths,
            effectiveDate, isActive,
        } = req.body;

        const data: any = {
            companyId,
            calculationMethod: calculationMethod ?? "PERCENTAGE",
            basis: basis ?? "BASIC_DIFF",
            effectiveDate: new Date(effectiveDate),
            isActive: isActive ?? true,
        };

        if (calculationMethod === "FIXED_AMOUNT") {
            // FIXED_AMOUNT: amount is per-assignment, set in modal. Rule just defines method.
            data.fixedAmount = null;
            data.payablePercent = new Prisma.Decimal(0);
            data.minimumPeriodMonths = 1;
            data.maximumPeriodMonths = 1;
            data.tiers = [];
        } else if (calculationMethod === "RULE_FIXED_AMOUNT") {
            // RULE_FIXED_AMOUNT: amount is set on the rule, applies to all positions
            data.fixedAmount = fixedAmount != null ? new Prisma.Decimal(fixedAmount) : new Prisma.Decimal(0);
            data.payablePercent = new Prisma.Decimal(0);
            data.minimumPeriodMonths = 1;
            data.maximumPeriodMonths = 1;
            data.tiers = [];
        } else {
            // PERCENTAGE — map tiers or flat fields
            if (tiers && tiers.length > 0) {
                const primary = tiers[0];
                data.payablePercent = new Prisma.Decimal(primary.percent / 100);
                data.minimumPeriodMonths = primary.startMonth;
                data.maximumPeriodMonths = primary.endMonth;
                data.tiers = tiers;
            } else {
                data.payablePercent = new Prisma.Decimal(payablePercent ?? 0);
                data.minimumPeriodMonths = minimumPeriodMonths ?? 1;
                data.maximumPeriodMonths = maximumPeriodMonths ?? 6;
                data.tiers = [];
            }
        }

        const rule = await prisma.actingAllowanceRule.create({ data });

        res.status(httpStatus.CREATED).json({
            success: true,
            data: {
                ...rule,
                fixedAmount: rule.fixedAmount ? Number(rule.fixedAmount) : null,
                payablePercent: Number(rule.payablePercent),
                tiers: (rule.calculationMethod === "FIXED_AMOUNT" || rule.calculationMethod === "RULE_FIXED_AMOUNT")
                    ? []
                    : resolveTiers(rule),
            },
        });
    }),

    /** PUT /api/v1/acting-allowance-rules/:id — Update rule fields. */
    updateRule: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;
        const {
            calculationMethod, fixedAmount, basis,
            tiers, payablePercent, minimumPeriodMonths, maximumPeriodMonths,
            effectiveDate, isActive,
        } = req.body;

        const existing = await prisma.actingAllowanceRule.findFirst({
            where: { id, companyId },
        });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Rule not found");
        }

        const data: any = {};
        if (calculationMethod !== undefined) data.calculationMethod = calculationMethod;
        if (fixedAmount !== undefined) {
            data.fixedAmount = fixedAmount !== null ? new Prisma.Decimal(fixedAmount) : null;
        }
        if (basis !== undefined) data.basis = basis;
        if (effectiveDate !== undefined) data.effectiveDate = new Date(effectiveDate);
        if (isActive !== undefined) data.isActive = isActive;

        // When calculationMethod is explicitly set, clear unrelated fields
        if (calculationMethod === "FIXED_AMOUNT") {
            data.fixedAmount = null;
            data.payablePercent = new Prisma.Decimal(0);
            data.minimumPeriodMonths = 1;
            data.maximumPeriodMonths = 1;
            if (tiers !== undefined) data.tiers = [];
        } else if (calculationMethod === "RULE_FIXED_AMOUNT") {
            data.fixedAmount = fixedAmount !== undefined && fixedAmount !== null
                ? new Prisma.Decimal(fixedAmount)
                : new Prisma.Decimal(0);
            data.payablePercent = new Prisma.Decimal(0);
            data.minimumPeriodMonths = 1;
            data.maximumPeriodMonths = 1;
            if (tiers !== undefined) data.tiers = [];
        } else if (calculationMethod === "PERCENTAGE" || (!calculationMethod && existing.calculationMethod === "PERCENTAGE")) {
            // PERCENTAGE — update tiers / flat fields if provided
            if (tiers && tiers.length > 0) {
                const primary = tiers[0];
                data.payablePercent = new Prisma.Decimal(primary.percent / 100);
                data.minimumPeriodMonths = primary.startMonth;
                data.maximumPeriodMonths = primary.endMonth;
                data.tiers = tiers;
            } else {
                if (payablePercent !== undefined) data.payablePercent = new Prisma.Decimal(payablePercent);
                if (minimumPeriodMonths !== undefined) data.minimumPeriodMonths = minimumPeriodMonths;
                if (maximumPeriodMonths !== undefined) data.maximumPeriodMonths = maximumPeriodMonths;
            }
        }

        const rule = await prisma.actingAllowanceRule.update({ where: { id }, data });

        res.status(httpStatus.OK).json({
            success: true,
            data: {
                ...rule,
                fixedAmount: rule.fixedAmount ? Number(rule.fixedAmount) : null,
                payablePercent: Number(rule.payablePercent),
                tiers: (rule.calculationMethod === "FIXED_AMOUNT" || rule.calculationMethod === "RULE_FIXED_AMOUNT")
                    ? []
                    : resolveTiers(rule),
            },
        });
    }),

    /** DELETE /api/v1/acting-allowance-rules/:id — Soft-delete (sets isActive=false). */
    deleteRule: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const existing = await prisma.actingAllowanceRule.findFirst({
            where: { id, companyId },
        });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Rule not found");
        }

        const rule = await prisma.actingAllowanceRule.update({
            where: { id },
            data: { isActive: false },
        });
        res.status(httpStatus.OK).json({ success: true, data: rule });
    }),

    // ═══════════════════════════════════════════════════════════
    //  ASSIGNMENTS CRUD
    // ═══════════════════════════════════════════════════════════

    /**
     * GET /api/v1/acting-assignments — List assignments with optional filters.
     *
     * Returns a computed `salaryDiff` field for each assignment based on
     * the rule's basis and the employee's compensation data.
     */
    listAssignments: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { status, employeeId } = req.query as any;

        const where: any = { companyId };
        if (status) where.status = status;
        if (employeeId) where.employeeId = employeeId;

        const assignments = await prisma.actingAssignment.findMany({
            where,
            include: {
                employee: {
                    select: {
                        id: true, firstName: true, lastName: true, departmentId: true,
                        compensation: { select: { basicSalary: true, grossSalary: true } },
                    },
                },
                replacedEmployee: {
                    select: {
                        id: true, firstName: true, lastName: true,
                        compensation: { select: { basicSalary: true, grossSalary: true } },
                    },
                },
                actingPosition: { select: { id: true, title: true } },
                actingAllowanceRule: {
                    select: {
                        id: true, basis: true, calculationMethod: true, fixedAmount: true,
                        payablePercent: true, minimumPeriodMonths: true, maximumPeriodMonths: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        const enriched = assignments.map((a) => {
            const rule = a.actingAllowanceRule;
            const basis = rule?.basis ?? "BASIC_DIFF";
            const salaryDiff = computeSalaryDiff(
                a,
                { basicSalary: a.employee?.compensation?.basicSalary ?? null, grossSalary: a.employee?.compensation?.grossSalary ?? null },
                basis,
            );
            const enrichedRule = rule ? {
                    ...rule,
                    fixedAmount: rule.fixedAmount ? Number(rule.fixedAmount) : null,
                    payablePercent: Number(rule.payablePercent),
                    tiers: (rule.calculationMethod === "FIXED_AMOUNT" || rule.calculationMethod === "RULE_FIXED_AMOUNT")
                        ? []
                        : resolveTiers(rule),
                } : null;
            const monthlyAllowance = computeMonthlyAllowance(
                { actingPositionSalary: a.actingPositionSalary, salaryDiff, startDate: a.startDate },
                rule as any,
            );
            return {
                ...a,
                replacedEmployeeId: a.replacedEmployeeId ?? null,
                actingPositionBasicSalary: a.actingPositionBasicSalary ? Number(a.actingPositionBasicSalary) : null,
                actingPositionGrossSalary: a.actingPositionGrossSalary ? Number(a.actingPositionGrossSalary) : null,
                actingPositionSalary: Number(a.actingPositionSalary),
                salaryDiff,
                monthlyAllowance,
                actingAllowanceRule: enrichedRule,
            };
        });

        res.status(httpStatus.OK).json({ success: true, data: enriched });
    }),

    /**
     * POST /api/v1/acting-assignments — Create a new acting assignment.
     *
     * Accepts `actingPositionBasicSalary` and `actingPositionGrossSalary`.
     * `actingPositionSalary` is populated from `actingPositionBasicSalary`
     * for backward compatibility with the payroll engine.
     */
    createAssignment: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const {
            employeeId,
            replacedEmployeeId,
            actingPositionId, actingPositionTitle,
            actingAllowanceRuleId,
            actingPositionBasicSalary, actingPositionGrossSalary,
            fixedAmount,
            startDate, expectedEndDate,
        } = req.body;

        // Verify acting employee belongs to company
        const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
        if (!employee) {
            throw new CustomError(httpStatus.NOT_FOUND, "Employee not found in this company");
        }

        // ── Resolve replaced employee and their position ──────────
        let resolvedReplacedEmployeeId = replacedEmployeeId || null;
        let autoFilledBasicSalary = actingPositionBasicSalary;
        let autoFilledGrossSalary = actingPositionGrossSalary;

        if (resolvedReplacedEmployeeId) {
            const replacedEmp = await prisma.employee.findFirst({
                where: { id: resolvedReplacedEmployeeId, companyId },
                include: { compensation: { select: { basicSalary: true, grossSalary: true } }, position: { select: { id: true, title: true } } },
            });
            if (!replacedEmp) {
                throw new CustomError(httpStatus.NOT_FOUND, "Replaced employee not found in this company");
            }

            // Auto-fill position from replaced employee's position (formal or string)
            if (!actingPositionId && !actingPositionTitle) {
                const positionTitle = replacedEmp.position?.title ?? replacedEmp.jobPosition;
                if (positionTitle) {
                    req.body.actingPositionTitle = positionTitle;
                }
            }

            // Auto-fill salaries from replaced employee's compensation (allowing manual override)
            if (autoFilledBasicSalary === undefined || autoFilledBasicSalary === null) {
                autoFilledBasicSalary = replacedEmp.compensation?.basicSalary
                    ? Number(replacedEmp.compensation.basicSalary)
                    : 0;
            }
            if (autoFilledGrossSalary === undefined || autoFilledGrossSalary === null) {
                autoFilledGrossSalary = replacedEmp.compensation?.grossSalary
                    ? Number(replacedEmp.compensation.grossSalary)
                    : null;
            }
        }

        // ── Resolve acting position ──────────────────────────────
        let resolvedPositionId = actingPositionId;
        if (!resolvedPositionId && (req.body as any).actingPositionTitle) {
            const title = (req.body as any).actingPositionTitle;
            const existing = await prisma.position.findFirst({
                where: { title, companyId },
            });
            if (existing) {
                resolvedPositionId = existing.id;
            } else {
                const created = await prisma.position.create({
                    data: { title, companyId, code: `ACT-${Date.now()}` },
                });
                resolvedPositionId = created.id;
            }
        }
        if (!resolvedPositionId) {
            throw new CustomError(httpStatus.BAD_REQUEST, "Either actingPositionId, actingPositionTitle, or replacedEmployeeId with a position is required");
        }

        // Verify rule belongs to company
        const rule = await prisma.actingAllowanceRule.findFirst({ where: { id: actingAllowanceRuleId, companyId } });
        if (!rule) {
            throw new CustomError(httpStatus.NOT_FOUND, "Acting allowance rule not found");
        }

        // For FIXED_AMOUNT method: actingPositionSalary stores the per-assignment fixed amount.
        // For RULE_FIXED_AMOUNT method: actingPositionSalary stores rule.fixedAmount.
        // For PERCENTAGE method: actingPositionSalary = actingPositionBasicSalary (backward compat).
        const isFixedMethod = rule.calculationMethod === "FIXED_AMOUNT";
        const isRuleFixedMethod = rule.calculationMethod === "RULE_FIXED_AMOUNT";

        let basicSal, grossSal, sal;
        if (isFixedMethod) {
            // FIXED_AMOUNT: amount comes from the assignment form (calculated from salary diff)
            basicSal = new Prisma.Decimal(autoFilledBasicSalary ?? 0);
            grossSal = null;
            sal = new Prisma.Decimal(fixedAmount ?? 0);
        } else if (isRuleFixedMethod) {
            // RULE_FIXED_AMOUNT: amount comes from rule.fixedAmount
            basicSal = new Prisma.Decimal(autoFilledBasicSalary ?? 0);
            grossSal = null;
            sal = rule.fixedAmount ?? new Prisma.Decimal(0);
        } else {
            // PERCENTAGE: actingPositionSalary = actingPositionBasicSalary (backward compat)
            basicSal = new Prisma.Decimal(autoFilledBasicSalary ?? 0);
            grossSal = autoFilledGrossSalary !== null ? new Prisma.Decimal(autoFilledGrossSalary ?? 0) : null;
            sal = new Prisma.Decimal(autoFilledBasicSalary ?? 0);
        }

        const assignment = await prisma.actingAssignment.create({
            data: {
                companyId,
                employeeId,
                replacedEmployeeId: resolvedReplacedEmployeeId,
                actingPositionId: resolvedPositionId,
                actingAllowanceRuleId,
                actingPositionBasicSalary: basicSal,
                actingPositionGrossSalary: grossSal,
                actingPositionSalary: sal,
                startDate: new Date(startDate),
                expectedEndDate: expectedEndDate ? new Date(expectedEndDate) : null,
            },
            include: {
                employee: {
                    select: {
                        id: true, firstName: true, lastName: true,
                        compensation: { select: { basicSalary: true, grossSalary: true } },
                    },
                },
                replacedEmployee: {
                    select: {
                        id: true, firstName: true, lastName: true,
                        compensation: { select: { basicSalary: true, grossSalary: true } },
                    },
                },
                actingPosition: { select: { id: true, title: true } },
                actingAllowanceRule: {
                    select: {
                        id: true, basis: true, calculationMethod: true, fixedAmount: true,
                        payablePercent: true, minimumPeriodMonths: true, maximumPeriodMonths: true,
                    },
                },
            },
        });

        const ruleBasis = assignment.actingAllowanceRule?.basis ?? "BASIC_DIFF";
        const salaryDiff = computeSalaryDiff(
            assignment,
            { basicSalary: assignment.employee?.compensation?.basicSalary ?? null, grossSalary: assignment.employee?.compensation?.grossSalary ?? null },
            ruleBasis,
        );
        const enrichedRule = assignment.actingAllowanceRule ? {
            ...assignment.actingAllowanceRule,
            fixedAmount: assignment.actingAllowanceRule.fixedAmount ? Number(assignment.actingAllowanceRule.fixedAmount) : null,
            payablePercent: Number(assignment.actingAllowanceRule.payablePercent),
            tiers: (assignment.actingAllowanceRule.calculationMethod === "FIXED_AMOUNT" || assignment.actingAllowanceRule.calculationMethod === "RULE_FIXED_AMOUNT")
                ? []
                : resolveTiers(assignment.actingAllowanceRule),
        } : null;
        const monthlyAllowance = computeMonthlyAllowance(
            { actingPositionSalary: assignment.actingPositionSalary, salaryDiff, startDate: assignment.startDate },
            assignment.actingAllowanceRule as any,
        );

        res.status(httpStatus.CREATED).json({
            success: true,
            data: {
                ...assignment,
                replacedEmployeeId: assignment.replacedEmployeeId ?? null,
                actingPositionBasicSalary: assignment.actingPositionBasicSalary ? Number(assignment.actingPositionBasicSalary) : null,
                actingPositionGrossSalary: assignment.actingPositionGrossSalary ? Number(assignment.actingPositionGrossSalary) : null,
                actingPositionSalary: Number(assignment.actingPositionSalary),
                salaryDiff,
                monthlyAllowance,
                actingAllowanceRule: enrichedRule,
            },
        });
    }),

    /** GET /api/v1/acting-assignments/:id — Get a single assignment with relations. */
    getAssignment: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const assignment = await prisma.actingAssignment.findFirst({
            where: { id, companyId },
            include: {
                employee: {
                    select: {
                        id: true, firstName: true, lastName: true, departmentId: true,
                        compensation: { select: { basicSalary: true, grossSalary: true } },
                    },
                },
                replacedEmployee: {
                    select: {
                        id: true, firstName: true, lastName: true,
                        compensation: { select: { basicSalary: true, grossSalary: true } },
                    },
                },
                actingPosition: { select: { id: true, title: true } },
                actingAllowanceRule: {
                    select: {
                        id: true, basis: true, calculationMethod: true, fixedAmount: true,
                        payablePercent: true, minimumPeriodMonths: true, maximumPeriodMonths: true,
                    },
                },
            },
        });
        if (!assignment) {
            throw new CustomError(httpStatus.NOT_FOUND, "Assignment not found");
        }

        const ruleBasis = assignment.actingAllowanceRule?.basis ?? "BASIC_DIFF";
        const salaryDiff = computeSalaryDiff(
            assignment,
            { basicSalary: assignment.employee?.compensation?.basicSalary ?? null, grossSalary: assignment.employee?.compensation?.grossSalary ?? null },
            ruleBasis,
        );
        const enrichedRule = assignment.actingAllowanceRule ? {
            ...assignment.actingAllowanceRule,
            fixedAmount: assignment.actingAllowanceRule.fixedAmount ? Number(assignment.actingAllowanceRule.fixedAmount) : null,
            payablePercent: Number(assignment.actingAllowanceRule.payablePercent),
            tiers: (assignment.actingAllowanceRule.calculationMethod === "FIXED_AMOUNT" || assignment.actingAllowanceRule.calculationMethod === "RULE_FIXED_AMOUNT")
                ? []
                : resolveTiers(assignment.actingAllowanceRule),
        } : null;
        const monthlyAllowance = computeMonthlyAllowance(
            { actingPositionSalary: assignment.actingPositionSalary, salaryDiff, startDate: assignment.startDate },
            assignment.actingAllowanceRule as any,
        );

        res.status(httpStatus.OK).json({
            success: true,
            data: {
                ...assignment,
                replacedEmployeeId: assignment.replacedEmployeeId ?? null,
                actingPositionBasicSalary: assignment.actingPositionBasicSalary ? Number(assignment.actingPositionBasicSalary) : null,
                actingPositionGrossSalary: assignment.actingPositionGrossSalary ? Number(assignment.actingPositionGrossSalary) : null,
                actingPositionSalary: Number(assignment.actingPositionSalary),
                salaryDiff,
                monthlyAllowance,
                actingAllowanceRule: enrichedRule,
            },
        });
    }),

    /** PUT /api/v1/acting-assignments/:id — Update assignment fields. */
    updateAssignment: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;
        const {
            replacedEmployeeId,
            actingPositionId, actingAllowanceRuleId,
            actingPositionBasicSalary, actingPositionGrossSalary,
            fixedAmount,
            expectedEndDate, status, extensionApprovedBy,
        } = req.body;

        const existing = await prisma.actingAssignment.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Assignment not found");
        }

        const data: any = {};
        if (replacedEmployeeId !== undefined) {
            data.replacedEmployeeId = replacedEmployeeId || null;
            // If replacedEmployee changed, auto-refresh salaries from the new replaced employee
            if (replacedEmployeeId) {
                const replacedEmp = await prisma.employee.findFirst({
                    where: { id: replacedEmployeeId, companyId },
                    include: { compensation: { select: { basicSalary: true, grossSalary: true } } },
                });
                if (replacedEmp && replacedEmp.compensation) {
                    // Only auto-fill if not manually overridden
                    if (actingPositionBasicSalary === undefined) {
                        data.actingPositionBasicSalary = new Prisma.Decimal(replacedEmp.compensation.basicSalary ?? 0);
                        // Determine effective rule (new rule if changing, otherwise existing)
                        const ruleId = actingAllowanceRuleId ?? existing.actingAllowanceRuleId;
                        const rule = ruleId
                            ? await prisma.actingAllowanceRule.findUnique({ where: { id: ruleId }, select: { calculationMethod: true, fixedAmount: true } })
                            : null;
                        if (rule?.calculationMethod === 'RULE_FIXED_AMOUNT') {
                            // RULE_FIXED_AMOUNT: actingPositionSalary stores the rule's fixed amount
                            data.actingPositionSalary = rule.fixedAmount ?? new Prisma.Decimal(0);
                        } else {
                            data.actingPositionSalary = new Prisma.Decimal(replacedEmp.compensation.basicSalary ?? 0);
                        }
                    }
                    if (actingPositionGrossSalary === undefined) {
                        data.actingPositionGrossSalary = replacedEmp.compensation.grossSalary
                            ? new Prisma.Decimal(replacedEmp.compensation.grossSalary)
                            : null;
                    }
                }
            }
        }
        if (actingPositionId !== undefined) data.actingPositionId = actingPositionId;
        if (actingAllowanceRuleId !== undefined) data.actingAllowanceRuleId = actingAllowanceRuleId;
        if (actingPositionBasicSalary !== undefined) {
            data.actingPositionBasicSalary = new Prisma.Decimal(actingPositionBasicSalary);
            if (fixedAmount === undefined) {
                // Determine effective rule (new rule if changing, otherwise existing)
                const ruleId = actingAllowanceRuleId ?? existing.actingAllowanceRuleId;
                const rule = ruleId
                    ? await prisma.actingAllowanceRule.findUnique({ where: { id: ruleId }, select: { calculationMethod: true, fixedAmount: true } })
                    : null;
                if (rule?.calculationMethod === 'RULE_FIXED_AMOUNT') {
                    // RULE_FIXED_AMOUNT: actingPositionSalary stores the rule's fixed amount
                    data.actingPositionSalary = rule.fixedAmount ?? new Prisma.Decimal(0);
                } else {
                    // FIXED_AMOUNT / PERCENTAGE: actingPositionSalary = basic salary
                    data.actingPositionSalary = new Prisma.Decimal(actingPositionBasicSalary);
                }
            }
        }
        if (actingPositionGrossSalary !== undefined) {
            data.actingPositionGrossSalary = actingPositionGrossSalary !== null
                ? new Prisma.Decimal(actingPositionGrossSalary)
                : null;
        }
        if (fixedAmount !== undefined) {
            data.actingPositionSalary = new Prisma.Decimal(fixedAmount);
        }
        if (expectedEndDate !== undefined) {
            data.expectedEndDate = expectedEndDate ? new Date(expectedEndDate) : null;
        }
        if (status !== undefined) data.status = status;
        if (extensionApprovedBy !== undefined) data.extensionApprovedBy = extensionApprovedBy;

        const assignment = await prisma.actingAssignment.update({
            where: { id },
            data,
            include: {
                employee: {
                    select: {
                        id: true, firstName: true, lastName: true,
                        compensation: { select: { basicSalary: true, grossSalary: true } },
                    },
                },
                replacedEmployee: {
                    select: {
                        id: true, firstName: true, lastName: true,
                        compensation: { select: { basicSalary: true, grossSalary: true } },
                    },
                },
                actingPosition: { select: { id: true, title: true } },
                actingAllowanceRule: {
                    select: {
                        id: true, basis: true, calculationMethod: true, fixedAmount: true,
                        payablePercent: true, minimumPeriodMonths: true, maximumPeriodMonths: true,
                    },
                },
            },
        });

        const ruleBasis = assignment.actingAllowanceRule?.basis ?? "BASIC_DIFF";
        const salaryDiff = computeSalaryDiff(
            assignment,
            { basicSalary: assignment.employee?.compensation?.basicSalary ?? null, grossSalary: assignment.employee?.compensation?.grossSalary ?? null },
            ruleBasis,
        );
        const enrichedRule = assignment.actingAllowanceRule ? {
            ...assignment.actingAllowanceRule,
            fixedAmount: assignment.actingAllowanceRule.fixedAmount ? Number(assignment.actingAllowanceRule.fixedAmount) : null,
            payablePercent: Number(assignment.actingAllowanceRule.payablePercent),
            tiers: (assignment.actingAllowanceRule.calculationMethod === "FIXED_AMOUNT" || assignment.actingAllowanceRule.calculationMethod === "RULE_FIXED_AMOUNT")
                ? []
                : resolveTiers(assignment.actingAllowanceRule),
        } : null;
        const monthlyAllowance = computeMonthlyAllowance(
            { actingPositionSalary: assignment.actingPositionSalary, salaryDiff, startDate: assignment.startDate },
            assignment.actingAllowanceRule as any,
        );

        res.status(httpStatus.OK).json({
            success: true,
            data: {
                ...assignment,
                replacedEmployeeId: assignment.replacedEmployeeId ?? null,
                actingPositionBasicSalary: assignment.actingPositionBasicSalary ? Number(assignment.actingPositionBasicSalary) : null,
                actingPositionGrossSalary: assignment.actingPositionGrossSalary ? Number(assignment.actingPositionGrossSalary) : null,
                actingPositionSalary: Number(assignment.actingPositionSalary),
                salaryDiff,
                monthlyAllowance,
                actingAllowanceRule: enrichedRule,
            },
        });
    }),

    /** DELETE /api/v1/acting-assignments/:id — Cancel assignment (soft-cancel). */
    deleteAssignment: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const existing = await prisma.actingAssignment.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Assignment not found");
        }

        const assignment = await prisma.actingAssignment.update({
            where: { id },
            data: { status: "CANCELLED" },
        });
        res.status(httpStatus.OK).json({ success: true, data: assignment });
    }),

    // ═══════════════════════════════════════════════════════════
    //  PREVIEW
    // ═══════════════════════════════════════════════════════════

    /**
     * POST /api/v1/acting-assignments/preview — Preview allowance amount.
     *
     * Accepts `actingPositionBasicSalary` (and optional `actingPositionGrossSalary`).
     * For FIXED_AMOUNT/RULE_FIXED_AMOUNT rules, uses the appropriate fixed amount.
     * For PERCENTAGE rules, computes via salary difference + tier brackets.
     */
    /**
     * GET /positions — List all active positions for the company.
     * Used by the acting allowance assignment form to populate the
     * position search dropdown and auto-fill salary fields.
     */
    listPositions: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const positions = await prisma.position.findMany({
            where: { companyId, isActive: true },
            orderBy: { title: "asc" },
            select: {
                id: true,
                title: true,
                code: true,
                basicSalary: true,
                grossSalary: true,
                currency: true,
            },
        });
        res.status(httpStatus.OK).json({ success: true, data: positions });
    }),

    previewAllowance: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const {
            employeeId,
            replacedEmployeeId,
            actingAllowanceRuleId,
            actingPositionBasicSalary,
            actingPositionGrossSalary,
            calculationMethod,
            fixedAmount,
            startDate,
            payrollPeriodEndDate,
        } = req.body;

        // Get employee compensation
        const employee = await prisma.employee.findFirst({
            where: { id: employeeId, companyId },
            include: { compensation: { select: { basicSalary: true, grossSalary: true } } },
        });
        if (!employee) {
            throw new CustomError(httpStatus.NOT_FOUND, "Employee not found");
        }

        // Resolve position salary from replaced employee if provided and no explicit salary given
        let resolvedBasicSalary = actingPositionBasicSalary;
        let resolvedGrossSalary = actingPositionGrossSalary;
        if (replacedEmployeeId && (resolvedBasicSalary === undefined || resolvedBasicSalary === null)) {
            const replacedEmp = await prisma.employee.findFirst({
                where: { id: replacedEmployeeId, companyId },
                include: { compensation: { select: { basicSalary: true, grossSalary: true } } },
            });
            if (replacedEmp?.compensation) {
                if (resolvedBasicSalary === undefined || resolvedBasicSalary === null) {
                    resolvedBasicSalary = Number(replacedEmp.compensation.basicSalary ?? 0);
                }
                if (resolvedGrossSalary === undefined || resolvedGrossSalary === null) {
                    resolvedGrossSalary = replacedEmp.compensation.grossSalary
                        ? Number(replacedEmp.compensation.grossSalary)
                        : null;
                }
            }
        }

        // Get rule
        const rule = await prisma.actingAllowanceRule.findFirst({
            where: { id: actingAllowanceRuleId, companyId },
        });
        if (!rule) {
            throw new CustomError(httpStatus.NOT_FOUND, "Rule not found");
        }

        const method = calculationMethod || rule.calculationMethod;

        if (method === "FIXED_AMOUNT" || method === "RULE_FIXED_AMOUNT") {
            const amount = method === "RULE_FIXED_AMOUNT"
                ? (rule.fixedAmount ? Number(rule.fixedAmount) : 0)
                : (fixedAmount ?? 0);
            res.status(httpStatus.OK).json({
                success: true,
                data: {
                    monthsElapsed: 1,
                    matchedTier: null,
                    salaryDiff: 0,
                    allowanceAmount: Number(amount),
                    monthBreakdown: [],
                },
            });
            return;
        }

        // PERCENTAGE method — respect the rule's basis
        const basis = rule.basis ?? "BASIC_DIFF";
        const empSalary = basis === "GROSS_DIFF"
            ? (employee.compensation?.grossSalary ?? 0)
            : (employee.compensation?.basicSalary ?? 0);
        const posSalary = basis === "GROSS_DIFF"
            ? (resolvedGrossSalary ?? resolvedBasicSalary ?? 0)
            : (resolvedBasicSalary ?? 0);

        const tiers: Tier[] = resolveTiers(rule);

        const result = calculateActingAllowance(
            tiers,
            posSalary,
            empSalary,
            new Date(startDate),
            new Date(payrollPeriodEndDate),
        );

        res.status(httpStatus.OK).json({
            success: true,
            data: {
                ...result,
                salaryDiff: result.salaryDiff.toNumber(),
                allowanceAmount: result.allowanceAmount.toNumber(),
                monthBreakdown: result.monthBreakdown.map((m) => ({
                    ...m,
                    amount: m.amount.toNumber(),
                })),
            },
        });
    }),
};
