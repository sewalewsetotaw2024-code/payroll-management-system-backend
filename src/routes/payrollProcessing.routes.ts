import { Router } from "express";
import { PayrollRunController } from "../controllers/payrollRun.controllers";
import { authenticate as protect } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/roleGuard";
import { validate } from "../middlewares/validation";
import { cacheMiddleware, invalidateCache } from "../middlewares/cache";
import { TTL } from "../services/cache.service";
import {
    runPayrollSchema,
    getPayrollRunsSchema,
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

export default router;
