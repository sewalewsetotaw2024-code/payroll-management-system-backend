import { Request, Response } from "express";
import asyncHandler from "../utils/asyncHandler";
import { paymentExportService } from "../services/paymentExport.service";
import prisma from "../config/database";
import CustomError from "../utils/customError";
import httpStatus from "http-status";

export const PaymentExportController = {
  /**
   * GET /payment-export/:runId/excel
   * Downloads a full-detailed Excel workbook for a payroll run.
   */
  downloadExcel: asyncHandler(async (req: Request, res: Response) => {
    const { runId } = req.params;
    console.log("[PaymentExport] ===== EXCEL DOWNLOAD REQUEST =====");
    console.log("[PaymentExport] Requested runId:", runId);
    if (!runId) {
      throw new CustomError(httpStatus.BAD_REQUEST, "Run ID is required");
    }

    // Debug: verify data exists for the requested run
    const runCheck = await prisma.payrollRun.findUnique({
      where: { id: runId },
      select: { id: true, status: true, employeeCount: true, payrollPeriodId: true },
    });
    console.log("[PaymentExport] Requested run:", JSON.stringify(runCheck));

    // Check ALL runs in the period
    if (runCheck?.payrollPeriodId) {
      const allRuns = await prisma.payrollRun.findMany({
        where: { payrollPeriodId: runCheck.payrollPeriodId },
        select: { id: true, status: true, employeeCount: true },
      });
      console.log("[PaymentExport] All runs in period:", JSON.stringify(allRuns));

      for (const r of allRuns) {
        const cnt = await prisma.payrollRunItem.count({ where: { payrollRunId: r.id } });
        console.log(`[PaymentExport]   Run ${r.id.slice(0, 8)}... status=${r.status} items=${cnt}`);
      }
    }

    const buffer = await paymentExportService.exportExcel(runId);
    console.log("[PaymentExport] Final buffer size:", buffer.length, "bytes");

    const filename = `payment-run-${runId.slice(0, 8)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.send(buffer);
  }),

  /**
   * GET /payment-export/:runId/csv
   * Downloads a money-only CSV for a payroll run.
   */
  downloadCsv: asyncHandler(async (req: Request, res: Response) => {
    const { runId } = req.params;
    console.log("[PaymentExport CSV] ===== CSV DOWNLOAD REQUEST =====");
    console.log("[PaymentExport CSV] Requested runId:", runId);
    if (!runId) {
      throw new CustomError(httpStatus.BAD_REQUEST, "Run ID is required");
    }

    const csv = await paymentExportService.exportCsv(runId);
    console.log("[PaymentExport CSV] CSV length:", csv.length, "chars");

    const filename = `payment-run-${runId.slice(0, 8)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.send(csv);
  }),
};
