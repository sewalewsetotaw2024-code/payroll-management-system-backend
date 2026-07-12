import type { Request, Response } from "express";
import httpStatus from "http-status";
import asyncHandler from "../utils/asyncHandler";
import CustomError from "../utils/customError";
import { attendanceImportService } from "../services/attendanceImport.service";
import { attendancePeriodSummaryService } from "../services/attendancePeriodSummary.service";
import { resolveCompanyId } from "../utils/roleGuard";
import prisma from "../config/database";
import * as XLSX from "xlsx";

/**
 * Resolves the target sheet name from the uploaded workbook.
 * Priority: 1) explicit `sheetName` in body, 2) first sheet name found in the workbook.
 */
function resolveSheetName(file: Express.Multer.File, bodySheetName?: string): string {
    if (bodySheetName) return bodySheetName;
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const firstSheet = workbook.SheetNames[0];
    if (firstSheet) return firstSheet;
    // Ultimate fallback: last 8 chars of the filename (period code convention)
    return file.originalname.replace(/\.xlsx?$/i, "").slice(-8);
}

export const AttendanceController = {
    /**
     * Retrieves daily attendance records for a single employee within an import,
     * grouped by month for the frontend heatmap. Returns pre-structured months
     * with per-day hours and absence status — the heatmap renders this directly.
     *
     * @param req - Express request with `importId` and `employeeId` route params.
     * @param res - Express response returning months-grouped daily records.
     */
    getEmployeeDailyRecords: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { importId, employeeId } = req.params;

            const result = await attendanceImportService.getEmployeeDailyRecords(
                companyId,
                importId,
                employeeId,
            );

            res.status(httpStatus.OK).json({
                success: true,
                message: "Daily records fetched successfully",
                data: result,
            });
        },
    ),
    /**
     * Imports biometric attendance data from an uploaded Excel file for a specific
     * payroll period. Parses the workbook via the attendanceImportService and
     * creates AttendanceRecord & AttendanceMonthlySummary entries.
     *
     * @param req - Express request with a `file` (multer) and optional `sheetName` body field.
     * @param res - Express response returning the import summary.
     * @throws {CustomError} If no file is attached to the request.
     */
    importAttendance: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const file = req.file;

            if (!file) {
                throw new CustomError(httpStatus.BAD_REQUEST, "No file uploaded");
            }

            const sheetName = resolveSheetName(file, req.body.sheetName);
            const userId = (req.user?.id as string) || "system";

            const result = await attendanceImportService.importFromExcel(
                companyId,
                userId,
                file,
                sheetName,
            );

            res.status(httpStatus.CREATED).json({
                success: true,
                message: "Attendance data imported successfully",
                data: result,
            });
        },
    ),

    /**
     * Calculates overtime for all attendance records belonging to a given import.
     * Uses the service layer to apply configured workday rules and OT rates.
     *
     * @param req - Express request with `importId` route parameter.
     * @param res - Express response returning overtime calculation summary.
     */
    calculateOvertime: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { importId } = req.params;

            const result = await attendanceImportService.calculateOvertime(
                companyId,
                importId,
            );

            res.status(httpStatus.OK).json({
                success: true,
                message: "Overtime calculated successfully",
                data: result,
            });
        },
    ),

    /**
     * Lists all attendance imports for the authenticated company, with optional
     * filtering by period label, source, or status. Results are ordered newest-first.
     *
     * @param req - Express request with optional `periodLabel`, `source`, `status` query params.
     * @param res - Express response returning the import list.
     */
    listImports: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);

            const { periodLabel, source, status } = req.query;

            // Build a filter object from provided query params (falsy values omitted)
            const filter: Record<string, unknown> = {};
            if (periodLabel) filter.periodLabel = periodLabel;
            if (source) filter.source = source;
            if (status) filter.status = status;

            const imports = await prisma.attendanceImport.findMany({
                where: {
                    payrollPeriod: { companyId },
                    ...filter,
                },
                orderBy: { importedAt: "desc" },
                include: {
                    _count: {
                        select: {
                            attendanceRecords: true,
                            monthlySummaries: true,
                        },
                    },
                    payrollPeriod: {
                        select: {
                            id: true,
                            startDate: true,
                            endDate: true,
                            name: true,
                        },
                    },
                },
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "Attendance imports fetched successfully",
                data: imports,
            });
        },
    ),

    /**
     * Retrieves a single attendance import by its ID, including its attendance
     * records (up to 100), monthly summaries, and payroll period details.
     *
     * @param req - Express request with `importId` route parameter.
     * @param res - Express response returning the full import record.
     * @throws {CustomError} If the import is not found or does not belong to the company.
     */
    getImportById: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { importId } = req.params;

            const importRecord = await prisma.attendanceImport.findFirst({
                where: {
                    id: importId,
                    payrollPeriod: { companyId },
                },
                include: {
                    attendanceRecords: {
                        include: {
                            employee: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    compensation: {
                                        select: {
                                            basicSalary: true,
                                            grossSalary: true,
                                        },
                                    },
                                },
                            },
                        },
                        take: 100,
                    },
                    monthlySummaries: {
                        include: {
                            employee: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    compensation: {
                                        select: {
                                            basicSalary: true,
                                            grossSalary: true,
                                        },
                                    },
                                    allowances: {
                                        select: {
                                            allowanceType: true,
                                            amount: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    attendancePeriodSummaries: {
                        select: {
                            employeeId: true,
                            actualDays: true,
                            workingDays: true,
                            totalHours: true,
                            regularHours: true,
                            paidLeaveHours: true,
                            absenceHours: true,
                        },
                    },
                    payrollPeriod: true,
                },
            });

            if (!importRecord) {
                throw new CustomError(
                    httpStatus.NOT_FOUND,
                    "Import not found",
                );
            }

            res.status(httpStatus.OK).json({
                success: true,
                message: "Import record fetched successfully",
                data: importRecord,
            });
        },
    ),

    /**
     * POST /attendance/imports/:importId/calculate-summary — Calculate
     * attendance summary (total hours + total days) from attendance data.
     * Results are persisted for display in the Attendance Summary tab.
     */
    calculateSummary: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { importId } = req.params;

            const result = await attendancePeriodSummaryService.calculateSummary(
                companyId,
                importId,
            );

            res.status(httpStatus.OK).json({
                success: true,
                message: "Attendance summary calculated successfully",
                data: result,
            });
        },
    ),

    /**
     * GET /attendance/imports/:importId/overtime — Retrieve existing
     * overtime calculation results without re-calculating.
     */
    getOvertimeResults: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { importId } = req.params;

            const result = await attendanceImportService.getOvertimeResults(
                companyId,
                importId,
            );

            if (!result) {
                res.status(httpStatus.NOT_FOUND).json({
                    success: false,
                    message: "No overtime calculation found for this import. Click 'Calculate OT' to generate.",
                });
                return;
            }

            res.status(httpStatus.OK).json({
                success: true,
                message: "Overtime results fetched successfully",
                data: result,
            });
        },
    ),

    /**
     * GET /attendance/imports/:importId/summary — Retrieve previously
     * calculated attendance summary for an import.
     */
    getSummary: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { importId } = req.params;

            const result = await attendancePeriodSummaryService.getSummary(
                companyId,
                importId,
            );

            if (!result) {
                res.status(httpStatus.NOT_FOUND).json({
                    success: false,
                    message: "No attendance summary found for this import",
                });
                return;
            }

            res.status(httpStatus.OK).json({
                success: true,
                data: result,
            });
        },
    ),

    /**
     * Deletes an attendance import and all associated records (overtime records,
     * attendance records, monthly summaries) within a single transaction.
     *
     * @param req - Express request with `importId` route parameter.
     * @param res - Express response confirming deletion.
     * @throws {CustomError} If the import is not found or does not belong to the company.
     */
    deleteImport: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { importId } = req.params;

            const importRecord = await prisma.attendanceImport.findFirst({
                where: { id: importId, payrollPeriod: { companyId } },
            });

            if (!importRecord) {
                throw new CustomError(
                    httpStatus.NOT_FOUND,
                    "Import not found",
                );
            }

            // Cascade-delete related records, then the import itself
            await prisma.$transaction([
                prisma.overtimeRecord.deleteMany({
                    where: {
                        attendanceRecord: { attendanceImportId: importId },
                    },
                }),
                prisma.attendanceRecord.deleteMany({
                    where: { attendanceImportId: importId },
                }),
                prisma.attendanceMonthlySummary.deleteMany({
                    where: { attendanceImportId: importId },
                }),
                prisma.attendanceImport.delete({
                    where: { id: importId },
                }),
            ]);

            res.status(httpStatus.OK).json({
                success: true,
                message: "Import deleted successfully",
            });
        },
    ),

    /**
     * Toggle the active status of an attendance import.
     * When activating an import, all other imports for the same payroll period
     * are automatically deactivated (only one active import per period).
     *
     * @param req - Express request with `importId` route parameter.
     * @param res - Express response confirming the status change.
     * @throws {CustomError} If the import is not found or does not belong to the company.
     */
    toggleImportActive: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { importId } = req.params;

            const importRecord = await prisma.attendanceImport.findFirst({
                where: { id: importId, payrollPeriod: { companyId } },
            });

            if (!importRecord) {
                throw new CustomError(
                    httpStatus.NOT_FOUND,
                    "Import not found",
                );
            }

            const newActiveState = !importRecord.isActive;

            if (newActiveState) {
                // Deactivate all other imports for the same payroll period
                await prisma.$transaction([
                    prisma.attendanceImport.updateMany({
                        where: {
                            payrollPeriodId: importRecord.payrollPeriodId,
                            id: { not: importId },
                        },
                        data: { isActive: false },
                    }),
                    prisma.attendanceImport.update({
                        where: { id: importId },
                        data: { isActive: true },
                    }),
                ]);
            } else {
                // Simply deactivate this import
                await prisma.attendanceImport.update({
                    where: { id: importId },
                    data: { isActive: false },
                });
            }

            res.status(httpStatus.OK).json({
                success: true,
                message: newActiveState
                    ? "Import activated successfully"
                    : "Import deactivated successfully",
                data: { id: importId, isActive: newActiveState },
            });
        },
    ),

    /** POST /attendance/imports/:importId/submit-for-approval — Generate XLSX snapshot, store in exportData, create approval request */
    submitForApproval: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const userId = (req as any).user?.id;
        const { importId } = req.params;

        if (!userId) {
            throw new CustomError(httpStatus.UNAUTHORIZED, "User ID not found");
        }

        // 1. Generate XLSX snapshot
        const { attendanceExportService } = await import("../services/attendanceExport.service");
        const buffer = await attendanceExportService.generateExport(importId);
        const base64 = buffer.toString("base64");

        // 2. Store in exportData field
        await prisma.attendanceImport.update({
            where: { id: importId },
            data: { exportData: base64 },
        });

        // 3. Create approval request
        const { approvalWorkflowService } = await import("../services/approvalWorkflow.service");
        const request = await approvalWorkflowService.requestApproval(
            companyId,
            Number(userId),
            "PAYROLL_DOCUMENT",
            "ATTENDANCE_IMPORT",
            undefined,
            importId,
        );

        res.status(httpStatus.OK).json({
            success: true,
            message: "Attendance submitted for approval",
            data: request,
        });
    }),

    /** GET /attendance/imports/:importId/export — Download the XLSX snapshot */
    exportAttendanceXlsx: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { importId } = req.params;

        const importRecord = await prisma.attendanceImport.findFirst({
            where: { id: importId, payrollPeriod: { companyId } },
            select: { exportData: true, periodLabel: true },
        });

        if (!importRecord?.exportData) {
            throw new CustomError(httpStatus.NOT_FOUND, "No export data found. Submit for approval first.");
        }

        const buffer = Buffer.from(importRecord.exportData, "base64");
        const filename = `attendance-${importRecord.periodLabel || importId}.xlsx`;

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(buffer);
    }),
};
