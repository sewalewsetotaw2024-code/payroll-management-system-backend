import prisma from "../config/database";
import CustomError from "../utils/customError";
import httpStatus from "http-status";

/**
 * Service for self-service payslip access.
 * Employees can view their own payslip periods and detailed payslip data.
 */
export class PayslipService {
    /**
     * Returns fiscal years with nested payroll periods where the authenticated
     * employee has payslip data. Each period includes a `generationStatus` field
     * (NOT_READY | GENERATING | COMPLETED | FAILED) and nullable `payslipId`.
     *
     * If the employee is not found (no employee linked to this user), returns
     * an empty list instead of throwing an error.
     */
    async getMyPeriods(companyId: number, userId: number | string, isHrRole = false) {
        // 1. Determine scope: HR sees all company periods; non-HR sees only their own
        let employeeId: string | null = null;
        let employeeName: string | null = null;
        let periodIds: string[] = [];
        let runItems: { id: string; payrollRun: { payrollPeriodId: string } }[] = [];

        if (isHrRole) {
            // HR — fetch ALL periods that have any payroll run items
            runItems = await prisma.payrollRunItem.findMany({
                where: {
                    payrollRun: {
                        payrollPeriod: { companyId },
                    },
                },
                select: {
                    id: true,
                    payrollRun: {
                        select: { payrollPeriodId: true },
                    },
                },
            });
            periodIds = [...new Set(runItems.map((item) => item.payrollRun.payrollPeriodId))];
        } else {
            // Non-HR — find the Employee record linked to this auth user
            const parsedUserId = Number(userId);

            const appUser = isNaN(parsedUserId) ? null : await prisma.appUser.findUnique({
                where: { id: parsedUserId },
                select: { email: true },
            });

            const employee = await prisma.employee.findFirst({
                where: {
                    companyId,
                    status: "ACTIVE",
                    OR: [
                        { userId: isNaN(parsedUserId) ? undefined : parsedUserId },
                        { externalId: String(userId) },
                        ...(appUser?.email ? [{ email: appUser.email } as any] : []),
                    ],
                },
                select: { id: true, firstName: true, lastName: true },
            });

            if (!employee) {
                return { employeeId: null, employeeName: null, fiscalYears: [] };
            }

            employeeId = employee.id;
            employeeName = `${employee.firstName} ${employee.lastName}`;

            // Find all PayrollRunItems for this employee
            runItems = await prisma.payrollRunItem.findMany({
                where: { employeeId: employee.id },
                select: {
                    id: true,
                    payrollRun: {
                        select: { payrollPeriodId: true },
                    },
                },
            });

            periodIds = [...new Set(runItems.map((item) => item.payrollRun.payrollPeriodId))];
        }

        if (periodIds.length === 0) {
            return {
                employeeId: employeeId ?? null,
                employeeName,
                fiscalYears: [],
            };
        }

        // 4. Fetch Payslip records for these run items to determine generationStatus
        const runItemIds = runItems.map((item) => item.id);
        const payslips = await prisma.payslip.findMany({
            where: { payrollRunItemId: { in: runItemIds } },
            select: { id: true, payrollRunItemId: true, generationStatus: true, visibilityStatus: true },
        });

        // Normalize DB status values to frontend-facing enum
        const normalizeStatus = (s: string): string =>
            s === "PENDING" ? "NOT_READY" : s;

        // Build a map: payrollRunItemId → { payslipId, generationStatus }
        const payslipMap = new Map<string, { payslipId: string; generationStatus: string; visibilityStatus: string }>();
        for (const p of payslips) {
            payslipMap.set(p.payrollRunItemId, {
                payslipId: p.id,
                generationStatus: normalizeStatus(p.generationStatus),
                visibilityStatus: p.visibilityStatus ?? "DRAFT",
            });
        }

        // For non-HR roles, filter out payslips that are still DRAFT
        if (!isHrRole) {
            for (const [itemId, ps] of payslipMap) {
                if (ps.visibilityStatus !== "DONE") {
                    payslipMap.delete(itemId);
                }
            }
        }

        // Build a map: payrollPeriodId → { payslipId, generationStatus }
        // When multiple run items exist for the same period (re-processing),
        // pick the one with the best payslip status.
        // Rank: COMPLETED > GENERATING > FAILED > NOT_READY
        const statusRank = (s: string): number =>
            s === "COMPLETED" ? 4 : s === "GENERATING" ? 3 : s === "FAILED" ? 2 : 1;

        const periodBest = new Map<string, { runItemId: string; payslipId: string | null; generationStatus: string }>();
        for (const item of runItems) {
            const periodId = item.payrollRun.payrollPeriodId;
            const ps = payslipMap.get(item.id);
            const candidate = {
                runItemId: item.id,
                payslipId: ps?.payslipId ?? null,
                generationStatus: ps?.generationStatus ?? "NOT_READY",
            };

            const existing = periodBest.get(periodId);
            if (!existing || statusRank(candidate.generationStatus) > statusRank(existing.generationStatus)) {
                periodBest.set(periodId, candidate);
            }
        }

        // 5. Fetch FiscalYears that contain the employee's periods
        const fiscalYears = await prisma.fiscalYear.findMany({
            where: {
                companyId,
                payrollPeriods: {
                    some: { id: { in: periodIds } },
                },
            },
            include: {
                payrollPeriods: {
                    where: { id: { in: periodIds } },
                    orderBy: { startDate: "desc" },
                    select: {
                        id: true,
                        name: true,
                        cycle: true,
                        startDate: true,
                        endDate: true,
                        status: true,
                    },
                },
            },
            orderBy: { startDate: "desc" },
        });

        // 6. Enrich periods with generationStatus and payslipId
        const enrichedYears = fiscalYears.map((fy) => ({
            id: fy.id,
            name: fy.name,
            startDate: fy.startDate,
            endDate: fy.endDate,
            status: fy.status,
            periods: fy.payrollPeriods.map((period) => {
                const best = periodBest.get(period.id);
                return {
                    id: period.id,
                    name: period.name,
                    cycle: period.cycle,
                    startDate: period.startDate,
                    endDate: period.endDate,
                    status: period.status,
                    generationStatus: best?.generationStatus ?? "NOT_READY",
                    payslipId: best?.payslipId ?? null,
                };
            }),
        }));

        return {
            employeeId: employeeId ?? null,
            employeeName,
            fiscalYears: enrichedYears,
        };
    }

    /**
     * Returns the full payslip detail (PayrollRunItem with all related records)
     * for a specific payroll period and the authenticated employee.
     */
    async getMyPayslipDetail(companyId: number, userId: number | string, periodId: string, isHrRole = false, targetEmployeeId?: string) {
        // 1. Resolve the Employee record
        let employeeId: string;

        if (isHrRole && targetEmployeeId) {
            // HR viewing a specific employee's payslip — use provided employeeId directly
            employeeId = targetEmployeeId;
        } else {
            // Default: look up the employee record for the current user
            const parsedUserId = Number(userId);

            // Look up the AppUser to get their email for fallback matching
            const appUser = isNaN(parsedUserId) ? null : await prisma.appUser.findUnique({
                where: { id: parsedUserId },
                select: { email: true },
            });

            const employee = await prisma.employee.findFirst({
                where: {
                    companyId,
                    status: "ACTIVE",
                    OR: [
                        { userId: isNaN(parsedUserId) ? undefined : parsedUserId },
                        { externalId: String(userId) },
                        ...(appUser?.email ? [{ email: appUser.email } as any] : []),
                    ],
                },
            });

            if (!employee) {
                throw new CustomError(
                    httpStatus.NOT_FOUND,
                    "No active employee record found for this user",
                );
            }

            employeeId = employee.id;
        }

        // 2. Find ALL PayrollRunItems for this employee in the given period,
        //    then pick the one with the best payslip status (COMPLETED > GENERATING > FAILED > NOT_READY).
        //    This handles re-processed payrolls where a later run may have a worse status than an earlier one.
        const runItems = await prisma.payrollRunItem.findMany({
            where: {
                employeeId,
                payrollRun: {
                    payrollPeriodId: periodId,
                },
            },
            include: {
                payrollEarnings: true,
                payrollDeductions: true,
                payrollTax: true,
                payrollPension: true,
                payrollOvertime: true,
                payrollAllowances: true,
                payrollProration: true,
                payslip: true,
                payrollRun: {
                    select: {
                        id: true,
                        payrollPeriodId: true,
                        status: true,
                        processedAt: true,
                        finalizedAt: true,
                        createdAt: true,
                        payrollPeriod: {
                            select: {
                                id: true,
                                name: true,
                                cycle: true,
                                startDate: true,
                                endDate: true,
                                dateOfPayment: true,
                                status: true,
                                fiscalYear: {
                                    select: {
                                        id: true,
                                        name: true,
                                    },
                                },
                                company: {
                                    select: {
                                        id: true,
                                        name: true,
                                    },
                                },
                            },
                        },
                    },
                },
                employee: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        externalId: true,
                        tinNumber: true,
                        jobPosition: true,
                        hireDate: true,
                        department: {
                            select: {
                                name: true,
                            },
                        },
                        company: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        if (runItems.length === 0) {
            throw new CustomError(
                httpStatus.NOT_FOUND,
                "No payslip data found for the specified period",
            );
        }

        // Pick the run item with the best payslip status
        const statusRank = (s: string): number =>
            s === "COMPLETED" ? 4 : s === "GENERATING" ? 3 : s === "FAILED" ? 2 : 1;

        const bestItem = runItems.reduce((best, curr) => {
            const currRank = statusRank(
                curr.payslip?.generationStatus === "PENDING" ? "NOT_READY" : (curr.payslip?.generationStatus ?? "NOT_READY"),
            );
            const bestRank = statusRank(
                best.payslip?.generationStatus === "PENDING" ? "NOT_READY" : (best.payslip?.generationStatus ?? "NOT_READY"),
            );
            return currRank > bestRank ? curr : best;
        });

        // Non-HR users cannot view DRAFT payslips
        if (!isHrRole && bestItem.payslip?.visibilityStatus !== "DONE") {
            throw new CustomError(
                httpStatus.NOT_FOUND,
                "Payslip is not yet available. Please wait until payroll is finalized.",
            );
        }

        const period = bestItem.payrollRun?.payrollPeriod;
        const emp = bestItem.employee;
        const companyName = emp?.company?.name ?? period?.company?.name ?? "ADIU";
        const paymentDate = period?.dateOfPayment ?? bestItem.payrollRun?.processedAt ?? null;

        // Shape the response to match the frontend PayslipDetail type
        return {
            // RunItem identity
            id: bestItem.id,
            payslipId: bestItem.payslip?.id ?? null,
            payslipPdfUrl: bestItem.payslip?.pdfPath ?? null,
            visibilityStatus: bestItem.payslip?.visibilityStatus ?? null,
            generationStatus: bestItem.payslip?.generationStatus === "PENDING" ? "NOT_READY" : (bestItem.payslip?.generationStatus ?? "NOT_READY"),
            errorMessage: bestItem.payslip?.errorMessage ?? null,

            // Payroll run
            payrollRunId: bestItem.payrollRunId,
            periodName: period?.name ?? null,
            periodStart: period?.startDate?.toISOString() ?? "",
            periodEnd: period?.endDate?.toISOString() ?? "",

            // Employee
            employeeId: emp?.externalId ?? emp?.id ?? "",
            employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
            companyName,
            paymentDate: paymentDate ? paymentDate.toISOString() : "",
            departmentName: emp?.department?.name ?? null,
            jobPosition: emp?.jobPosition ?? null,
            tinNumber: emp?.tinNumber ?? null,

            // Salary figures (cast Decimal → number)
            workDays: Number(bestItem.workDays ?? 0),
            basicSalary: Number(bestItem.basicSalary ?? 0),
            proratedSalary: Number(bestItem.proratedSalary ?? 0),
            grossSalary: Number(bestItem.grossSalary ?? 0),
            grossTaxableIncome: Number(bestItem.grossTaxableIncome ?? 0),
            totalDeductions: Number(bestItem.totalDeductions ?? 0),
            netSalary: Number(bestItem.netSalary ?? 0),
            costToCompany: Number(bestItem.costToCompany ?? 0),
            currency: "ETB",

            // Line items
            earnings: (bestItem.payrollEarnings ?? []).map((e: any) => ({
                id: e.id,
                label: e.label ?? e.earningType,
                earningType: e.earningType,
                amount: Number(e.amount),
                isTaxable: e.isTaxable ?? true,
            })),
            deductions: (bestItem.payrollDeductions ?? []).map((d: any) => ({
                id: d.id,
                label: d.label ?? d.deductionType,
                deductionType: d.deductionType,
                amount: Number(d.amount),
                isOverridden: d.isOverridden ?? false,
            })),
            allowances: (bestItem.payrollAllowances ?? []).map((a: any) => ({
                label: a.label ?? a.allowanceType,
                amount: Number(a.amount),
                isTaxable: a.isTaxable ?? false,
            })),
            overtime: (bestItem.payrollOvertime ?? []).map((o: any) => ({
                category: o.category ?? o.overtimeType,
                hours: Number(o.hours ?? 0),
                rate: Number(o.rate ?? 0),
                hourlyRate: Number(o.hourlyRate ?? 0),
                amount: Number(o.amount ?? 0),
                isTaxable: o.isTaxable ?? true,
            })),
            tax: bestItem.payrollTax
                ? {
                    grossTaxableIncome: Number(bestItem.grossTaxableIncome ?? 0),
                    appliedRate: Number(bestItem.payrollTax.appliedRate ?? 0),
                    appliedDeduction: Number(bestItem.payrollTax.appliedDeduction ?? 0),
                    taxAmount: Number(bestItem.payrollTax.taxAmount ?? 0),
                }
                : null,
            pension: bestItem.payrollPension
                ? {
                    basis: bestItem.payrollPension.basis ?? "",
                    baseSalary: Number(bestItem.payrollPension.baseSalary ?? 0),
                    employeeContribution: Number(bestItem.payrollPension.employeeContribution ?? 0),
                    employerContribution: Number(bestItem.payrollPension.employerContribution ?? 0),
                }
                : null,
        };
    }

    /**
     * Generates Payslip records for every PayrollRunItem in a given payroll run.
     * All payslips are created with visibilityStatus = DRAFT.
     * Skips items that already have a Payslip record (idempotent).
     * Returns counts of total, generated, and skipped items.
     */
    async generatePayslipsForRun(payrollRunId: string, templateId?: string) {
        // Verify the run exists
        const run = await prisma.payrollRun.findUnique({
            where: { id: payrollRunId },
            select: { id: true, status: true },
        });

        if (!run) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll run not found");
        }

        // Get all run items for this run
        const runItems = await prisma.payrollRunItem.findMany({
            where: { payrollRunId },
            select: { id: true },
        });

        if (runItems.length === 0) {
            return { runId: payrollRunId, total: 0, generated: 0, skipped: 0 };
        }

        const runItemIds = runItems.map((item) => item.id);

        // Find existing payslips to avoid duplicates
        const existingPayslips = await prisma.payslip.findMany({
            where: { payrollRunItemId: { in: runItemIds } },
            select: { payrollRunItemId: true },
        });

        const existingItemIds = new Set(existingPayslips.map((p) => p.payrollRunItemId));

        // Create payslips only for items that don't have one yet
        const itemsToCreate = runItemIds.filter((id) => !existingItemIds.has(id));

        if (itemsToCreate.length > 0) {
            await prisma.payslip.createMany({
                data: itemsToCreate.map((itemId) => ({
                    payrollRunItemId: itemId,
                    templateId: templateId ?? null,
                    generationStatus: "PENDING",
                    visibilityStatus: "DRAFT",
                })),
                skipDuplicates: true,
            });
        }

        return {
            runId: payrollRunId,
            total: runItems.length,
            generated: itemsToCreate.length,
            skipped: existingPayslips.length,
        };
    }

    /**
     * Update the visibility status of all payslips linked to a payroll run.
     * @param payrollRunId - The payroll run whose payslips should be updated.
     * @param visibility - The target visibility status (e.g. "DONE").
     * @returns The number of payslips updated.
     */
    async updateVisibilityForRun(payrollRunId: string, visibility: string) {
        // Get all run items for this run
        const runItems = await prisma.payrollRunItem.findMany({
            where: { payrollRunId },
            select: { id: true },
        });

        if (runItems.length === 0) {
            return { updated: 0 };
        }

        const runItemIds = runItems.map((item) => item.id);

        const result = await prisma.payslip.updateMany({
            where: { payrollRunItemId: { in: runItemIds } },
            data: { visibilityStatus: visibility as any },
        });

        return { updated: result.count };
    }
}

export const payslipService = new PayslipService();
