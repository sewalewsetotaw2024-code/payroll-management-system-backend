/**
 * Acting Allowance — Route Definitions
 * ======================================
 *
 * 10 endpoints organised into two groups:
 *
 *   Rules (CRUD):
 *     GET    /acting-allowance-rules        — List all rules
 *     POST   /acting-allowance-rules        — Create a new rule (with tiers)
 *     PUT    /acting-allowance-rules/:id    — Update a rule's tiers/basis/active
 *     DELETE /acting-allowance-rules/:id    — Soft-delete a rule (isActive=false)
 *
 *   Assignments (CRUD + preview):
 *     GET    /acting-assignments            — List assignments (supports ?status= & ?employeeId=)
 *     POST   /acting-assignments            — Create an assignment (find-or-create position)
 *     GET    /acting-assignments/:id        — Get a single assignment
 *     PUT    /acting-assignments/:id        — Update assignment fields/status
 *     DELETE /acting-assignments/:id        — Cancel (soft) an assignment
 *     POST   /acting-assignments/preview    — Preview allowance (no persist)
 *
 * NOTE: The `/preview` route MUST be defined BEFORE `/:id` otherwise Express
 * will try to match "preview" as an `:id` param.  We keep it last because
 * the validation middleware catches the body schema mismatch.
 *
 * All routes require authentication + admin role.
 */

import { Router } from "express";
import { ActingAllowanceController } from "../controllers/actingAllowance.controller";
import { authenticate as protect } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/roleGuard";
import { validate } from "../middlewares/validation";
import { cacheMiddleware, invalidateCache } from "../middlewares/cache";
import { TTL } from "../services/cache.service";
import {
    createRuleSchema,
    updateRuleSchema,
    deleteRuleSchema,
    createAssignmentSchema,
    updateAssignmentSchema,
    getAssignmentSchema,
    previewAllowanceSchema,
} from "../validations/actingAllowance.validations";

const router = Router();

router.use(protect, requireAdmin);

// ── Acting Allowance Rules ──────────────────────────────────
router.get("/acting-allowance-rules", cacheMiddleware({ ttl: TTL.EMPLOYEE_LIST, tags: ["acting-allowances"] }), ActingAllowanceController.listRules);
router.post("/acting-allowance-rules", validate(createRuleSchema), invalidateCache({ tags: ["acting-allowances"] }), ActingAllowanceController.createRule);
router.put("/acting-allowance-rules/:id", validate(updateRuleSchema), invalidateCache({ tags: ["acting-allowances"] }), ActingAllowanceController.updateRule);
router.delete("/acting-allowance-rules/:id", validate(deleteRuleSchema), invalidateCache({ tags: ["acting-allowances"] }), ActingAllowanceController.deleteRule);

// ── Positions (used by acting allowance assignment form) ─────
router.get("/positions", protect, requireAdmin, cacheMiddleware({ ttl: TTL.EMPLOYEE_LIST, tags: ["acting-allowances"] }), ActingAllowanceController.listPositions);

// ── Acting Assignments ──────────────────────────────────────
router.get("/acting-assignments", cacheMiddleware({ ttl: TTL.EMPLOYEE_LIST, tags: ["acting-allowances"] }), ActingAllowanceController.listAssignments);
router.post("/acting-assignments", validate(createAssignmentSchema), invalidateCache({ tags: ["acting-allowances"] }), ActingAllowanceController.createAssignment);
router.get("/acting-assignments/:id", cacheMiddleware({ ttl: TTL.ENTITY, tags: ["acting-allowances"] }), ActingAllowanceController.getAssignment);
router.put("/acting-assignments/:id", validate(updateAssignmentSchema), invalidateCache({ tags: ["acting-allowances"] }), ActingAllowanceController.updateAssignment);
router.delete("/acting-assignments/:id", validate(getAssignmentSchema), invalidateCache({ tags: ["acting-allowances"] }), ActingAllowanceController.deleteAssignment);
router.post("/acting-assignments/preview", validate(previewAllowanceSchema), ActingAllowanceController.previewAllowance);

export default router;
