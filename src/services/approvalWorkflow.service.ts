import prisma from "../config/database";
import CustomError from "../utils/customError";
import httpStatus from "http-status";
import logger from "../utils/logger";
import { notificationService } from "./notification.service";
import { payslipRenderService } from "./payslipRender.service";
import { $Enums } from "../generated/prisma";
import { REQUIRED_APPROVAL_ROLES, RoleNames } from "../utils/roleConstants";

type ApprovalStatus = $Enums.ApprovalStatus;
type PayrollStatus = $Enums.PayrollStatus;
type ApprovalStageType = $Enums.ApprovalStageType;
type ReferenceType = $Enums.ReferenceType;

const ApprovalStatusConst = $Enums.ApprovalStatus;
const PayrollStatusConst = $Enums.PayrollStatus;
const ApprovalStageTypeConst = $Enums.ApprovalStageType;
const ReferenceTypeConst = $Enums.ReferenceType;

/**
 * ApprovalWorkflowService — Manages approval workflows, requests, and step resolution.
 *
 * Step resolution logic (matches real service):
 * 1. Load workflow steps for the company (ordered by stepOrder)
 * 2. Load existing approval actions for the request
 * 3. Compute approvedRoleIds = set of roleIds with APPROVED actions
 * 4. currentStep = first step whose requiredRoleId NOT IN approvedRoleIds
 * 5. Skip optional steps (isRequired=false) — they don't block final approval
 * 6. When all required steps are approved, transition PayrollRun to next status
 */
export class ApprovalWorkflowService {
  // ── Role helpers ──────────────────────────────────────────

  /**
   * Resolve a role by one of its known name aliases.
   * Returns null if not found — does NOT create placeholder rows with hardcoded IDs.
   */
  private async resolveRoleByName(names: string[]) {
    return prisma.appRole.findFirst({
      where: { name: { in: names } },
    });
  }

  /**
   * Resolve a role using a registry key from REQUIRED_APPROVAL_ROLES.
   * Shorthand for resolveRoleByName(REQUIRED_APPROVAL_ROLES[key]).
   */
  private async resolveRegistryRole(key: string) {
    const aliases = REQUIRED_APPROVAL_ROLES[key];
    if (!aliases) {
      logger.warn({ roleKey: key }, `[ApprovalWorkflow] Unknown approval role key "${key}" — no aliases registered.`);
      return null;
    }
    return this.resolveRoleByName(aliases);
  }

  // ── Schema upgrade ──────────────────────────────────────────

  /**
   * One-time workflow schema upgrade gated by `schemaVersion`.
   *
   * schemaVersion 1 → 2:
   *   - Add PAYROLL_DOCUMENT step (HR Manager) if missing.
   *   - Ensure PAYROLL_APPROVAL has both an HR Manager step (stepOrder 1)
   *     and a Finance Manager step (stepOrder 2) with Finance Officer as alternate.
   *   - Bump stepOrder on PAYMENT_FILE to 3.
   *
   * Runs inside a transaction so concurrent calls are safe, and is guarded
   * by the schemaVersion field so it only ever executes ONCE per workflow.
   */
  private async upgradeWorkflowSchema(workflowId: string, companyId: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Re-read inside transaction with a FOR UPDATE equivalent (select then recheck)
      const wf = await tx.approvalWorkflow.findUnique({
        where: { id: workflowId },
        include: { steps: { orderBy: { stepOrder: "asc" } } },
      });
      if (!wf || wf.schemaVersion >= 2) return; // Already upgraded or missing

      // Resolve roles by name — no hardcoded IDs
      const hrManagerRole = await this.resolveRoleByName(
        REQUIRED_APPROVAL_ROLES.HR_MANAGER,
      );
      const financeManagerRole = await this.resolveRoleByName(
        REQUIRED_APPROVAL_ROLES.FINANCE_MANAGER,
      );
      const financeOfficerRole = await this.resolveRoleByName(
        REQUIRED_APPROVAL_ROLES.FINANCE_OFFICER,
      );

      if (!hrManagerRole || !financeManagerRole) {
        logger.error(
          {
            errorCode: "APPROVAL_ROLE_MISSING",
            workflowId,
            companyId,
            missingRoles: [
              ...(!hrManagerRole ? ["HR_MANAGER"] : []),
              ...(!financeManagerRole ? ["FINANCE_MANAGER"] : []),
            ],
          },
          "[APPROVAL_ROLE_MISSING] Cannot upgrade workflow (v1→v2): required roles not found in AppRole table. Skipping upgrade.",
        );
        return;
      }

      // ── Ensure PAYROLL_DOCUMENT step ──
      const hasPayrollDoc = wf.steps.some(
        (s) => s.stageType === ApprovalStageTypeConst.PAYROLL_DOCUMENT,
      );
      if (!hasPayrollDoc) {
        await tx.approvalStep.create({
          data: {
            approvalWorkflowId: wf.id,
            stageType: ApprovalStageTypeConst.PAYROLL_DOCUMENT,
            stepOrder: 0,
            requiredRoleId: hrManagerRole.id,
            isRequired: true,
          },
        });
        logger.info({ workflowId }, "[ApprovalWorkflow] Added PAYROLL_DOCUMENT step (HR Manager)");
      }

      // ── Ensure two PAYROLL_APPROVAL steps ──
      const payrollApprovalSteps = wf.steps.filter(
        (s) => s.stageType === ApprovalStageTypeConst.PAYROLL_APPROVAL,
      );

      if (payrollApprovalSteps.length === 0) {
        await tx.approvalStep.create({
          data: {
            approvalWorkflowId: wf.id,
            stageType: ApprovalStageTypeConst.PAYROLL_APPROVAL,
            stepOrder: 1,
            requiredRoleId: hrManagerRole.id,
            isRequired: true,
          },
        });
        await tx.approvalStep.create({
          data: {
            approvalWorkflowId: wf.id,
            stageType: ApprovalStageTypeConst.PAYROLL_APPROVAL,
            stepOrder: 2,
            requiredRoleId: financeManagerRole.id,
            alternateRoleId: financeOfficerRole?.id ?? null,
            isRequired: true,
          },
        });
        logger.info({ workflowId }, "[ApprovalWorkflow] Added HR Manager + Finance Manager PAYROLL_APPROVAL steps");
      } else if (payrollApprovalSteps.length === 1) {
        // Shift existing Finance step to stepOrder 2
        await tx.approvalStep.update({
          where: { id: payrollApprovalSteps[0].id },
          data: { stepOrder: 2 },
        });
        // Insert HR Manager at stepOrder 1
        await tx.approvalStep.create({
          data: {
            approvalWorkflowId: wf.id,
            stageType: ApprovalStageTypeConst.PAYROLL_APPROVAL,
            stepOrder: 1,
            requiredRoleId: hrManagerRole.id,
            isRequired: true,
          },
        });
        logger.info({ workflowId }, "[ApprovalWorkflow] Inserted HR Manager PAYROLL_APPROVAL step at order 1");
      }

      // ── Ensure Finance PAYROLL_APPROVAL steps have alternateRoleId set ──
      if (financeOfficerRole) {
        await tx.approvalStep.updateMany({
          where: {
            approvalWorkflowId: wf.id,
            stageType: ApprovalStageTypeConst.PAYROLL_APPROVAL,
            requiredRoleId: financeManagerRole.id,
            alternateRoleId: null,
          },
          data: { alternateRoleId: financeOfficerRole.id },
        });
      }

      // ── Normalize step orders ──
      await tx.approvalStep.updateMany({
        where: { approvalWorkflowId: wf.id, stageType: ApprovalStageTypeConst.PAYROLL_DOCUMENT },
        data: { stepOrder: 0 },
      });
      await tx.approvalStep.updateMany({
        where: { approvalWorkflowId: wf.id, stageType: ApprovalStageTypeConst.PAYMENT_FILE },
        data: { stepOrder: 3 },
      });

      // ── Bump schemaVersion to prevent re-running ──
      await tx.approvalWorkflow.update({
        where: { id: wf.id },
        data: { schemaVersion: 2 },
      });

      logger.info({ workflowId, companyId }, "[ApprovalWorkflow] Workflow schema upgraded to v2");
    });
  }

  /**
   * schemaVersion 2 → 3:
   *   - Replace HR Manager steps with HR CS Manager steps
   *   - Replace HR Officer / HR steps with HR Generalist / HR CS Manager steps (if any)
   *   - Add ATTENDANCE stage type steps (HR CS Manager → HR CS Director)
   *   - Update PAYMENT_FILE to use Finance Officer → Finance Manager flow
   *   - Bump schemaVersion to 3
   */
  private async upgradeWorkflowSchemaV3(workflowId: string, companyId: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const wf = await tx.approvalWorkflow.findUnique({
        where: { id: workflowId },
        include: { steps: { orderBy: { stepOrder: "asc" } } },
      });
      if (!wf || wf.schemaVersion >= 3) return;

      // Resolve new roles — aliases from central registry (kept inline in
      // transaction so role lookups stay inside the same tx context).
      const hrCsManagerRole = await tx.appRole.findFirst({
        where: { name: { in: REQUIRED_APPROVAL_ROLES.HR_CS_MANAGER } },
      });
      const hrGeneralistRole = await tx.appRole.findFirst({
        where: { name: { in: REQUIRED_APPROVAL_ROLES.HR_GENERALIST } },
      });
      const hrCsDirectorRole = await tx.appRole.findFirst({
        where: { name: { in: REQUIRED_APPROVAL_ROLES.HR_CS_DIRECTOR } },
      });
      const financeManagerRole = await tx.appRole.findFirst({
        where: { name: { in: REQUIRED_APPROVAL_ROLES.FINANCE_MANAGER } },
      });
      const financeOfficerRole = await tx.appRole.findFirst({
        where: { name: { in: REQUIRED_APPROVAL_ROLES.FINANCE_OFFICER } },
      });

      if (!hrCsManagerRole) {
        logger.error(
          {
            errorCode: "APPROVAL_ROLE_MISSING",
            workflowId,
            roleKey: "HR_CS_MANAGER",
            aliases: REQUIRED_APPROVAL_ROLES.HR_CS_MANAGER,
          },
          "[APPROVAL_ROLE_MISSING] Cannot upgrade to v3: HR_CS_MANAGER role not found in AppRole.",
        );
        return;
      }

      // 1. Update existing PAYROLL_APPROVAL steps: replace HR Manager role → HR CS Manager
      // (skip the step that belongs to Finance Manager)
      await tx.approvalStep.updateMany({
        where: {
          approvalWorkflowId: wf.id,
          stageType: ApprovalStageTypeConst.PAYROLL_APPROVAL,
          requiredRoleId: { not: financeManagerRole?.id ?? 0 },
        },
        data: { requiredRoleId: hrCsManagerRole.id },
      });

      // Also update PAYROLL_DOCUMENT steps (used for attendance in old schema)
      await tx.approvalStep.updateMany({
        where: {
          approvalWorkflowId: wf.id,
          stageType: ApprovalStageTypeConst.PAYROLL_DOCUMENT,
        },
        data: { requiredRoleId: hrCsManagerRole.id },
      });

      // 2. Add ATTENDANCE stage steps (HR CS Manager step 1 → HR CS Director step 2)
      const existingAttendanceSteps = wf.steps.filter(
        (s) => s.stageType === ApprovalStageTypeConst.ATTENDANCE,
      );
      if (existingAttendanceSteps.length === 0) {
        const stepsToCreate = [
          {
            approvalWorkflowId: wf.id,
            stageType: ApprovalStageTypeConst.ATTENDANCE,
            stepOrder: 1,
            requiredRoleId: hrCsManagerRole.id,
            isRequired: true,
          }
        ];
        if (hrCsDirectorRole) {
          stepsToCreate.push({
            approvalWorkflowId: wf.id,
            stageType: ApprovalStageTypeConst.ATTENDANCE,
            stepOrder: 2,
            requiredRoleId: hrCsDirectorRole.id,
            isRequired: true,
          });
        }
        await tx.approvalStep.createMany({
          data: stepsToCreate,
        });
      }

      // 3. Update PAYMENT_FILE to use Finance Officer (step 1) → Finance Manager (step 2)
      const paymentSteps = wf.steps.filter(
        (s) => s.stageType === ApprovalStageTypeConst.PAYMENT_FILE,
      );
      if (paymentSteps.length === 0 && financeOfficerRole && financeManagerRole) {
        await tx.approvalStep.create({
          data: {
            approvalWorkflowId: wf.id,
            stageType: ApprovalStageTypeConst.PAYMENT_FILE,
            stepOrder: 1,
            requiredRoleId: financeOfficerRole.id,
            isRequired: true,
          },
        });
        await tx.approvalStep.create({
          data: {
            approvalWorkflowId: wf.id,
            stageType: ApprovalStageTypeConst.PAYMENT_FILE,
            stepOrder: 2,
            requiredRoleId: financeManagerRole.id,
            isRequired: true,
          },
        });
      }

      // 4. Bump schema version
      await tx.approvalWorkflow.update({
        where: { id: wf.id },
        data: { schemaVersion: 3 },
      });

      logger.info({ workflowId, companyId }, "[ApprovalWorkflow] Workflow schema upgraded to v3");
    });
  }

  /**
   * Load (or create) the active workflow for a company.
   */
  async getWorkflowForCompany(companyId: number) {
    let workflow = await prisma.approvalWorkflow.findFirst({
      where: { companyId, isActive: true },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
          include: { requiredRole: true, alternateRole: true },
        },
      },
    });

    if (!workflow) {
      // Auto-seed default workflow
      workflow = await prisma.approvalWorkflow.create({
        data: {
          companyId,
          name: "Default Payroll Workflow",
          description: "Auto-generated default approval workflow",
          isActive: true,
        },
        include: {
          steps: {
            orderBy: { stepOrder: "asc" },
            include: { requiredRole: true, alternateRole: true },
          },
        },
      });

      // Find the Admin, Finance Manager, and HR CS Manager roles dynamically
      const adminRole = await prisma.appRole.findFirst({
        where: { name: { in: REQUIRED_APPROVAL_ROLES.ADMIN } },
      });
      // Resolve roles by name — no hardcoded IDs
      const financeRole = await this.resolveRoleByName(REQUIRED_APPROVAL_ROLES.FINANCE_MANAGER);
      const hrCsManagerRole = await this.resolveRoleByName(REQUIRED_APPROVAL_ROLES.HR_CS_MANAGER);
      const financeOfficerRole = await this.resolveRoleByName(REQUIRED_APPROVAL_ROLES.FINANCE_OFFICER);
      const hrCsDirectorRole = await this.resolveRoleByName(REQUIRED_APPROVAL_ROLES.HR_CS_DIRECTOR);

      const adminRoleId = adminRole?.id;
      const financeRoleId = financeRole?.id;
      const hrCsManagerRoleId = hrCsManagerRole?.id;

      if (!hrCsManagerRoleId || !financeRoleId) {
        logger.error(
          {
            errorCode: "APPROVAL_ROLE_MISSING",
            companyId,
            workflowId: workflow.id,
            missingRoles: [
              ...(!hrCsManagerRoleId ? ["HR_CS_MANAGER"] : []),
              ...(!financeRoleId ? ["FINANCE_MANAGER"] : []),
            ],
          },
          "[APPROVAL_ROLE_MISSING] Cannot seed default steps: required roles not found in AppRole table.",
        );
      } else {
        await prisma.approvalStep.createMany({
          data: [
            {
              approvalWorkflowId: workflow.id,
              stageType: ApprovalStageTypeConst.ATTENDANCE,
              stepOrder: 1,
              requiredRoleId: hrCsManagerRoleId,
              isRequired: true,
            },
            ...(hrCsDirectorRole
              ? [{
                  approvalWorkflowId: workflow.id,
                  stageType: ApprovalStageTypeConst.ATTENDANCE,
                  stepOrder: 2,
                  requiredRoleId: hrCsDirectorRole.id,
                  isRequired: true,
                }]
              : []),
            {
              approvalWorkflowId: workflow.id,
              stageType: ApprovalStageTypeConst.PAYROLL_APPROVAL,
              stepOrder: 3,
              requiredRoleId: hrCsManagerRoleId,
              isRequired: true,
            },
            {
              approvalWorkflowId: workflow.id,
              stageType: ApprovalStageTypeConst.PAYROLL_APPROVAL,
              stepOrder: 4,
              requiredRoleId: financeRoleId,
              alternateRoleId: financeOfficerRole?.id ?? null,
              isRequired: true,
            },
            {
              approvalWorkflowId: workflow.id,
              stageType: ApprovalStageTypeConst.PAYMENT_FILE,
              stepOrder: 5,
              requiredRoleId: financeOfficerRole?.id ?? financeRoleId,
              isRequired: true,
            },
            {
              approvalWorkflowId: workflow.id,
              stageType: ApprovalStageTypeConst.PAYMENT_FILE,
              stepOrder: 6,
              requiredRoleId: financeRoleId,
              isRequired: true,
            },
          ],
        });
      }

      logger.info({ companyId, workflowId: workflow.id }, "[ApprovalWorkflow] Seeded default workflow");

      // Re-fetch with steps
      const updatedWorkflow = await prisma.approvalWorkflow.findUnique({
        where: { id: workflow.id },
        include: {
          steps: {
            orderBy: { stepOrder: "asc" },
            include: { requiredRole: true, alternateRole: true },
          },
        },
      });
      workflow = updatedWorkflow ?? workflow;
    } else {
      // ── Upgrade existing workflows that need schema migration ──
      if (workflow.schemaVersion < 2) {
        await this.upgradeWorkflowSchema(workflow.id, companyId);
        // Re-fetch after upgrade — override var with updated result
        workflow = await prisma.approvalWorkflow.findFirst({
          where: { companyId, isActive: true },
          include: {
            steps: {
              orderBy: { stepOrder: "asc" },
              include: { requiredRole: true, alternateRole: true },
            },
          },
        }) ?? workflow;
      }
      if (workflow && workflow.schemaVersion < 3) {
        await this.upgradeWorkflowSchemaV3(workflow.id, companyId);
        workflow = await prisma.approvalWorkflow.findFirst({
          where: { companyId, isActive: true },
          include: {
            steps: {
              orderBy: { stepOrder: "asc" },
              include: { requiredRole: true, alternateRole: true },
            },
          },
        }) ?? workflow;
      }
    }

    return workflow;
  }

  /**
   * Create a new workflow for a company.
   */
  async createWorkflow(companyId: number, name: string, description?: string) {
    return prisma.approvalWorkflow.create({
      data: { companyId, name, description, isActive: true },
    });
  }

  /**
   * Update workflow metadata (name, isActive).
   */
  async updateWorkflow(workflowId: string, data: { name?: string; isActive?: boolean }) {
    const workflow = await prisma.approvalWorkflow.findUnique({
      where: { id: workflowId },
    });
    if (!workflow) {
      throw new CustomError(httpStatus.NOT_FOUND, "Workflow not found");
    }
    return prisma.approvalWorkflow.update({
      where: { id: workflowId },
      data,
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
          include: { requiredRole: true, alternateRole: true },
        },
      },
    });
  }

  /**
   * Activate a workflow. Deactivates all other workflows for the same company.
   * Only one workflow can be active per company.
   */
  async activateWorkflow(workflowId: string) {
    const workflow = await prisma.approvalWorkflow.findUnique({
      where: { id: workflowId },
    });
    if (!workflow) {
      throw new CustomError(httpStatus.NOT_FOUND, "Workflow not found");
    }

    return prisma.$transaction(async (tx) => {
      // Deactivate all other workflows for this company
      await tx.approvalWorkflow.updateMany({
        where: { companyId: workflow.companyId, id: { not: workflowId }, isActive: true },
        data: { isActive: false },
      });

      // Activate the target workflow
      const updated = await tx.approvalWorkflow.update({
        where: { id: workflowId },
        data: { isActive: true },
        include: {
          steps: {
            orderBy: { stepOrder: "asc" },
            include: { requiredRole: true, alternateRole: true },
          },
        },
      });

      return updated;
    });
  }

  /**
   * Deactivate a workflow.
   */
  async deactivateWorkflow(workflowId: string) {
    const workflow = await prisma.approvalWorkflow.findUnique({
      where: { id: workflowId },
    });
    if (!workflow) {
      throw new CustomError(httpStatus.NOT_FOUND, "Workflow not found");
    }
    return prisma.approvalWorkflow.update({
      where: { id: workflowId },
      data: { isActive: false },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
          include: { requiredRole: true, alternateRole: true },
        },
      },
    });
  }

  // ── Step CRUD ─────────────────────────────────────────────

  /**
   * Add a step to a workflow.
   */
  async addStep(
    workflowId: string,
    data: {
      stageType: ApprovalStageType;
      stepOrder: number;
      requiredRoleId: number;
      alternateRoleId?: number | null;
      isRequired: boolean;
    },
  ) {
    const workflow = await prisma.approvalWorkflow.findUnique({
      where: { id: workflowId },
    });
    if (!workflow) {
      throw new CustomError(httpStatus.NOT_FOUND, "Workflow not found");
    }

    return prisma.approvalWorkflow.update({
      where: { id: workflowId },
      data: {
        steps: {
          create: {
            stageType: data.stageType,
            stepOrder: data.stepOrder,
            requiredRoleId: data.requiredRoleId,
            alternateRoleId: data.alternateRoleId ?? null,
            isRequired: data.isRequired,
          },
        },
      },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
          include: { requiredRole: true, alternateRole: true },
        },
      },
    });
  }

  /**
   * Update a step's configuration.
   */
  async updateStep(
    stepId: string,
    data: {
      stageType?: ApprovalStageType;
      stepOrder?: number;
      requiredRoleId?: number;
      alternateRoleId?: number | null;
      isRequired?: boolean;
    },
  ) {
    const step = await prisma.approvalStep.findUnique({
      where: { id: stepId },
    });
    if (!step) {
      throw new CustomError(httpStatus.NOT_FOUND, "Approval step not found");
    }

    await prisma.approvalStep.update({
      where: { id: stepId },
      data,
    });

    // Return the parent workflow with updated steps
    return prisma.approvalWorkflow.findUnique({
      where: { id: step.approvalWorkflowId },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
          include: { requiredRole: true, alternateRole: true },
        },
      },
    });
  }

  /**
   * Delete a step from its workflow.
   */
  async deleteStep(stepId: string) {
    const step = await prisma.approvalStep.findUnique({
      where: { id: stepId },
    });
    if (!step) {
      throw new CustomError(httpStatus.NOT_FOUND, "Approval step not found");
    }

    await prisma.approvalStep.delete({
      where: { id: stepId },
    });

    return prisma.approvalWorkflow.findUnique({
      where: { id: step.approvalWorkflowId },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
          include: { requiredRole: true, alternateRole: true },
        },
      },
    });
  }

  // ── Approval Requests ─────────────────────────────────────

  /**
   * Get approval requests with optional filtering by payrollRunId or attendanceImportId.
   */
  async getApprovalStatus(params: {
    payrollRunId?: string;
    attendanceImportId?: string;
    payrollPeriodId?: string;
  }) {
    const where: any = {};

    // When payrollPeriodId is provided, ALWAYS search by period (superset).
    // This finds period-level requests regardless of which specific run the
    // user has selected in the frontend UI.
    if (params.payrollPeriodId) {
      const periodRunIds = await prisma.payrollRun.findMany({
        where: { payrollPeriodId: params.payrollPeriodId },
        select: { id: true },
      });
      if (periodRunIds.length > 0) {
        where.payrollRunId = { in: periodRunIds.map((r) => r.id) };
      }
    } else if (params.payrollRunId) {
      where.payrollRunId = params.payrollRunId;
    }

    if (params.attendanceImportId) where.attendanceImportId = params.attendanceImportId;

    return prisma.approvalRequest.findMany({
      where,
      include: {
        approvalActions: {
          include: {
            actor: {
              include: {
                role: true,
              },
            },
          },
          orderBy: { actedAt: "desc" },
        },
      },
      orderBy: { requestedAt: "desc" },
    });
  }

  /**
   * Create an approval request. Transitions the PayrollRun status based on stageType.
   *
   * Stage transitions:
   *   PAYROLL_APPROVAL  → PENDING_PAYROLL_APPROVAL
   *   PAYMENT_FILE      → PENDING_PAYMENT_APPROVAL
   *   ATTENDANCE        → No PayrollRun update (informational)
   */
  async requestApproval(
    companyId: number,
    userId: number,
    stageType: ApprovalStageType,
    referenceType: string,
    payrollRunId?: string,
    attendanceImportId?: string,
    payrollPeriodId?: string,
  ) {
    const resolvedStageType = stageType;

    const result = await prisma.$transaction(async (tx) => {
      // ── Period-level submission: submit ALL runs for the period ──
      if (payrollPeriodId && referenceType === "PAYROLL_RUN" && !payrollRunId) {
        // ── Filter runs based on stage type ──
        // PAYMENT_FILE: only runs that are APPROVED (passed payroll approval, ready for payment)
        // PAYROLL_APPROVAL: runs not yet submitted or approved
        const isPaymentStage = resolvedStageType === ApprovalStageTypeConst.PAYMENT_FILE;

        const periodRuns = await tx.payrollRun.findMany({
          where: {
            payrollPeriodId,
            ...(isPaymentStage
              ? { status: PayrollStatusConst.APPROVED }
              : {
                  status: {
                    notIn: [
                      PayrollStatusConst.PENDING_PAYROLL_APPROVAL,
                      PayrollStatusConst.APPROVED,
                      PayrollStatusConst.PENDING_PAYMENT_APPROVAL,
                      PayrollStatusConst.DONE,
                    ],
                  },
                }),
          },
          orderBy: { createdAt: "asc" },
        });

        if (periodRuns.length === 0) {
          throw new CustomError(
            httpStatus.BAD_REQUEST,
            isPaymentStage
              ? "No approved payroll runs found for payment submission. Runs must be approved first."
              : "No payroll runs available for submission. All runs for this period may already be submitted or approved.",
          );
        }

        // Create ONE approval request linked to the first run (anchor)
        const request = await tx.approvalRequest.create({
          data: {
            stageType: resolvedStageType,
            referenceType: referenceType as ReferenceType,
            payrollRunId: periodRuns[0].id,
            attendanceImportId: attendanceImportId ?? undefined,
            status: ApprovalStatusConst.PENDING,
            requestedBy: String(userId),
            requestedAt: new Date(),
          },
        });

        // Update ALL runs for the period to the correct pending status
        const runIds = periodRuns.map((r) => r.id);
        const nextStatus = isPaymentStage
          ? PayrollStatusConst.PENDING_PAYMENT_APPROVAL
          : PayrollStatusConst.PENDING_PAYROLL_APPROVAL;
        await tx.payrollRun.updateMany({
          where: { id: { in: runIds } },
          data: { status: nextStatus },
        });

        // PAYMENT_FILE: Auto-approve step 1 (Finance Officer) within the same transaction.
        // Finance Officer's act of submitting IS their approval of step 1.
        // This immediately advances currentStep to step 2 (Finance Manager) so the
        // Finance Manager can approve without receiving a 403.
        if (isPaymentStage) {
          await tx.approvalAction.create({
            data: {
              approvalRequestId: request.id,
              actorId: userId,
              action: ApprovalStatusConst.APPROVED,
              comment: "Auto-approved: Finance Officer submission counts as step-1 approval",
              ipAddress: null,
            },
          });
        }

        return request;
      }

      // ── Single-run submission (legacy / per-batch) ──
      const request = await tx.approvalRequest.create({
        data: {
          stageType: resolvedStageType,
          referenceType: referenceType as ReferenceType,
          payrollRunId: payrollRunId ?? undefined,
          attendanceImportId: attendanceImportId ?? undefined,
          status: ApprovalStatusConst.PENDING,
          requestedBy: String(userId),
          requestedAt: new Date(),
        },
      });

      // Update PayrollRun status based on stage type
      if (payrollRunId) {
        let newPayrollStatus: PayrollStatus;
        if (resolvedStageType === ApprovalStageTypeConst.PAYMENT_FILE) {
          newPayrollStatus = PayrollStatusConst.PENDING_PAYMENT_APPROVAL;
        } else {
          newPayrollStatus = PayrollStatusConst.PENDING_PAYROLL_APPROVAL;
        }

        await tx.payrollRun.update({
          where: { id: payrollRunId },
          data: { status: newPayrollStatus },
        });
      }

      // For attendance imports, update the import status to PENDING
      if (attendanceImportId && referenceType === "ATTENDANCE_IMPORT") {
        await tx.attendanceImport.update({
          where: { id: attendanceImportId },
          data: { status: ApprovalStatusConst.PENDING },
        });
      }

      // PAYMENT_FILE (single-run): Auto-approve step 1 (Finance Officer) — same reason as above.
      if (resolvedStageType === ApprovalStageTypeConst.PAYMENT_FILE) {
        await tx.approvalAction.create({
          data: {
            approvalRequestId: request.id,
            actorId: userId,
            action: ApprovalStatusConst.APPROVED,
            comment: "Auto-approved: Finance Officer submission counts as step-1 approval",
            ipAddress: null,
          },
        });
      }

      return request;
    });

    // ── Notification hooks ──
    if (attendanceImportId && referenceType === "ATTENDANCE_IMPORT") {
      try {
        // Get submitter name for email (AppUser has no employee relation — query separately)
        const submitterUser = await prisma.appUser.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        const submitterEmployee = submitterUser
          ? await prisma.employee.findFirst({
              where: { userId: submitterUser.id },
              select: { firstName: true, lastName: true },
            })
          : null;
        const submitterName = submitterEmployee
          ? `${submitterEmployee.firstName} ${submitterEmployee.lastName}`
          : `User #${userId}`;

        // Get import period label for email (AttendanceImport has no importMonth/importYear)
        const attendanceImport = await prisma.attendanceImport.findUnique({
          where: { id: attendanceImportId },
          select: { periodLabel: true },
        });
        const importMonth = attendanceImport?.periodLabel ?? undefined;

        const hrManagerRole = await prisma.appRole.findFirst({
          where: { name: { in: REQUIRED_APPROVAL_ROLES.HR_CS_MANAGER } },
        });
        if (hrManagerRole) {
          const hrManagers = await prisma.appUser.findMany({
            where: { roleId: hrManagerRole.id },
          });
          for (const mgr of hrManagers) {
            await notificationService.create({
              recipientId: mgr.id,
              type: "ATTENDANCE_SUBMITTED",
              title: "Attendance Submitted for Approval",
              message: "Attendance import has been submitted for your approval.",
              category: "attendance",
              referenceId: attendanceImportId,
              link: "/approval",
              emailData: { submitterName, importMonth: importMonth || "N/A" },
            });
          }
        }
      } catch (err) {
        logger.error(err, "[ApprovalWorkflow] Failed to send submit notification");
      }
    }

    return result;
  }

  /**
   * Approve a pending request.
   *
   * Step resolution:
   * 1. Load the request with existing actions
   * 2. Reject if already resolved (status != PENDING)
   * 3. Compute current step = first step whose requiredRoleId hasn't approved yet
   * 4. Reject if caller's role doesn't match current step's requiredRoleId
   *    (unless roleOverride is provided for Admin)
   * 5. Create APPROVED action
   * 6. Re-compute steps: if all required steps approved, transition PayrollRun
   *    - PAYROLL_APPROVAL all done → APPROVED
   *    - PAYMENT_FILE all done → DONE
   */
  async approveRequest(
    companyId: number,
    userId: number,
    requestId: string,
    comment?: string,
    roleOverride?: string,
    jwtRoleName?: string,       // role name from JWT — fallback when user not found in local DB
  ) {
    // (workflow is loaded inside the transaction below to avoid stale-read races)

    const result = await prisma.$transaction(async (tx) => {
      // 0. Load the workflow INSIDE the transaction to eliminate stale-read window
      const workflow = await tx.approvalWorkflow.findFirst({
        where: { companyId, isActive: true },
        include: { steps: { orderBy: { stepOrder: "asc" } } },
      });

      // If workflow needs schema upgrade, do it now (schemaVersion-gated, safe to call)
      if (workflow && workflow.schemaVersion < 2) {
        // Upgrade runs in its own nested transaction; re-read after
        await this.upgradeWorkflowSchema(workflow.id, companyId);
      }

      // Re-read workflow after potential upgrade (still inside main tx)
      const activeWorkflow = workflow?.schemaVersion && workflow.schemaVersion < 2
        ? await tx.approvalWorkflow.findFirst({
            where: { companyId, isActive: true },
            include: { steps: { orderBy: { stepOrder: "asc" } } },
          })
        : workflow;

      // 1. Load the request
      const request = await tx.approvalRequest.findUnique({
        where: { id: requestId },
        include: {
          approvalActions: {
            include: {
              actor: { select: { roleId: true } },
            },
          },
        },
      });

      if (!request) {
        throw new CustomError(httpStatus.NOT_FOUND, "Approval request not found");
      }

      if (request.status !== ApprovalStatusConst.PENDING) {
        throw new CustomError(
          httpStatus.CONFLICT,
          `Request is already ${request.status.toLowerCase()}. Only pending requests can be approved.`,
        );
      }

      if (!activeWorkflow) {
        throw new CustomError(
          httpStatus.BAD_REQUEST,
          "No active approval workflow configured for this company.",
        );
      }

      // 3. Use the request's stageType directly — ATTENDANCE is now its own stage type
      const relevantSteps = activeWorkflow.steps.filter(
        (s) => s.stageType === request.stageType,
      );

      if (relevantSteps.length === 0) {
        throw new CustomError(
          httpStatus.BAD_REQUEST,
          `No workflow steps configured for stage "${request.stageType}".`,
        );
      }

      // 4. Compute approved role IDs from existing actions
      const approvedRoleIds = new Set(
        request.approvalActions
          .filter((a) => a.action === "APPROVED")
          .map((a) => a.actor?.roleId)
          .filter((id): id is number => id != null),
      );

      // 4b. Skip steps whose requiredRole has zero AppUsers (auto-approve — role exists but no one to act)
      const stepsToAutoApprove = new Map<string, Set<number>>(); // stepId → roleIds auto-approved
      for (const step of relevantSteps) {
        if (!step.isRequired) continue;
        const alreadyApproved = approvedRoleIds.has(step.requiredRoleId) ||
          (step.alternateRoleId != null && approvedRoleIds.has(step.alternateRoleId));
        if (alreadyApproved) continue;

        const userCount = await tx.appUser.count({
          where: { roleId: step.requiredRoleId },
        });
        if (userCount === 0) {
          // No users assigned to this role — auto-approve the step
          approvedRoleIds.add(step.requiredRoleId);
          if (!stepsToAutoApprove.has(step.id)) {
            stepsToAutoApprove.set(step.id, new Set());
          }
          stepsToAutoApprove.get(step.id)!.add(step.requiredRoleId);
          logger.info(
            { stepId: step.id, roleId: step.requiredRoleId },
            "[approveRequest] Step auto-approved: no users assigned to required role",
          );
        }
      }

      // 5. Find current step = first required step whose role (or alternate) hasn't approved
      const currentStep = relevantSteps.find((step) => {
        if (!step.isRequired) return false; // skip optional steps
        const primaryDone = approvedRoleIds.has(step.requiredRoleId);
        const alternateDone =
          step.alternateRoleId != null &&
          approvedRoleIds.has(step.alternateRoleId);
        return !primaryDone && !alternateDone;
      });

      if (!currentStep) {
        throw new CustomError(
          httpStatus.CONFLICT,
          "All required steps for this stage have already been approved.",
        );
      }

      // 6. Verify the caller's role matches the current step
      const user = await tx.appUser.findUnique({
        where: { id: userId },
        select: { roleId: true },
      });

      let effectiveRoleId = user?.roleId;

      // If the user wasn't found in the local DB (sync hasn't run), fall back to
      // resolving the role ID from the JWT role name.
      if (!effectiveRoleId && jwtRoleName) {
        const jwtRole = await tx.appRole.findFirst({
          where: { name: { contains: jwtRoleName, mode: "insensitive" } },
        });
        if (jwtRole) {
          effectiveRoleId = jwtRole.id;
        }
      }

      // Admin override: if roleOverride is provided, resolve the roleId
      if (roleOverride) {
        const overrideRole = await tx.appRole.findFirst({
          where: { name: { contains: roleOverride, mode: "insensitive" } },
        });
        if (overrideRole) {
          effectiveRoleId = overrideRole.id;
        }
      }

      logger.debug(
        { requestId, effectiveRoleId, currentStepRequiredRoleId: currentStep.requiredRoleId },
        "[approveRequest] Role check",
      );

      if (
        !effectiveRoleId ||
        (effectiveRoleId !== currentStep.requiredRoleId &&
         effectiveRoleId !== currentStep.alternateRoleId)
      ) {
        // Check if user is Admin/Super Admin with override capability
        const userRole = await tx.appRole.findUnique({
          where: { id: user?.roleId ?? (effectiveRoleId ?? 0) },
        });
        const isAdmin = userRole?.name && [RoleNames.ADMIN as string, RoleNames.SUPERADMIN as string].includes(userRole.name);

        if (!isAdmin) {
          throw new CustomError(
            httpStatus.FORBIDDEN,
            `Your role is not authorized for the current approval step. Waiting on role ID ${currentStep.requiredRoleId} to approve.`,
          );
        }
        // Admin can act as any role — allow it but mark clearly
        effectiveRoleId = currentStep.requiredRoleId;
      }

      // 6b. Ensure the actor exists in AppUser (users from auth system may not be synced)
      if (!user) {
        await tx.appUser.create({
          data: {
            id: userId,
            roleId: effectiveRoleId,
            status: "ACTIVE",
          },
        });
      }

      // 7. Create the APPROVED action
      const action = await tx.approvalAction.create({
        data: {
          approvalRequestId: requestId,
          actorId: userId,
          action: ApprovalStatusConst.APPROVED,
          comment: comment ?? null,
          ipAddress: null,
        },
      });

      // 8. Re-compute: are all required steps for this stage now approved?
      const updatedApprovedRoleIds = new Set(approvedRoleIds);
      updatedApprovedRoleIds.add(effectiveRoleId);

      const allRequiredDone = relevantSteps
        .filter((s) => s.isRequired)
        .every((s) => updatedApprovedRoleIds.has(s.requiredRoleId) ||
               (s.alternateRoleId != null && updatedApprovedRoleIds.has(s.alternateRoleId)));

      // 9. If all required steps done, resolve the request and transition PayrollRun
      if (allRequiredDone) {
        await tx.approvalRequest.update({
          where: { id: requestId },
          data: {
            status: ApprovalStatusConst.APPROVED,
            resolvedAt: new Date(),
          },
        });

        // Transition PayrollRun based on stage type
        if (request.payrollRunId) {
          let newPayrollStatus: PayrollStatus;
          if (request.stageType === ApprovalStageTypeConst.PAYMENT_FILE) {
            newPayrollStatus = PayrollStatusConst.DONE;
          } else {
            // PAYROLL_APPROVAL all approved → APPROVED
            newPayrollStatus = PayrollStatusConst.APPROVED;
          }

          await tx.payrollRun.update({
            where: { id: request.payrollRunId },
            data: { status: newPayrollStatus },
          });

          // Also update sibling runs in the same period so all runs submitted
          // together transition together, regardless of stage type.
          const anchorRun = await tx.payrollRun.findUnique({
            where: { id: request.payrollRunId },
            select: { payrollPeriodId: true },
          });
          if (anchorRun?.payrollPeriodId) {
            const pendingStatus =
              request.stageType === ApprovalStageTypeConst.PAYMENT_FILE
                ? PayrollStatusConst.PENDING_PAYMENT_APPROVAL
                : PayrollStatusConst.PENDING_PAYROLL_APPROVAL;
            await tx.payrollRun.updateMany({
              where: {
                payrollPeriodId: anchorRun.payrollPeriodId,
                status: pendingStatus,
              },
              data: { status: newPayrollStatus },
            });
          }

          // When PayrollRun transitions to DONE (payment fully approved), mark all payslips as DONE
          // NOTE: payslips stay DRAFT while status is APPROVED (payroll approved but payment not yet)
          if (newPayrollStatus === PayrollStatusConst.DONE) {
            if (anchorRun?.payrollPeriodId) {
              // Update payslips for all runs in the period that match the new status
              await tx.payslip.updateMany({
                where: {
                  payrollRunItem: {
                    payrollRun: {
                      payrollPeriodId: anchorRun.payrollPeriodId,
                      status: newPayrollStatus,
                    },
                  },
                  visibilityStatus: "DRAFT",
                },
                data: { visibilityStatus: "DONE" },
              });
            } else {
              // No period — update payslips for this specific run only
              await tx.payslip.updateMany({
                where: {
                  payrollRunItem: { payrollRunId: request.payrollRunId! },
                  visibilityStatus: "DRAFT",
                },
                data: { visibilityStatus: "DONE" },
              });
            }
          }
        }

        if (request.attendanceImportId) {
          await tx.attendanceImport.update({
            where: { id: request.attendanceImportId },
            data: { status: ApprovalStatusConst.APPROVED },
          });
        }
      }

      // Return the updated request with actions
      return tx.approvalRequest.findUnique({
        where: { id: requestId },
        include: {
          approvalActions: {
            include: {
              actor: {
                include: { role: true },
              },
            },
            orderBy: { actedAt: "desc" },
          },
        },
      });
    });

    // ── Notification hooks (non-blocking — errors logged but not thrown) ──
    if (result?.attendanceImportId) {
      try {
        // Get import period label for email
        const attendanceImport = await prisma.attendanceImport.findUnique({
          where: { id: result.attendanceImportId },
          select: { periodLabel: true },
        });
        const importMonth = attendanceImport?.periodLabel ?? undefined;

        await notificationService.create({
          recipientId: Number(result.requestedBy),
          type: "ATTENDANCE_APPROVED",
          title: "Attendance Approved",
          message: "Your attendance submission has been approved.",
          category: "attendance",
          referenceId: result.attendanceImportId,
          link: "/approval",
          emailData: { importMonth: importMonth || "N/A" },
        });
      } catch (err) {
        logger.error(err, "[ApprovalWorkflow] Failed to send approve notification");
      }
    }

    // ── Payroll approval notifications ──
    if (result?.stageType === ApprovalStageTypeConst.PAYROLL_APPROVAL && !result?.attendanceImportId) {
      try {
        // Get period name for email
        let periodName: string | undefined;
        if (result.payrollRunId) {
          const run = await prisma.payrollRun.findUnique({
            where: { id: result.payrollRunId },
            select: { payrollPeriod: { select: { name: true } } },
          });
          periodName = run?.payrollPeriod?.name ?? undefined;
        }

        // Get submitter name for email (AppUser has no employee relation)
        const submitterEmployee = await prisma.employee.findFirst({
          where: { userId: Number(result.requestedBy) },
          select: { firstName: true, lastName: true },
        });
        const submitterName = submitterEmployee
          ? `${submitterEmployee.firstName} ${submitterEmployee.lastName}`
          : `User #${result.requestedBy}`;

        const approvedRoleIds = new Set<number>(
          (result.approvalActions ?? [])
            .filter((a) => a.action === "APPROVED")
            .map((a) => a.actor?.roleId)
            .filter((id): id is number => id != null),
        );

        // Load workflow for step-completion check
        const notifWorkflow = await prisma.approvalWorkflow.findFirst({
          where: { companyId, isActive: true },
          include: { steps: { orderBy: { stepOrder: "asc" } } },
        });
        if (!notifWorkflow) return result;
        const relevantSteps = notifWorkflow.steps.filter(
          (s) => s.stageType === result!.stageType,
        );

        const allStepsDone = relevantSteps
          .filter((s) => s.isRequired)
          .every((s) => approvedRoleIds.has(s.requiredRoleId) || (s.alternateRoleId != null && approvedRoleIds.has(s.alternateRoleId)));

        if (allStepsDone) {
          await notificationService.create({
            recipientId: Number(result.requestedBy),
            type: "PAYROLL_APPROVED",
            title: "Payroll Approved — Ready for Payment",
            message: "All approvals complete. Payroll is cleared for payment.",
            category: "payroll",
            referenceId: result.payrollRunId ?? undefined,
            link: "/payroll",
            emailData: { periodName: periodName || "N/A" },
          });
        } else {
          // Notify finance users by role name — no hardcoded IDs
          const financeRoles = await prisma.appRole.findMany({
            where: { name: { in: [...REQUIRED_APPROVAL_ROLES.FINANCE_MANAGER, ...REQUIRED_APPROVAL_ROLES.FINANCE_OFFICER] } },
            select: { id: true },
          });
          const financeRoleIds = financeRoles.map((r) => r.id);
          if (financeRoleIds.length > 0) {
            const financeUsers = await prisma.appUser.findMany({
              where: { roleId: { in: financeRoleIds } },
              select: { id: true },
            });
            for (const user of financeUsers) {
              await notificationService.create({
                recipientId: user.id,
                type: "PAYROLL_SUBMITTED",
                title: "Payroll Ready for Finance Review",
                message: "HR CS Manager has approved. Finance review and approval required.",
                category: "payroll",
                referenceId: result.payrollRunId ?? undefined,
                link: "/approval",
                emailData: { submitterName, periodName: periodName || "N/A" },
              });
            }
          }
        }
      } catch (err) {
        logger.error(err, "[ApprovalWorkflow] Failed to send payroll approval notifications");
      }
    }

    // ── Auto-generate payslips on final PAYMENT_FILE approval ──
    if (result?.stageType === ApprovalStageTypeConst.PAYMENT_FILE && !result?.attendanceImportId) {
      try {
        // Find the anchor run's period
        const anchorRun = await prisma.payrollRun.findUnique({
          where: { id: result.payrollRunId! },
          select: { payrollPeriodId: true },
        });

        if (anchorRun?.payrollPeriodId) {
          // Find all runs in this period that just transitioned to DONE
          const doneRuns = await prisma.payrollRun.findMany({
            where: {
              payrollPeriodId: anchorRun.payrollPeriodId,
              status: PayrollStatusConst.DONE,
            },
            select: { id: true },
          });

          for (const run of doneRuns) {
            payslipRenderService
              .batchGeneratePayslipPdfs({
                companyId,
                payrollRunId: run.id,
              })
              .catch((err: any) => {
                logger.error({ err, runId: run.id }, "[Payslip] Auto-generation failed for run");
              });
          }

          // Send PAYSLIP_READY notifications to employees
          try {
            // Get period name
            const period = await prisma.payrollPeriod.findUnique({
              where: { id: anchorRun.payrollPeriodId },
              select: { name: true },
            });

            // Get all payslips that just became DONE — include PayrollRunItem for salary info
            const readyPayslips = await prisma.payslip.findMany({
              where: {
                payrollRunItem: {
                  payrollRun: {
                    payrollPeriodId: anchorRun.payrollPeriodId,
                    status: PayrollStatusConst.DONE,
                  },
                },
                visibilityStatus: "DONE",
              },
              include: {
                payrollRunItem: {
                  select: {
                    netSalary: true,
                    currency: true,
                    employeeId: true,
                  },
                },
              },
            });

            for (const payslip of readyPayslips) {
              // Employee has no Prisma user relation — look up AppUser by userId
              const employee = await prisma.employee.findUnique({
                where: { id: payslip.payrollRunItem.employeeId },
                select: { userId: true, firstName: true, lastName: true },
              });
              if (!employee?.userId) continue;

              await notificationService.create({
                recipientId: employee.userId,
                type: "PAYSLIP_READY",
                title: "Your Payslip is Ready!",
                message: `Your payslip for ${period?.name || "the current period"} has been processed and is available for download.`,
                category: "payslip",
                referenceId: payslip.id,
                link: "/payslips",
                emailData: {
                  periodName: period?.name || "N/A",
                  netSalary: payslip.payrollRunItem?.netSalary?.toString() || "0",
                  currency: payslip.payrollRunItem?.currency || "ETB",
                },
              });
            }

            logger.info(
              { count: readyPayslips.length, periodId: anchorRun.payrollPeriodId },
              "[ApprovalWorkflow] Sent PAYSLIP_READY notifications",
            );
          } catch (err) {
            logger.error(err, "[ApprovalWorkflow] Failed to send PAYSLIP_READY notifications");
          }
        }
      } catch (err) {
        logger.error(err, "[Payslip] Failed to auto-generate payslips on final approval");
      }
    }

    return result;
  }

  /**
   * Reject a pending request. Always resets the PayrollRun to DRAFT.
   */
  async rejectRequest(
    companyId: number,
    userId: number,
    requestId: string,
    comment?: string,
    roleOverride?: string,
    jwtRoleName?: string,       // role name from JWT — fallback when user not found in local DB
  ) {

    const result = await prisma.$transaction(async (tx) => {
      // 1. Load the request
      const request = await tx.approvalRequest.findUnique({
        where: { id: requestId },
        include: {
          approvalActions: {
            include: {
              actor: { select: { roleId: true } },
            },
          },
        },
      });

      if (!request) {
        throw new CustomError(httpStatus.NOT_FOUND, "Approval request not found");
      }

      if (request.status !== ApprovalStatusConst.PENDING) {
        throw new CustomError(
          httpStatus.CONFLICT,
          `Request is already ${request.status.toLowerCase()}. Only pending requests can be rejected.`,
        );
      }

      // 2. Load the active workflow to find current step
      const workflow = await tx.approvalWorkflow.findFirst({
        where: { companyId, isActive: true },
        include: {
          steps: {
            orderBy: { stepOrder: "asc" },
          },
        },
      });

      if (!workflow) {
        throw new CustomError(
          httpStatus.BAD_REQUEST,
          "No active approval workflow configured for this company.",
        );
      }

      // 3. Use the request's stageType directly — ATTENDANCE is now its own stage type
      const relevantSteps = workflow.steps.filter(
        (s) => s.stageType === request.stageType,
      );

      const approvedRoleIds = new Set(
        request.approvalActions
          .filter((a) => a.action === "APPROVED")
          .map((a) => a.actor?.roleId)
          .filter((id): id is number => id != null),
      );

      const currentStep = relevantSteps.find((step) => {
        if (!step.isRequired) return false;
        const primaryDone = approvedRoleIds.has(step.requiredRoleId);
        const alternateDone =
          step.alternateRoleId != null &&
          approvedRoleIds.has(step.alternateRoleId);
        return !primaryDone && !alternateDone;
      });

      if (!currentStep) {
        throw new CustomError(
          httpStatus.CONFLICT,
          "All required steps for this stage have already been approved. Cannot reject a fully approved request.",
        );
      }

      const user = await tx.appUser.findUnique({
        where: { id: userId },
        select: { roleId: true },
      });

      let effectiveRoleId = user?.roleId;

      // If the user wasn't found in the local DB (sync hasn't run), fall back to
      // resolving the role ID from the JWT role name.
      if (!effectiveRoleId && jwtRoleName) {
        const jwtRole = await tx.appRole.findFirst({
          where: { name: { contains: jwtRoleName, mode: "insensitive" } },
        });
        if (jwtRole) {
          effectiveRoleId = jwtRole.id;
        }
      }

      if (roleOverride) {
        const overrideRole = await tx.appRole.findFirst({
          where: { name: { contains: roleOverride, mode: "insensitive" } },
        });
        if (overrideRole) {
          effectiveRoleId = overrideRole.id;
        }
      }

      if (
        !effectiveRoleId ||
        (effectiveRoleId !== currentStep.requiredRoleId &&
         effectiveRoleId !== currentStep.alternateRoleId)
      ) {
        const userRole = await tx.appRole.findUnique({
          where: { id: user?.roleId ?? (effectiveRoleId ?? 0) },
        });
        const isAdmin = userRole?.name && [RoleNames.ADMIN as string, RoleNames.SUPERADMIN as string].includes(userRole.name);

        if (!isAdmin) {
          throw new CustomError(
            httpStatus.FORBIDDEN,
            `Your role is not authorized for the current approval step. Waiting on role ID ${currentStep.requiredRoleId} to act.`,
          );
        }
        effectiveRoleId = currentStep.requiredRoleId;
      }

      // 3b. Ensure the actor exists in AppUser (users from auth system may not be synced)
      if (!user) {
        await tx.appUser.create({
          data: {
            id: userId,
            roleId: effectiveRoleId,
            status: "ACTIVE",
          },
        });
      }

      // 4. Create the REJECTED action
      await tx.approvalAction.create({
        data: {
          approvalRequestId: requestId,
          actorId: userId,
          action: ApprovalStatusConst.REJECTED,
          comment: comment ?? null,
          ipAddress: null,
        },
      });

      // 5. Resolve the request as REJECTED
      await tx.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: ApprovalStatusConst.REJECTED,
          resolvedAt: new Date(),
        },
      });

      // 6. Determine rejection routing based on stage type
      if (request.stageType === ApprovalStageTypeConst.PAYMENT_FILE) {
        // Finance rejection: go back to Finance Officer — reset to APPROVED
        // so the Finance Officer can resubmit the payment file
        if (request.payrollRunId) {
          await tx.payrollRun.update({
            where: { id: request.payrollRunId },
            data: { status: PayrollStatusConst.APPROVED },
          });
          // Also reset sibling runs in the same period
          const anchorRun = await tx.payrollRun.findUnique({
            where: { id: request.payrollRunId },
            select: { payrollPeriodId: true },
          });
          if (anchorRun?.payrollPeriodId) {
            await tx.payrollRun.updateMany({
              where: {
                payrollPeriodId: anchorRun.payrollPeriodId,
                status: PayrollStatusConst.PENDING_PAYMENT_APPROVAL,
              },
              data: { status: PayrollStatusConst.APPROVED },
            });
          }
        }
      } else {
        // HR-tier rejection: reset to DRAFT so initiator can resubmit
        if (request.payrollRunId) {
          await tx.payrollRun.update({
            where: { id: request.payrollRunId },
            data: { status: PayrollStatusConst.DRAFT },
          });
          // Also reset sibling runs in the same period
          const anchorRun = await tx.payrollRun.findUnique({
            where: { id: request.payrollRunId },
            select: { payrollPeriodId: true },
          });
          if (anchorRun?.payrollPeriodId) {
            await tx.payrollRun.updateMany({
              where: {
                payrollPeriodId: anchorRun.payrollPeriodId,
                status: PayrollStatusConst.PENDING_PAYROLL_APPROVAL,
              },
              data: { status: PayrollStatusConst.DRAFT },
            });
          }
        }
      }

      // 7. Update AttendanceImport status on rejection
      if (request.attendanceImportId) {
        await tx.attendanceImport.update({
          where: { id: request.attendanceImportId },
          data: {
            status: ApprovalStatusConst.REJECTED,
            isActive: false,
          },
        });
      }

      // Return the updated request with actions
      return tx.approvalRequest.findUnique({
        where: { id: requestId },
        include: {
          approvalActions: {
            include: {
              actor: {
                include: { role: true },
              },
            },
            orderBy: { actedAt: "desc" },
          },
        },
      });
    });

    // ── Notification hooks (non-blocking) ──
    if (result?.attendanceImportId) {
      try {
        // Get import period label for email
        const attendanceImport = await prisma.attendanceImport.findUnique({
          where: { id: result.attendanceImportId },
          select: { periodLabel: true },
        });
        const importMonth = attendanceImport?.periodLabel ?? undefined;

        await notificationService.create({
          recipientId: Number(result.requestedBy),
          type: "ATTENDANCE_REJECTED",
          title: "Attendance Rejected",
          message: comment || "Your attendance submission has been rejected.",
          category: "attendance",
          referenceId: result.attendanceImportId,
          link: "/approval",
          emailData: { importMonth: importMonth || "N/A", reason: comment || "No reason provided" },
        });
      } catch (err) {
        logger.error(err, "[ApprovalWorkflow] Failed to send reject notification");
      }
    }

    // ── Payroll rejection notification ──
    if (result?.stageType === ApprovalStageTypeConst.PAYROLL_APPROVAL && !result?.attendanceImportId) {
      try {
        // Get period name for email
        let periodName: string | undefined;
        if (result.payrollRunId) {
          const run = await prisma.payrollRun.findUnique({
            where: { id: result.payrollRunId },
            select: { payrollPeriod: { select: { name: true } } },
          });
          periodName = run?.payrollPeriod?.name ?? undefined;
        }

        await notificationService.create({
          recipientId: Number(result.requestedBy),
          type: "PAYROLL_REJECTED",
          title: "Payroll Approval Rejected",
          message: comment || "Your payroll submission has been rejected. Please correct and resubmit.",
          category: "payroll",
          referenceId: result.payrollRunId ?? undefined,
          link: "/payroll",
          emailData: { periodName: periodName || "N/A", reason: comment || "No reason provided" },
        });
      } catch (err) {
        logger.error(err, "[ApprovalWorkflow] Failed to send payroll rejection notification");
      }
    }

    return result;
  }
}

export const approvalWorkflowService = new ApprovalWorkflowService();
