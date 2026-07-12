import { Router } from "express";
import { LeaveController } from "../controllers/leave.controller";
import { authenticate as protect } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/roleGuard";
import { validate } from "../middlewares/validation";
import { cacheMiddleware, invalidateCache } from "../middlewares/cache";
import { TTL } from "../services/cache.service";
import {
    syncLeaveSchema,
    getBalancesSchema,
    getApplicationsSchema,
    getDeductionsSchema,
    calculateDeductionsSchema,
    calculateLeaveFromAttendanceSchema,
    getLeaveBreakdownSchema,
    syncLeavePeriodSchema,
    syncLeavePeriodByRunSchema,
    getLeaveRunSummarySchema,
    getEmployeeLeaveItemsSchema,
    getSyncLogsSchema,
} from "../validations/leave.validations";

const router = Router();

// ── Legacy Leave Sync (REST-based, full EMS sync) ───────────────────────────
router.post("/sync",                 protect, requireAdmin, validate(syncLeaveSchema),            LeaveController.syncLeave, invalidateCache({ tags: ["leave"] }));

// ── Leave Queries ───────────────────────────────────────────────────────────
router.get("/balances",              protect, requireAdmin, validate(getBalancesSchema),          cacheMiddleware({ ttl: TTL.EMPLOYEE_LIST, tags: ["leave"] }), LeaveController.getBalances);
router.get("/applications",          protect, requireAdmin, validate(getApplicationsSchema),      cacheMiddleware({ ttl: TTL.EMPLOYEE_LIST, tags: ["leave"] }), LeaveController.getApplications);
router.get("/deductions",            protect, requireAdmin, validate(getDeductionsSchema),        cacheMiddleware({ ttl: TTL.EMPLOYEE_LIST, tags: ["leave"] }), LeaveController.getDeductions);
router.get("/sync-logs",             protect, requireAdmin, validate(getSyncLogsSchema),           cacheMiddleware({ ttl: TTL.EMPLOYEE_LIST, tags: ["leave"] }), LeaveController.getSyncLogs);

// ── PayrollLeaveItem Sync (DB sync + per-leave-type breakdown) ──────────────
router.post("/sync-period",          protect, requireAdmin, validate(syncLeavePeriodSchema),        LeaveController.syncLeavePeriod, invalidateCache({ tags: ["leave"] }));
router.post("/sync-period-run",      protect, requireAdmin, validate(syncLeavePeriodByRunSchema),  LeaveController.syncLeavePeriodByRun, invalidateCache({ tags: ["leave"] }));

// ── PayrollLeaveItem Queries ────────────────────────────────────────────────
router.get("/breakdown",             protect, requireAdmin, validate(getLeaveBreakdownSchema),       cacheMiddleware({ ttl: TTL.EMPLOYEE_LIST, tags: ["leave"] }), LeaveController.getLeaveBreakdown);
router.get("/run-summary",           protect, requireAdmin, validate(getLeaveRunSummarySchema),       cacheMiddleware({ ttl: TTL.EMPLOYEE_LIST, tags: ["leave"] }), LeaveController.getLeaveRunSummary);
router.get("/employee-items",        protect, requireAdmin, validate(getEmployeeLeaveItemsSchema),  cacheMiddleware({ ttl: TTL.EMPLOYEE_LIST, tags: ["leave"] }), LeaveController.getEmployeeLeaveItems);

// ── Legacy Deduction Calculation ────────────────────────────────────────────
router.post("/calculate-deductions", protect, requireAdmin, validate(calculateDeductionsSchema),  LeaveController.calculateDeductions);

// ── Attendance-based Leave Calculation ──────────────────────────────────────
router.post("/calculate-from-attendance", protect, requireAdmin, validate(calculateLeaveFromAttendanceSchema),  LeaveController.calculateLeaveFromAttendance);

export default router;
