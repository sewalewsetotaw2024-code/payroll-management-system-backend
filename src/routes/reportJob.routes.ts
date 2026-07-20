import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/roleGuard";
import { enqueueReportGeneration, getJobStatus, checkGenerated, downloadGeneratedReport } from "../controllers/reportJob.controller";

const router = Router();

/**
 * Enqueue a background report generation job.
 * POST /api/v1/reports/generate
 */
router.post("/reports/generate", authenticate, requireAdmin, enqueueReportGeneration);

/**
 * Check the status of a generation job.
 * GET /api/v1/reports/jobs/:jobId
 */
router.get("/reports/jobs/:jobId", authenticate, requireAdmin, getJobStatus);

/**
 * Check if a pre-generated report file exists.
 * GET /api/v1/reports/generated/:runId/:type
 */
router.get("/reports/generated/:runId/:type", authenticate, requireAdmin, checkGenerated);

/**
 * Download a pre-generated report file.
 * GET /api/v1/reports/download/:runId/:type
 */
router.get("/reports/download/:runId/:type", authenticate, requireAdmin, downloadGeneratedReport);

export default router;
