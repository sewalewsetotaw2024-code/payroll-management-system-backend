import { Router } from "express";
import { authenticate as protect } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/roleGuard";
import { getReportablePeriods, exportTaxReport, exportPensionReport, exportBankReport } from "../controllers/reportExport.controller";

const router = Router();

/**
 * GET /api/v1/reports/periods — List payroll periods with DONE runs.
 */
router.get("/reports/periods", protect, requireAdmin, getReportablePeriods);
router.post("/reports/export/tax", protect, requireAdmin, exportTaxReport);
router.post("/reports/export/pension", protect, requireAdmin, exportPensionReport);
router.post("/reports/export/bank", protect, requireAdmin, exportBankReport);

export default router;
