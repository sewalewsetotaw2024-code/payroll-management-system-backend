import { Request, Response } from "express";
import asyncHandler from "../utils/asyncHandler";
import { resolveCompanyId } from "../utils/roleGuard";
import CustomError from "../utils/customError";
import httpStatus from "http-status";
import { getQueue, reportFileExists, getReportUrl } from "../services/reportQueue.service";

type ReportType = "tax" | "pension" | "bank";

const validTypes: ReportType[] = ["tax", "pension", "bank"];

/**
 * POST /api/v1/reports/generate
 * Body: { payrollRunId, periodLabel, type }
 * Enqueues a BullMQ job to generate the report in the background.
 * If the file already exists on Cloudinary, returns immediately (idempotent).
 */
export const enqueueReportGeneration = asyncHandler(async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const { payrollRunId, periodLabel, type } = req.body;

  if (!payrollRunId || !periodLabel || !type) {
    throw new CustomError(httpStatus.BAD_REQUEST, "Missing required fields: payrollRunId, periodLabel, type");
  }

  if (!validTypes.includes(type)) {
    throw new CustomError(httpStatus.BAD_REQUEST, `Invalid type '${type}'. Must be one of: ${validTypes.join(", ")}`);
  }

  // Idempotency: if already on Cloudinary, return immediately
  const alreadyGenerated = await reportFileExists(payrollRunId, type as ReportType);
  if (alreadyGenerated) {
    res.json({ success: true, jobId: null, alreadyGenerated: true, type, payrollRunId });
    return;
  }

  const queue = getQueue();
  const job = await queue.add(`${type}-${payrollRunId}`, {
    type: type as ReportType,
    payrollRunId,
    periodLabel,
    companyId,
  });

  res.json({ success: true, jobId: job.id, alreadyGenerated: false, type, payrollRunId });
});

/**
 * GET /api/v1/reports/jobs/:jobId
 * Returns the current state of a generation job.
 */
export const getJobStatus = asyncHandler(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  if (!jobId) {
    throw new CustomError(httpStatus.BAD_REQUEST, "jobId is required");
  }

  const queue = getQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    throw new CustomError(httpStatus.NOT_FOUND, "Job not found");
  }

  const state = await job.getState();

  res.json({
    success: true,
    data: {
      jobId: job.id,
      state,
      type: job.data.type,
      payrollRunId: job.data.payrollRunId,
      failedReason: job.failedReason ?? null,
      processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    },
  });
});

/**
 * GET /api/v1/reports/generated/:runId/:type
 * Check if a pre-generated report exists on Cloudinary.
 */
export const checkGenerated = asyncHandler(async (req: Request, res: Response) => {
  const { runId, type } = req.params;

  if (!validTypes.includes(type as ReportType)) {
    throw new CustomError(httpStatus.BAD_REQUEST, `Invalid type '${type}'`);
  }

  const exists = await reportFileExists(runId, type as ReportType);

  res.json({ success: true, data: { exists, runId, type } });
});

/**
 * GET /api/v1/reports/download/:runId/:type
 * Proxies the file from Cloudinary with proper Content-Disposition headers
 * so the frontend can create a same-origin blob URL and trigger a download
 * with the correct .xlsx extension.
 */
export const downloadGeneratedReport = asyncHandler(async (req: Request, res: Response) => {
  const { runId, type } = req.params;

  if (!validTypes.includes(type as ReportType)) {
    throw new CustomError(httpStatus.BAD_REQUEST, `Invalid type '${type}'`);
  }

  const cloudinaryUrl = await getReportUrl(runId, type as ReportType);

  if (!cloudinaryUrl) {
    throw new CustomError(httpStatus.NOT_FOUND, "Report not found — please generate it first");
  }

  // Fetch the file from Cloudinary
  const response = await fetch(cloudinaryUrl);
  if (!response.ok) {
    throw new CustomError(httpStatus.BAD_GATEWAY, "Failed to fetch report from storage");
  }

  const filename = `${type}-report-${runId.slice(0, 8)}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const arrayBuffer = await response.arrayBuffer();
  res.send(Buffer.from(arrayBuffer));
});
