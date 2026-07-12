import { Router } from "express";
import { DataManagementController } from "../controllers/dataManagement.controllers";
import { authenticate as protect } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/roleGuard";
import { validate } from "../middlewares/validation";
import { handleMulter } from "../middlewares/upload.middleware";
import { cacheMiddleware } from "../middlewares/cache";
import { TTL } from "../services/cache.service";
import {
    importEmployeesSchema,
    importAttendanceSchema,
    importAdjustmentsSchema,
    getImportHistorySchema,
} from "../validations/dataManagement.validations";

const router = Router();

router.use(protect, requireAdmin);

/**
 * POST /data/import/employees — Imports employees from an uploaded file.
 * Handles file upload via multer and validates using importEmployeesSchema.
 */
router.post(
    "/data/import/employees",
    handleMulter("file"),
    validate(importEmployeesSchema),
    DataManagementController.importEmployees,
);

/**
 * POST /data/import/attendance — Imports attendance records from an uploaded file.
 * Handles file upload via multer and validates using importAttendanceSchema.
 */
router.post(
    "/data/import/attendance",
    handleMulter("file"),
    validate(importAttendanceSchema),
    DataManagementController.importAttendance,
);

/**
 * POST /data/import/adjustments — Imports adjustments from an uploaded file.
 * Handles file upload via multer and validates using importAdjustmentsSchema.
 */
router.post(
    "/data/import/adjustments",
    handleMulter("file"),
    validate(importAdjustmentsSchema),
    DataManagementController.importAdjustments,
);

/**
 * GET /data/imports — Retrieves paginated import history. Validates query parameters using getImportHistorySchema.
 */
router.get(
    "/data/imports",
    validate(getImportHistorySchema),
    cacheMiddleware({ ttl: TTL.EMPLOYEE_LIST, tags: ["data-imports"] }),
    DataManagementController.getImportHistory,
);

/**
 * GET /data/imports/:id — Retrieves a single import record by ID.
 */
router.get(
    "/data/imports/:id",
    cacheMiddleware({ ttl: TTL.ENTITY, tags: ["data-imports"] }),
    DataManagementController.getImportById,
);

export default router;
