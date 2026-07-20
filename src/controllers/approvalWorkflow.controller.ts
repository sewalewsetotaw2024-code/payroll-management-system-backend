import type { Request, Response } from "express";
import httpStatus from "http-status";
import asyncHandler from "../utils/asyncHandler";
import CustomError from "../utils/customError";
import { approvalWorkflowService } from "../services/approvalWorkflow.service";
import { resolveCompanyId } from "../utils/roleGuard";
import prisma from "../config/database";
import {
  validateApprovalRoleConfiguration,
  auditWorkflowConfiguration,
} from "../utils/approvalRoleValidator";

export const ApprovalWorkflowController = {
  // ── Workflow Config ───────────────────────────────────────

  /** GET /workflow — Get the approval workflow config */
  getWorkflow: asyncHandler(async (req: Request, res: Response) => {
    const companyId = resolveCompanyId(req);
    const workflow = await approvalWorkflowService.getWorkflowForCompany(companyId);
    res.status(httpStatus.OK).json({
      success: true,
      data: workflow,
    });
  }),

  /** GET /workflow/company/:companyId — Get workflow by company ID */
  getWorkflowForCompany: asyncHandler(async (req: Request, res: Response) => {
    const companyId = parseInt(req.params.companyId);
    if (isNaN(companyId)) {
      throw new CustomError(httpStatus.BAD_REQUEST, "Invalid company ID");
    }
    const workflow = await approvalWorkflowService.getWorkflowForCompany(companyId);
    res.status(httpStatus.OK).json({
      success: true,
      data: workflow,
    });
  }),

  /** PATCH /workflow/:workflowId — Update workflow metadata */
  updateWorkflow: asyncHandler(async (req: Request, res: Response) => {
    const { workflowId } = req.params;
    const { name, isActive } = req.body;
    const workflow = await approvalWorkflowService.updateWorkflow(workflowId, { name, isActive });
    res.status(httpStatus.OK).json({
      success: true,
      data: workflow,
    });
  }),

  /** POST /workflow/:workflowId/activate — Activate a workflow */
  activateWorkflow: asyncHandler(async (req: Request, res: Response) => {
    const { workflowId } = req.params;
    const workflow = await approvalWorkflowService.activateWorkflow(workflowId);
    res.status(httpStatus.OK).json({
      success: true,
      data: workflow,
    });
  }),

  /** POST /workflow/:workflowId/deactivate — Deactivate a workflow */
  deactivateWorkflow: asyncHandler(async (req: Request, res: Response) => {
    const { workflowId } = req.params;
    const workflow = await approvalWorkflowService.deactivateWorkflow(workflowId);
    res.status(httpStatus.OK).json({
      success: true,
      data: workflow,
    });
  }),

  // ── Step CRUD ─────────────────────────────────────────────

  /** POST /workflow/:workflowId/steps — Add a step */
  addStep: asyncHandler(async (req: Request, res: Response) => {
    const { workflowId } = req.params;
    const { stageType, stepOrder, requiredRoleId, alternateRoleId, isRequired } = req.body;
    const workflow = await approvalWorkflowService.addStep(workflowId, {
      stageType,
      stepOrder,
      requiredRoleId,
      alternateRoleId,
      isRequired,
    });
    res.status(httpStatus.CREATED).json({
      success: true,
      data: workflow,
    });
  }),

  /** PATCH /workflow/steps/:stepId — Update a step */
  updateStep: asyncHandler(async (req: Request, res: Response) => {
    const { stepId } = req.params;
    const { stageType, stepOrder, requiredRoleId, alternateRoleId, isRequired } = req.body;
    const workflow = await approvalWorkflowService.updateStep(stepId, {
      stageType,
      stepOrder,
      requiredRoleId,
      alternateRoleId,
      isRequired,
    });
    res.status(httpStatus.OK).json({
      success: true,
      data: workflow,
    });
  }),

  /** DELETE /workflow/steps/:stepId — Delete a step */
  deleteStep: asyncHandler(async (req: Request, res: Response) => {
    const { stepId } = req.params;
    const workflow = await approvalWorkflowService.deleteStep(stepId);
    res.status(httpStatus.OK).json({
      success: true,
      data: workflow,
    });
  }),

  // ── Approval Requests ─────────────────────────────────────

  /** GET /status — Get approval request status */
  getApprovalStatus: asyncHandler(async (req: Request, res: Response) => {
    const { payrollRunId, attendanceImportId, payrollPeriodId } = req.query;
    const requests = await approvalWorkflowService.getApprovalStatus({
      payrollRunId: payrollRunId as string | undefined,
      attendanceImportId: attendanceImportId as string | undefined,
      payrollPeriodId: payrollPeriodId as string | undefined,
    });
    res.status(httpStatus.OK).json({
      success: true,
      data: requests,
    });
  }),

  /** POST /request — Create an approval request */
  requestApproval: asyncHandler(async (req: Request, res: Response) => {
    const companyId = resolveCompanyId(req);
    const userId = (req as any).user?.id;
    const { stageType, referenceType, payrollRunId, attendanceImportId, payrollPeriodId } = req.body;

    if (!userId) {
      throw new CustomError(httpStatus.UNAUTHORIZED, "User ID not found");
    }

    const request = await approvalWorkflowService.requestApproval(
      companyId,
      Number(userId),
      stageType,
      referenceType,
      payrollRunId,
      attendanceImportId,
      payrollPeriodId,
    );

    res.status(httpStatus.CREATED).json({
      success: true,
      data: request,
    });
  }),

  /** POST /:requestId/approve — Approve a request */
  approveRequest: asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { requestId } = req.params;
    const { comment } = req.body;

    if (!userId) {
      throw new CustomError(httpStatus.UNAUTHORIZED, "User ID not found");
    }

    // Resolve companyId — prefer JWT claim, fall back to deriving it from the request record
    let companyId: number;
    try {
      companyId = resolveCompanyId(req);
    } catch {
      const approvalReq = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
        include: {
          attendanceImport: { include: { payrollPeriod: { select: { companyId: true } } } },
          payrollRun: { include: { payrollPeriod: { select: { companyId: true } } } },
        },
      });
      const derived =
        approvalReq?.attendanceImport?.payrollPeriod?.companyId ??
        approvalReq?.payrollRun?.payrollPeriod?.companyId;
      if (!derived) {
        throw new CustomError(httpStatus.BAD_REQUEST, "Cannot determine company for this request");
      }
      companyId = derived;
    }

    const request = await approvalWorkflowService.approveRequest(
      companyId,
      Number(userId),
      requestId,
      comment,
      (req as any).user?.simulatedRole,
      (req as any).user?.role,       // JWT role name fallback
    );

    res.status(httpStatus.OK).json({
      success: true,
      data: request,
    });
  }),

  /** POST /:requestId/reject — Reject a request */
  rejectRequest: asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { requestId } = req.params;
    const { comment } = req.body;

    if (!userId) {
      throw new CustomError(httpStatus.UNAUTHORIZED, "User ID not found");
    }

    // Resolve companyId — prefer JWT claim, fall back to deriving it from the request record
    let companyId: number;
    try {
      companyId = resolveCompanyId(req);
    } catch {
      const approvalReq = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
        include: {
          attendanceImport: { include: { payrollPeriod: { select: { companyId: true } } } },
          payrollRun: { include: { payrollPeriod: { select: { companyId: true } } } },
        },
      });
      const derived =
        approvalReq?.attendanceImport?.payrollPeriod?.companyId ??
        approvalReq?.payrollRun?.payrollPeriod?.companyId;
      if (!derived) {
        throw new CustomError(httpStatus.BAD_REQUEST, "Cannot determine company for this request");
      }
      companyId = derived;
    }

    const request = await approvalWorkflowService.rejectRequest(
      companyId,
      Number(userId),
      requestId,
      comment,
      (req as any).user?.simulatedRole,
      (req as any).user?.role,       // JWT role name fallback
    );

    res.status(httpStatus.OK).json({
      success: true,
      data: request,
    });
  }),

  /**
   * GET /admin/approval-workflow/health
   * Admin-only endpoint that validates approval role configuration and audits
   * all active workflows for stuck migrations, zero-step states, or missing
   * stage types.
   */
  getHealth: asyncHandler(async (_req: Request, res: Response) => {
    const [roleValidation, workflowAudit] = await Promise.all([
      validateApprovalRoleConfiguration(),
      auditWorkflowConfiguration(),
    ]);

    const issues = workflowAudit.filter(
      (wf) =>
        wf.stepCount === 0 ||
        wf.missingStageTypes.length > 0 ||
        wf.stuckMigration,
    );

    const healthy = roleValidation.allFound && issues.length === 0;

    res.status(healthy ? httpStatus.OK : httpStatus.OK).json({
      success: true,
      data: {
        healthy,
        roleValidation,
        workflowAudit,
        unhealthyWorkflows: issues,
      },
    });
  }),
};
