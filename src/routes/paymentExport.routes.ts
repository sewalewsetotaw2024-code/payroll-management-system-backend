import { Router } from "express";
import { PaymentExportController } from "../controllers/paymentExport.controller";
import { authenticate as protect } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/roleGuard";

const router = Router();

/**
 * GET /payment-export/:runId/excel — Download full-detailed Excel workbook
 */
router.get(
  "/payment-export/:runId/excel",
  protect,
  requireAdmin,
  PaymentExportController.downloadExcel,
);

/**
 * GET /payment-export/:runId/csv — Download money-only CSV
 */
router.get(
  "/payment-export/:runId/csv",
  protect,
  requireAdmin,
  PaymentExportController.downloadCsv,
);

export default router;
