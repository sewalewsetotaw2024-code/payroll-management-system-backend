import { Router } from "express";
import { EmployeeController } from "../controllers/employee.controller";
import { authenticate as protect } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/roleGuard";
import { cacheMiddleware } from "../middlewares/cache";
import { TTL } from "../services/cache.service";

const router = Router();

/**
 * GET /employees — List all employees for the company with optional search/filter.
 */
router.get(
    "/",
    protect,
    requireAdmin,
    cacheMiddleware({ ttl: TTL.EMPLOYEE_LIST, tags: ["employees"] }),
    EmployeeController.getEmployees,
);

/**
 * GET /employees/:id — Get a single employee by ID.
 */
router.get(
    "/:id",
    protect,
    requireAdmin,
    cacheMiddleware({ ttl: TTL.ENTITY, tags: ["employees"] }),
    EmployeeController.getEmployeeById,
);

export default router;
