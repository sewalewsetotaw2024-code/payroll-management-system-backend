import { Request, Response } from "express";
import asyncHandler from "../utils/asyncHandler";
import { resolveCompanyId } from "../utils/roleGuard";
import prisma from "../config/database";
import ExcelJS from "exceljs";
import { generateTaxReport, generatePensionReport, generateBankReport } from "../services/reportExport.service";
import CustomError from "../utils/customError";
import httpStatus from "http-status";

export const getReportablePeriods = asyncHandler(async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);

  const periods = await prisma.payrollPeriod.findMany({
    where: {
      companyId,
      payrollRuns: {
        some: { status: "DONE" },
      },
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      payrollRuns: {
        where: { status: "DONE" },
        select: {
          id: true,
          totalTax: true,
          totalPension: true,
          totalNet: true,
          employeeCount: true,
          finalizedAt: true,
        },
      },
    },
    orderBy: { startDate: "desc" },
  });

  const mapped = periods.map((p) => {
    const run = p.payrollRuns[0];
    return {
      id: p.id,
      name: p.name ?? `${p.startDate.toISOString().slice(0, 10)} — ${p.endDate.toISOString().slice(0, 10)}`,
      startDate: p.startDate.toISOString().slice(0, 10),
      endDate: p.endDate.toISOString().slice(0, 10),
      runId: run?.id ?? "",
      totalTax: Number(run?.totalTax ?? 0),
      totalPension: Number(run?.totalPension ?? 0),
      totalNet: Number(run?.totalNet ?? 0),
      employeeCount: run?.employeeCount ?? 0,
      finalizedAt: run?.finalizedAt?.toISOString() ?? null,
    };
  });

  res.json({ success: true, data: mapped });
});

export const exportTaxReport = asyncHandler(async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const { payrollRunId, periodLabel } = req.body;

  if (!payrollRunId || !periodLabel) {
    throw new CustomError(httpStatus.BAD_REQUEST, "Missing required parameters: payrollRunId, periodLabel");
  }

  const workbook = new ExcelJS.Workbook();
  await generateTaxReport({ companyId, payrollRunId, periodLabel }, workbook);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="income-tax-${periodLabel}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

export const exportPensionReport = asyncHandler(async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const { payrollRunId, periodLabel } = req.body;

  if (!payrollRunId || !periodLabel) {
    throw new CustomError(httpStatus.BAD_REQUEST, "Missing required parameters: payrollRunId, periodLabel");
  }

  const workbook = new ExcelJS.Workbook();
  await generatePensionReport({ companyId, payrollRunId, periodLabel }, workbook);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="pension-${periodLabel}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

export const exportBankReport = asyncHandler(async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const { payrollRunId, periodLabel } = req.body;

  if (!payrollRunId || !periodLabel) {
    throw new CustomError(httpStatus.BAD_REQUEST, "Missing required parameters: payrollRunId, periodLabel");
  }

  const workbook = new ExcelJS.Workbook();
  await generateBankReport({ companyId, payrollRunId, periodLabel }, workbook);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="bank-transfer-${periodLabel}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});
