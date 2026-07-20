import { Router } from "express";
import { PayrollRunController } from "../controllers/payrollRun.controllers";
import { PayslipController } from "../controllers/payslip.controllers";
import { authenticate as protect } from "../middlewares/auth";
import { authorizeRoles } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/roleGuard";
import { validate } from "../middlewares/validation";
import { cacheMiddleware, invalidateCache } from "../middlewares/cache";
import { TTL } from "../services/cache.service";
import {
    runPayrollSchema,
    getPayrollRunsSchema,
    getEmployeeStatsSchema,
    getPayrollRunSchema,
    getPayrollRunItemsSchema,
    getPayrollRunItemSchema,
} from "../validations/payrollRun.validations";

const router = Router();

/**
 * POST /run — Executes payroll for a given period. Validates the request body using runPayrollSchema.
 */
router.post(
    "/run",
    protect,
    requireAdmin,
    validate(runPayrollSchema),
    PayrollRunController.runPayroll,
    invalidateCache({ tags: ["payroll-runs"] }),
);

/**
 * GET /runs — Lists all payroll runs with pagination. Validates query parameters using getPayrollRunsSchema.
 */
router.get(
    "/runs",
    protect,
    requireAdmin,
    validate(getPayrollRunsSchema),
    cacheMiddleware({ ttl: TTL.BATCH, tags: ["payroll-runs"] }),
    PayrollRunController.getPayrollRuns,
);

/**
 * GET /runs/employees — Retrieves per-employee payroll stats for a period.
 * MUST be defined BEFORE /runs/:id so Express matches the literal path first.
 */
router.get(
    "/runs/employees",
    protect,
    requireAdmin,
    validate(getEmployeeStatsSchema),
    PayrollRunController.getEmployeeStats,
);

/**
 * GET /runs/:id — Retrieves a single payroll run by ID. Validates the run ID parameter.
 */
router.get(
    "/runs/:id",
    protect,
    requireAdmin,
    validate(getPayrollRunSchema),
    cacheMiddleware({ ttl: TTL.BATCH, tags: ["payroll-runs"] }),
    PayrollRunController.getPayrollRun,
);

/**
 * GET /runs/:id/items — Lists all items for a specific payroll run. Validates query parameters using getPayrollRunItemsSchema.
 */
router.get(
    "/runs/:id/items",
    protect,
    requireAdmin,
    validate(getPayrollRunItemsSchema),
    cacheMiddleware({ ttl: TTL.BATCH, tags: ["payroll-runs"] }),
    PayrollRunController.getPayrollRunItems,
);

/**
 * GET /runs/:id/items/:itemId — Retrieves a single payroll run item with full details. Validates both run and item ID parameters.
 */
router.get(
    "/runs/:id/items/:itemId",
    protect,
    requireAdmin,
    validate(getPayrollRunItemSchema),
    cacheMiddleware({ ttl: TTL.BATCH, tags: ["payroll-runs"] }),
    PayrollRunController.getPayrollRunItem,
);

// ─── Self-service Payslip Endpoints ──────────────────────────
// These are protected by `protect` (authentication) only — no admin guard.
// Any authenticated user can access their own payslip data; the service
// filters by the user's linked Employee record.

/**
 * GET /payslips/periods — Lists fiscal years and payroll periods for the
 * authenticated employee, each with a hasPayslip flag.
 */
router.get(
    "/payslips/periods",
    protect,
    PayslipController.getMyPeriods,
);

/**
 * GET /payslips/period/:periodId — Returns the full payslip detail for a
 * specific payroll period and the authenticated employee.
 */
router.get(
    "/payslips/period/:periodId",
    protect,
    PayslipController.getMyPayslipDetail,
);

// ─── Payslip PDF Generation ──────────────────────────────────────────

/** POST /payslips/generate-mine/:periodId — Self-service: any authenticated employee */
router.post(
  "/payslips/generate-mine/:periodId",
  protect,
  PayslipController.generateMyPayslipPdf,
);

/** POST /payslips/generate/:runItemId — Admin only: generate by run item ID */
router.post(
  "/payslips/generate/:runItemId",
  protect,
  requireAdmin,
  PayslipController.generatePayslipPdf,
);

/** POST /payslips/batch-generate/:payrollRunId — Admin only: batch generate for a whole run */
router.post(
  "/payslips/batch-generate/:payrollRunId",
  protect,
  requireAdmin,
  PayslipController.batchGeneratePayslipPdfs,
);

/** GET /payslips/batch-status/:payrollRunId — Admin only: view generation progress */
router.get(
  "/payslips/batch-status/:payrollRunId",
  protect,
  requireAdmin,
  PayslipController.getBatchStatus,
);

/** POST /runs/:runId/generate-payslips — HR only: generate payslips for a whole run */
router.post(
  "/runs/:runId/generate-payslips",
  protect,
  authorizeRoles("HR Generalist", "HR CS Manager", "HR CS Director"),
  PayslipController.generatePayslipsForRun,
);

router.get(
  "/payslips/:id/pdf",
  protect,
  PayslipController.getPayslipPdf,
);

/**
 * PUT /runs/:runId/payslips/visibility — Update all payslip visibility to DONE for a run.
 */
router.put(
  "/runs/:runId/payslips/visibility",
  protect,
  requireAdmin,
  PayslipController.updatePayslipVisibility,
);

export default router;
