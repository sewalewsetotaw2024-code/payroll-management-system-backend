import { Router } from "express";
import { ApprovalWorkflowController } from "../controllers/approvalWorkflow.controller";
import { authenticate as protect } from "../middlewares/auth";
import { requireStrictAdmin, requireViewAccess } from "../middlewares/roleGuard";

const router = Router();

// ── Workflow Config (read: viewAccess, write: admin) ─────────

/** GET /workflow — Get the active workflow for the user's company */
router.get("/workflow", protect, requireViewAccess, ApprovalWorkflowController.getWorkflow);

/** GET /workflow/company/:companyId — Get workflow by company ID */
router.get("/workflow/company/:companyId", protect, requireViewAccess, ApprovalWorkflowController.getWorkflowForCompany);

/** PATCH /workflow/:workflowId — Update workflow metadata */
router.patch("/workflow/:workflowId", protect, requireStrictAdmin, ApprovalWorkflowController.updateWorkflow);

/** POST /workflow/:workflowId/activate — Activate a workflow */
router.post("/workflow/:workflowId/activate", protect, requireStrictAdmin, ApprovalWorkflowController.activateWorkflow);

/** POST /workflow/:workflowId/deactivate — Deactivate a workflow */
router.post("/workflow/:workflowId/deactivate", protect, requireStrictAdmin, ApprovalWorkflowController.deactivateWorkflow);

// ── Step CRUD (admin only) ──────────────────────────────────

/** POST /workflow/:workflowId/steps — Add a step to a workflow */
router.post("/workflow/:workflowId/steps", protect, requireStrictAdmin, ApprovalWorkflowController.addStep);

/** PATCH /workflow/steps/:stepId — Update a step */
router.patch("/workflow/steps/:stepId", protect, requireStrictAdmin, ApprovalWorkflowController.updateStep);

/** DELETE /workflow/steps/:stepId — Delete a step */
router.delete("/workflow/steps/:stepId", protect, requireStrictAdmin, ApprovalWorkflowController.deleteStep);

// ── Approval Requests (viewAccess, service-level role validation) ──

/** GET /status — Get approval request status (filtered by query params) */
router.get("/status", protect, requireViewAccess, ApprovalWorkflowController.getApprovalStatus);

/** POST /request — Create an approval request (service validates who can submit) */
router.post("/request", protect, requireViewAccess, ApprovalWorkflowController.requestApproval);

/** POST /:requestId/approve — Approve a pending request (service validates role) */
router.post("/:requestId/approve", protect, requireViewAccess, ApprovalWorkflowController.approveRequest);

/** POST /:requestId/reject — Reject a pending request (service validates role) */
router.post("/:requestId/reject", protect, requireViewAccess, ApprovalWorkflowController.rejectRequest);

/** GET /admin/workflow/health — Admin health check for approval role config and workflow audit */
router.get("/admin/workflow/health", protect, requireStrictAdmin, ApprovalWorkflowController.getHealth);

export default router;
