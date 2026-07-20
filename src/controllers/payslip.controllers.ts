import type { Request, Response } from "express";
import httpStatus from "http-status";
import asyncHandler from "../utils/asyncHandler";
import prisma from "../config/database";
import { payslipService } from "../services/payslip.service";
import { payslipRenderService } from "../services/payslipRender.service";
import { resolveCompanyId } from "../utils/roleGuard";
import CustomError from "../utils/customError";

/**
 * Controller for self-service payslip endpoints.
 * Any authenticated user (employee or admin) can access these — the service
 * filters by the user's linked Employee record.
 */
export const PayslipController = {
    /**
     * GET /payslips/periods
     * Returns fiscal years with nested payroll periods for the authenticated
     * employee, each with a hasPayslip flag.
     */
    getMyPeriods: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req);
        const userId = (req as any).user?.id;
        const userRole = (req as any).user?.role ?? "";
        const isHrRole = ["HR Generalist", "HR CS Manager", "HR CS Director"].includes(userRole);

        if (!userId) {
            res.status(httpStatus.UNAUTHORIZED).json({
                success: false,
                message: "User ID not found",
            });
            return;
        }

        const result = await payslipService.getMyPeriods(companyId, userId, isHrRole);

        res.status(httpStatus.OK).json({
            success: true,
            message: "Payslip periods fetched successfully",
            data: result,
        });
    }),

    /**
     * GET /payslips/period/:periodId
     * Returns the full payslip detail (PayrollRunItem with all breakdowns)
     * for a specific payroll period and the authenticated employee.
     */
    getMyPayslipDetail: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req);
        const userId = (req as any).user?.id;
        const { periodId } = req.params;
        const { employeeId } = req.query;   // optional — HR can target any employee
        const userRole = (req as any).user?.role ?? "";
        const isHrRole = ["HR Generalist", "HR CS Manager", "HR CS Director"].includes(userRole);

        // Only HR can pass employeeId (access control)
        if (employeeId && !isHrRole) {
            res.status(httpStatus.FORBIDDEN).json({
                success: false,
                message: "Only HR users can view other employees' payslips",
            });
            return;
        }

        if (!userId) {
            res.status(httpStatus.UNAUTHORIZED).json({
                success: false,
                message: "User ID not found",
            });
            return;
        }

        const result = await payslipService.getMyPayslipDetail(
            companyId,
            userId,
            periodId,
            isHrRole,
            employeeId as string | undefined,
        );

        res.status(httpStatus.OK).json({
            success: true,
            message: "Payslip detail fetched successfully",
            data: result,
        });
    }),

    /** POST /payslips/generate/:runItemId — Generate PDF for one payslip (admin) */
    generatePayslipPdf: asyncHandler(async (req: Request, res: Response) => {
      const companyId = resolveCompanyId(req);
      const { runItemId } = req.params;
      const { templateId } = req.body;

      const result = await payslipRenderService.generatePayslipPdf({
        companyId,
        runItemId,
        templateId,
      });

      res.status(httpStatus.OK).json({
        success: true,
        message: "Payslip PDF generated",
        data: result,
      });
    }),

    /**
     * POST /payslips/generate-mine/:periodId
     * Lets the authenticated employee generate their own payslip PDF for a
     * specific payroll period. Finds the employee's PayrollRunItem, then
     * delegates to the render service.
     */
    generateMyPayslipPdf: asyncHandler(async (req: Request, res: Response) => {
      const companyId = resolveCompanyId(req);
      const userId = (req as any).user?.id;
      const { periodId } = req.params;
      const { templateId } = req.body;

      if (!userId) {
        res.status(httpStatus.UNAUTHORIZED).json({
          success: false,
          message: "User ID not found",
        });
        return;
      }

      // Find the employee record
      const parsedUserId = Number(userId);
      const employee = await prisma.employee.findFirst({
        where: {
          companyId,
          status: "ACTIVE",
          OR: [
            { userId: isNaN(parsedUserId) ? undefined : parsedUserId },
            { externalId: String(userId) },
          ],
        },
      });

      if (!employee) {
        throw new CustomError(httpStatus.NOT_FOUND, "No active employee record found for this user");
      }

      // Find the run item for this employee in the given period
      const runItem = await prisma.payrollRunItem.findFirst({
        where: {
          employeeId: employee.id,
          payrollRun: { payrollPeriodId: periodId },
        },
        select: { id: true },
      });

      if (!runItem) {
        throw new CustomError(
          httpStatus.NOT_FOUND,
          "No payroll data found for this period. Payroll may not have been processed yet.",
        );
      }

      const result = await payslipRenderService.generatePayslipPdf({
        companyId,
        runItemId: runItem.id,
        templateId,
      });

      res.status(httpStatus.OK).json({
        success: true,
        message: "Your payslip PDF has been generated",
        data: result,
      });
    }),

    /** POST /payslips/batch-generate/:payrollRunId — Generate PDFs for all employees in a run */
    batchGeneratePayslipPdfs: asyncHandler(async (req: Request, res: Response) => {
      const companyId = resolveCompanyId(req);
      const { payrollRunId } = req.params;
      const { templateId } = req.body;

      const result = await payslipRenderService.batchGeneratePayslipPdfs({
        companyId,
        payrollRunId,
        templateId,
      });

      res.status(httpStatus.OK).json({
        success: true,
        message: `Generated ${result.succeeded}/${result.total} payslip PDFs`,
        data: result,
      });
    }),

    /** GET /payslips/batch-status/:payrollRunId — Returns generation progress for a run */
    getBatchStatus: asyncHandler(async (req: Request, res: Response) => {
      const companyId = resolveCompanyId(req);
      const { payrollRunId } = req.params;

      // Verify the run belongs to this company
      const run = await prisma.payrollRun.findFirst({
        where: { id: payrollRunId, payrollPeriod: { companyId } },
        select: { id: true },
      });

      if (!run) {
        throw new CustomError(httpStatus.NOT_FOUND, "Payroll run not found");
      }

      // Get all run items with their payslip records
      const items = await prisma.payrollRunItem.findMany({
        where: { payrollRunId },
        select: {
          id: true,
          employee: { select: { firstName: true, lastName: true } },
          payslip: {
            select: {
              generationStatus: true,
              pdfPath: true,
              errorMessage: true,
            },
          },
        },
      });

      const total = items.length;
      let completed = 0;
      let failed = 0;
      let pending = 0;
      let generating = 0;

      const statusItems = items.map((item) => {
        const status = item.payslip?.generationStatus ?? "PENDING";
        if (status === "COMPLETED") completed++;
        else if (status === "FAILED") failed++;
        else if (status === "GENERATING") generating++;
        else pending++;

        return {
          employeeName: `${item.employee.firstName} ${item.employee.lastName}`,
          status,
          pdfUrl: item.payslip?.pdfPath ?? null,
          error: item.payslip?.errorMessage ?? null,
        };
      });

      res.status(httpStatus.OK).json({
        success: true,
        message: "Batch generation status fetched",
        data: { total, completed, failed, pending, generating, items: statusItems },
      });
    }),

    /**
     * POST /runs/:runId/generate-payslips
     * Generates Payslip records for every employee in a payroll run.
     * Restricted to HR roles (HR Generalist, HR CS Manager, HR CS Director).
     * Only allowed when the PayrollRun status >= PENDING_PAYMENT_APPROVAL.
     */
    generatePayslipsForRun: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req);
        const { runId } = req.params;

        // 1. Verify the run exists and belongs to this company
        const run = await prisma.payrollRun.findFirst({
            where: {
                id: runId,
                payrollPeriod: { companyId },
            },
            select: { id: true, status: true },
        });

        if (!run) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll run not found");
        }

        // 2. Validate status — only allow when payroll approval is done
        const allowedStatuses = [
            "PENDING_PAYMENT_APPROVAL",
            "APPROVED",
            "DONE",
        ];

        if (!allowedStatuses.includes(run.status)) {
            throw new CustomError(
                httpStatus.FORBIDDEN,
                `Cannot generate payslips for a run with status "${run.status}". Payroll must be approved first.`,
            );
        }

        // 3. Role check is handled by the route middleware (requirePayslipGenerationAccess)
        //    so we just delegate to the service
        const result = await payslipService.generatePayslipsForRun(runId);

        res.status(httpStatus.OK).json({
            success: true,
            message: `Generated ${result.generated} payslip(s), ${result.skipped} already existed`,
            data: result,
        });
    }),

    /** GET /payslips/:id/pdf — View or download the payslip PDF */
    getPayslipPdf: asyncHandler(async (req: Request, res: Response) => {
      const companyId = resolveCompanyId(req);
      const { id } = req.params;
      const isDownload = req.query.download === "1";

      const payslip = await prisma.payslip.findFirst({
        where: {
          id,
          payrollRunItem: {
            payrollRun: {
              payrollPeriod: { companyId },
            },
          },
        },
        include: {
          payrollRunItem: {
            include: {
              payrollRun: {
                include: {
                  payrollPeriod: { select: { name: true } },
                },
              },
              employee: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      if (!payslip?.pdfPath) {
        throw new CustomError(httpStatus.NOT_FOUND, "Payslip PDF not found. Generate it first.");
      }

      if (isDownload) {
        // Stream the PDF from Cloudinary with download headers
        const response = await fetch(payslip.pdfPath);
        if (!response.ok) {
          throw new CustomError(httpStatus.BAD_GATEWAY, "Failed to fetch PDF from storage");
        }

        const periodName = payslip.payrollRunItem?.payrollRun?.payrollPeriod?.name ?? "payslip";
        const employeeName = payslip.payrollRunItem?.employee
          ? `${payslip.payrollRunItem.employee.firstName}_${payslip.payrollRunItem.employee.lastName}`
          : "employee";
        const filename = `payslip-${periodName.replace(/\s+/g, "_")}-${employeeName}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

        // Pipe the Cloudinary PDF through Express
        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
      } else {
        // View in browser — redirect to Cloudinary URL
        res.redirect(payslip.pdfPath);
      }
    }),

    /**
     * PUT /runs/:runId/payslips/visibility — Update all payslip visibility to DONE for a run.
     */
    updatePayslipVisibility: asyncHandler(async (req: Request, res: Response) => {
      const { runId } = req.params;
      const { visibility } = req.body;

      const result = await payslipService.updateVisibilityForRun(runId, visibility ?? "DONE");

      res.status(httpStatus.OK).json({
        success: true,
        message: `Payslip visibility updated to ${visibility ?? "DONE"}`,
        data: result,
      });
    }),
};
