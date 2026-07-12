import { Router } from "express";
import { AttendanceController } from "../controllers/attendance.controller";
import { authenticate as protect } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/roleGuard";
import { validate } from "../middlewares/validation";
import { handleMulter } from "../middlewares/upload.middleware";
import { cacheMiddleware, invalidateCache } from "../middlewares/cache";
import { TTL } from "../services/cache.service";
import {
    importAttendanceSchema,
    calculateOvertimeSchema,
    listImportsSchema,
    getImportByIdSchema,
    deleteImportSchema,
    calculateSummarySchema,
} from "../validations/attendance.validations";

const router = Router();

/**
 * POST /attendance/import — Upload and parse biometric Excel file.
 * - Accepts multipart form: file (xlsx) + sheetName (optional)
 * - File stored in memory, validated by multer
 */
router.post(
    "/attendance/import",
    protect,
    requireAdmin,
    handleMulter("file"),
    validate(importAttendanceSchema),
    AttendanceController.importAttendance,
    invalidateCache({ tags: ["attendance-imports"] }),
);

/**
 * POST /attendance/imports/:importId/calculate-ot — Calculate overtime
 * from imported attendance records.
 */
router.post(
    "/attendance/imports/:importId/calculate-ot",
    protect,
    requireAdmin,
    validate(calculateOvertimeSchema),
    AttendanceController.calculateOvertime,
    invalidateCache({ tags: ["attendance-imports"] }),
);

/**
 * GET /attendance/imports — List all attendance imports.
 */
router.get(
    "/attendance/imports",
    protect,
    requireAdmin,
    validate(listImportsSchema),
    cacheMiddleware({ ttl: TTL.PAYROLL_PERIOD, tags: ["attendance-imports"] }),
    AttendanceController.listImports,
);

/**
 * GET /attendance/imports/:importId — Get import details by ID.
 */
router.get(
    "/attendance/imports/:importId",
    protect,
    requireAdmin,
    validate(getImportByIdSchema),
    cacheMiddleware({ ttl: TTL.ENTITY, tags: ["attendance-imports"] }),
    AttendanceController.getImportById,
);

/**
 * GET /attendance/imports/:importId/employees/:employeeId/daily-records —
 * Get daily attendance records for a single employee, grouped by month.
 * Used by the frontend heatmap component.
 */
router.get(
    "/attendance/imports/:importId/employees/:employeeId/daily-records",
    protect,
    requireAdmin,
    cacheMiddleware({ ttl: TTL.ENTITY, tags: ["attendance-imports"] }),
    AttendanceController.getEmployeeDailyRecords,
);

/**
 * POST /attendance/imports/:importId/calculate-summary — Calculate
 * attendance summary (total hours + total days) from attendance data.
 */
router.post(
    "/attendance/imports/:importId/calculate-summary",
    protect,
    requireAdmin,
    validate(calculateSummarySchema),
    AttendanceController.calculateSummary,
    invalidateCache({ tags: ["attendance-imports"] }),
);

/**
 * GET /attendance/imports/:importId/overtime — Retrieve existing
 * overtime calculation results without re-calculating.
 * Returns 404 if OT hasn't been calculated yet.
 */
router.get(
    "/attendance/imports/:importId/overtime",
    protect,
    requireAdmin,
    cacheMiddleware({ ttl: TTL.ENTITY, tags: ["attendance-imports"] }),
    AttendanceController.getOvertimeResults,
);

/**
 * GET /attendance/imports/:importId/summary — Retrieve previously
 * calculated attendance summary results.
 */
router.get(
    "/attendance/imports/:importId/summary",
    protect,
    requireAdmin,
    cacheMiddleware({ ttl: TTL.ENTITY, tags: ["attendance-imports"] }),
    AttendanceController.getSummary,
);

/**
 * DELETE /attendance/imports/:importId — Delete an import and cascade
 * remove related records.
 */
router.delete(
    "/attendance/imports/:importId",
    protect,
    requireAdmin,
    validate(deleteImportSchema),
    AttendanceController.deleteImport,
    invalidateCache({ tags: ["attendance-imports"] }),
);

/**
 * PATCH /attendance/imports/:importId/toggle-active — Toggle active status.
 * When activating, deactivates all other imports for the same payroll period.
 */
router.patch(
    "/attendance/imports/:importId/toggle-active",
    protect,
    requireAdmin,
    AttendanceController.toggleImportActive,
    invalidateCache({ tags: ["attendance-imports"] }),
);

/**
 * POST /attendance/imports/:importId/submit-for-approval — Submit attendance
 * for approval (generates XLSX snapshot, creates approval request).
 */
router.post(
    "/attendance/imports/:importId/submit-for-approval",
    protect,
    requireAdmin,
    AttendanceController.submitForApproval,
);

/**
 * GET /attendance/imports/:importId/export — Download the XLSX snapshot
 * that was generated at submission time.
 */
router.get(
    "/attendance/imports/:importId/export",
    protect,
    requireAdmin,
    AttendanceController.exportAttendanceXlsx,
);

export default router;
