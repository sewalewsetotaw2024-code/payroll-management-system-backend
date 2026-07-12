import type { Request, Response } from "express";
import httpStatus from "http-status";
import asyncHandler from "../utils/asyncHandler";
import CustomError from "../utils/customError";
import { LeaveSyncService } from "../services/sync/leaveSync.service";
import { leaveCalculationService } from "../services/leaveCalculation.service";
import { resolveCompanyId } from "../utils/roleGuard";
import prisma from "../config/database";
import { Prisma } from "../generated/prisma";
import { leavePeriodService } from "../services/leavePeriod.service";

export const LeaveController = {
    /** POST /leave/sync — Sync leave data from EMS */
    syncLeave: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith("Bearer ")) {
            throw new CustomError(httpStatus.UNAUTHORIZED, "Missing Authorization header");
        }
        const token = auth.slice(7);
        const { fiscalYear, payrollPeriodId } = req.body;

        const sync = new LeaveSyncService(token, companyId);
        const result = await sync.runFullSync(fiscalYear, payrollPeriodId);

        res.status(httpStatus.OK).json({
            success: true,
            message: "Leave sync completed",
            data: result,
        });
    }),

    /** GET /leave/balances — List leave balances */
    getBalances: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { employeeId, fiscalYear, leaveType } = req.query;

        const where: Prisma.LeaveBalanceWhereInput = { companyId };
        if (employeeId) where.employeeId = employeeId as string;
        if (fiscalYear) where.fiscalYear = Number(fiscalYear);
        if (leaveType) where.leaveType = leaveType as string;

        const balances = await prisma.leaveBalance.findMany({
            where,
            include: {
                employee: { select: { id: true, firstName: true, lastName: true, departmentId: true } },
            },
            orderBy: [{ fiscalYear: "desc" }, { employee: { firstName: "asc" } }],
        });

        res.status(httpStatus.OK).json({ success: true, data: balances });
    }),

    /** GET /leave/applications — List leave applications */
    getApplications: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { employeeId, status, startDate, endDate } = req.query;

        const where: Prisma.LeaveApplicationWhereInput = { companyId };
        if (employeeId) where.employeeId = employeeId as string;
        if (status) where.status = status as string;

        // Use OVERLAPPING date range: leave that overlaps the requested period
        // (startDate <= periodEnd) AND (endDate >= periodStart)
        if (startDate || endDate) {
            where.AND = [
                ...(endDate ? [{ startDate: { lte: new Date(endDate as string) } }] : []),
                ...(startDate ? [{ endDate: { gte: new Date(startDate as string) } }] : []),
            ];
        }

        const applications = await prisma.leaveApplication.findMany({
            where,
            include: {
                employee: { select: { id: true, firstName: true, lastName: true, departmentId: true } },
            },
            orderBy: { startDate: "desc" },
        });

        res.status(httpStatus.OK).json({ success: true, data: applications });
    }),

    /** GET /leave/deductions — List leave deductions */
    getDeductions: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { payrollPeriodId, employeeId } = req.query;

        const where: Prisma.LeaveDeductionWhereInput = { companyId };
        if (payrollPeriodId) where.payrollPeriodId = payrollPeriodId as string;
        if (employeeId) where.employeeId = employeeId as string;

        const deductions = await prisma.leaveDeduction.findMany({
            where,
            include: {
                employee: { select: { id: true, firstName: true, lastName: true } },
                payrollPeriod: { select: { id: true, name: true, startDate: true, endDate: true } },
            },
            orderBy: { updatedAt: "desc" },
        });

        res.status(httpStatus.OK).json({ success: true, data: deductions });
    }),

    /** POST /leave/calculate-deductions — Compute unpaid leave deduction amounts */
    calculateDeductions: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { payrollPeriodId } = req.body;

        if (!payrollPeriodId) {
            throw new CustomError(httpStatus.BAD_REQUEST, "payrollPeriodId is required");
        }

        const result = await leaveCalculationService.calculateUnpaidDeductions(companyId, payrollPeriodId);

        res.status(httpStatus.OK).json({
            success: true,
            message: "Deductions calculated",
            data: result,
        });
    }),

    /**
     * POST /leave/calculate-from-attendance
     * Calculate paid and unpaid leave from attendance monthly summaries
     * for the given payroll period.  Persists LeaveDeduction records so
     * downstream payroll processing can consume them.
     */
    calculateLeaveFromAttendance: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { payrollPeriodId } = req.body;

        if (!payrollPeriodId) {
            throw new CustomError(httpStatus.BAD_REQUEST, "payrollPeriodId is required");
        }

        const result = await leaveCalculationService.calculateLeaveFromAttendance(companyId, payrollPeriodId);

        res.status(httpStatus.OK).json({
            success: true,
            message: "Leave calculated from attendance data",
            data: result,
        });
    }),

    /**
     * GET /leave/employee-items
     * Fetch PayrollLeaveItem records for a specific employee (across all periods).
     * Includes payroll period info for context in the EmployeeDetailModal.
     * Unlike /breakdown (which targets one run item), this endpoint queries all
     * PayrollLeaveItem records for the employee regardless of which run they belong to.
     */
    getEmployeeLeaveItems: asyncHandler(async (req: Request, res: Response) => {
        const { employeeId } = req.query;

        if (!employeeId) {
            throw new CustomError(httpStatus.BAD_REQUEST, "employeeId is required");
        }

        // Fetch all leave items for this employee, newest first, grouped by period
        const items = await prisma.payrollLeaveItem.findMany({
            where: { employeeId: employeeId as string },
            include: {
                payrollPeriod: {
                    select: { id: true, name: true, startDate: true, endDate: true },
                },
            },
            orderBy: [{ syncedAt: "desc" }, { leaveType: "asc" }],
        });

        res.status(httpStatus.OK).json({ success: true, data: items });
    }),

    /**
     * GET /leave/run-summary
     * Aggregate PayrollLeaveItem totals across all items in a PayrollRun.
     * Queries existing synced data from the payroll DB only (no EMS calls).
     * Returns totals that survive page navigation — used by PayrollProcessingPage
     * to display the leave deduction stat card and summary line item on mount.
     */
    getLeaveRunSummary: asyncHandler(async (req: Request, res: Response) => {
        const { payrollRunId } = req.query;

        if (!payrollRunId) {
            throw new CustomError(httpStatus.BAD_REQUEST, "payrollRunId is required");
        }

        // Find all PayrollRunItems for this run, then aggregate their PayrollLeaveItems
        const items = await prisma.payrollRunItem.findMany({
            where: { payrollRunId: payrollRunId as string },
            select: {
                id: true,
                employee: { select: { id: true, firstName: true, lastName: true } },
                payrollLeaveItems: {
                    select: {
                        leaveType: true,
                        leaveDaysInPeriod: true,
                        isPaid: true,
                        deductionAmount: true,
                    },
                },
            },
        });

        let totalDeductions = 0;
        let totalEmployees = 0;
        let totalLeaveTypes = 0;
        const leaveTypeSet = new Set<string>();
        const details: Array<{
            employeeId: string;
            employeeName: string;
            leaveType: string;
            days: number;
            isPaid: boolean;
            deductionAmount: number;
        }> = [];

        for (const item of items) {
            if (item.payrollLeaveItems.length === 0) continue;
            totalEmployees++;
            const name = `${item.employee.firstName} ${item.employee.lastName}`;
            for (const pli of item.payrollLeaveItems) {
                leaveTypeSet.add(pli.leaveType);
                totalDeductions += Number(pli.deductionAmount);
                details.push({
                    employeeId: item.employee.id,
                    employeeName: name,
                    leaveType: pli.leaveType,
                    days: Number(pli.leaveDaysInPeriod),
                    isPaid: pli.isPaid,
                    deductionAmount: Number(pli.deductionAmount),
                });
            }
        }

        totalLeaveTypes = leaveTypeSet.size;

        res.status(httpStatus.OK).json({
            success: true,
            data: {
                totalEmployees,
                totalLeaveTypes,
                totalDeductions: Math.round(totalDeductions * 100) / 100,
                details,
            },
        });
    }),

    /**
     * GET /leave/breakdown
     * Fetch PayrollLeaveItem records for a single PayrollRunItem.
     * Used by EmployeePayrollBreakdown modal to display the per-leave-type table
     * (leave type, days, paid/unpaid badge, deduction amount).
     */
    getLeaveBreakdown: asyncHandler(async (req: Request, res: Response) => {
        const { payrollRunItemId } = req.query;

        if (!payrollRunItemId) {
            throw new CustomError(httpStatus.BAD_REQUEST, "payrollRunItemId is required");
        }

        const items = await prisma.payrollLeaveItem.findMany({
            where: { payrollRunItemId: payrollRunItemId as string },
            orderBy: { leaveType: "asc" },
        });

        res.status(httpStatus.OK).json({ success: true, data: items });
    }),

    /**
     * POST /leave/sync-period
     * Sync period-accurate leave for a single PayrollRunItem (one employee).
     * Fetches approved leave from the EMS database, computes days-in-period
     * with half-day support, and upserts PayrollLeaveItem records.
     */
    syncLeavePeriod: asyncHandler(async (req: Request, res: Response) => {
        const { companyId, periodStart, periodEnd, payrollRunItemId } = req.body;

        if (!companyId || !periodStart || !periodEnd || !payrollRunItemId) {
            throw new CustomError(
                httpStatus.BAD_REQUEST,
                "Missing required fields: companyId, periodStart, periodEnd, payrollRunItemId",
            );
        }

        // Extract bearer token for employee module API calls
        const auth = req.headers.authorization;
        const apiToken = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;

        const result = await leavePeriodService.syncLeaveForPeriod(
            Number(companyId),
            new Date(periodStart),
            new Date(periodEnd),
            payrollRunItemId,
            apiToken,
        );

        res.status(httpStatus.OK).json({
            success: true,
            data: result,
        });
    }),

    /**
     * POST /leave/sync-period-run
     * Sync period-accurate leave for ALL PayrollRunItems in a PayrollRun at once.
     * Fetches EMS leave data ONCE for the whole period (one query), then processes
     * each employee's items by matching externalId. More efficient than calling
     * syncLeavePeriod per employee.
     */
    syncLeavePeriodByRun: asyncHandler(async (req: Request, res: Response) => {
        const { companyId, periodStart, periodEnd, payrollRunId } = req.body;

        if (!companyId || !periodStart || !periodEnd || !payrollRunId) {
            throw new CustomError(
                httpStatus.BAD_REQUEST,
                "Missing required fields: companyId, periodStart, periodEnd, payrollRunId",
            );
        }

        // Extract bearer token for employee module API calls
        const auth = req.headers.authorization;
        const apiToken = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;

        const result = await leavePeriodService.syncLeaveForRun(
            Number(companyId),
            new Date(periodStart),
            new Date(periodEnd),
            payrollRunId,
            apiToken,
        );

        res.status(httpStatus.OK).json({
            success: true,
            data: result,
        });
    }),

    /** GET /leave/sync-logs — Recent sync log entries */
    getSyncLogs: asyncHandler(async (_req: Request, res: Response) => {
        const logs = await prisma.leaveSyncLog.findMany({
            orderBy: { syncedAt: "desc" },
            take: 50,
        });

        res.status(httpStatus.OK).json({ success: true, data: logs });
    }),
};
