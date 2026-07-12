import prisma from "../config/database";
import CustomError from "../utils/customError";
import httpStatus from "http-status";
import { attendanceNotificationService } from "./attendanceNotification.service";
import { payrollNotificationService } from "./payrollNotification.service";
import { $Enums } from "../generated/prisma";

type ApprovalStatus = $Enums.ApprovalStatus;
type PayrollStatus = $Enums.PayrollStatus;
type ApprovalStageType = $Enums.ApprovalStageType;

const ApprovalStatusConst = $Enums.ApprovalStatus;
const PayrollStatusConst = $Enums.PayrollStatus;
const ApprovalStageTypeConst = $Enums.ApprovalStageType;

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
  // ── Workflow helpers ──────────────────────────────────────

  /**
   * Ensure the company's active workflow includes a PAYROLL_DOCUMENT step.
   * Called from approveRequest / rejectRequest so the backend is self-healing
   * even if getWorkflowForCompany hasn't run the upgrade yet.
   */
  private async ensurePayrollDocStep(companyId: number): Promise<void> {
    const workflow = await prisma.approvalWorkflow.findFirst({
      where: { companyId, isActive: true },
      include: { steps: true },
    });
    if (!workflow) return; // no workflow yet — will be seeded elsewhere

    const hasPayrollDoc = workflow.steps.some(
      (s) => s.stageType === ApprovalStageTypeConst.PAYROLL_DOCUMENT,
    );
    if (hasPayrollDoc) return;

    // Find or create the HR Manager role in the local AppRole table.
    // The role may not exist yet if the sync from the employee management system
    // hasn't run. We seed it here so the foreign key constraint is satisfied.
    let hrManagerRole = await prisma.appRole.findFirst({
      where: { name: { in: ["HR Manager", "HR_MANAGER", "hr_manager"] } },
    });

    if (!hrManagerRole) {
      // Try to find "HR" role as a fallback for role name permissions
      const hrRole = await prisma.appRole.findFirst({
        where: { name: { in: ["HR", "hr", "HR Officer"] } },
      });
      // Use the HR role's name as display label but create the entry with ID 14
      hrManagerRole = await prisma.appRole.upsert({
        where: { id: 14 },
        create: {
          id: 14,
          name: "HR Manager",
          permissions: (hrRole?.permissions ?? null) as any,
        },
        update: {}, // already exists
      });
    }

    const roleId = hrManagerRole.id; // guaranteed non-null after upsert

    await prisma.approvalStep.create({
      data: {
        approvalWorkflowId: workflow.id,
        stageType: ApprovalStageTypeConst.PAYROLL_DOCUMENT,
        stepOrder: 0,
        requiredRoleId: roleId,
        isRequired: true,
      },
    });

    console.log(`[ApprovalWorkflow] Added PAYROLL_DOCUMENT step to workflow ${workflow.id} (roleId=${roleId})`);
  }

  private async ensureFinanceOfficerRole(): Promise<number> {
    let financeOfficerRole = await prisma.appRole.findFirst({
      where: { name: { in: ["Finance Officer", "finance_officer", "FINANCE_OFFICER"] } },
    });

    if (!financeOfficerRole) {
      const adminRole = await prisma.appRole.findFirst({
        where: { name: { in: ["Admin", "admin", "ADMIN"] } },
      });
      financeOfficerRole = await prisma.appRole.upsert({
        where: { id: 15 },
        create: {
          id: 15,
          name: "Finance Officer",
          permissions: (adminRole?.permissions ?? null) as any,
        },
        update: {},
      });
    }

    return financeOfficerRole.id;
  }

  private async ensurePayrollApprovalSteps(companyId: number): Promise<void> {
    const workflow = await prisma.approvalWorkflow.findFirst({
      where: { companyId, isActive: true },
      include: { steps: { orderBy: { stepOrder: "asc" } } },
    });
    if (!workflow) return;

    // Always ensure Finance Officer role exists for alternateRoleId
    await this.ensureFinanceOfficerRole();

    // Always ensure Finance PAYROLL_APPROVAL steps have alternateRoleId set
    // This runs regardless of step count (fixes bug: early return skipped this)
    const financeSteps = await prisma.approvalStep.findMany({
      where: {
        approvalWorkflowId: workflow.id,
        stageType: ApprovalStageTypeConst.PAYROLL_APPROVAL,
        requiredRoleId: 16,
        alternateRoleId: null,
      },
    });

    for (const step of financeSteps) {
      await prisma.approvalStep.update({
        where: { id: step.id },
        data: { alternateRoleId: 15 },
      });
      console.log(`[ApprovalWorkflow] Set alternateRoleId=15 on step ${step.id}`);
    }

    const payrollApprovalSteps = workflow.steps.filter(
      (s) => s.stageType === ApprovalStageTypeConst.PAYROLL_APPROVAL,
    );

    if (payrollApprovalSteps.length >= 2) return;

    let hrManagerRole = await prisma.appRole.findFirst({
      where: { name: { in: ["HR Manager", "HR_MANAGER", "hr_manager"] } },
    });
    if (!hrManagerRole) {
      const hrRole = await prisma.appRole.findFirst({
        where: { name: { in: ["HR", "hr", "HR Officer"] } },
      });
      hrManagerRole = await prisma.appRole.upsert({
        where: { id: 14 },
        create: { id: 14, name: "HR Manager", permissions: (hrRole?.permissions ?? null) as any },
        update: {},
      });
    }

    if (payrollApprovalSteps.length === 1) {
      const existingStep = payrollApprovalSteps[0];

      await prisma.approvalStep.update({
        where: { id: existingStep.id },
        data: { stepOrder: 2 },
      });

      await prisma.approvalStep.updateMany({
        where: { approvalWorkflowId: workflow.id, stageType: ApprovalStageTypeConst.PAYMENT_FILE },
        data: { stepOrder: 3 },
      });

      await prisma.approvalStep.updateMany({
        where: { approvalWorkflowId: workflow.id, stageType: ApprovalStageTypeConst.PAYROLL_DOCUMENT },
        data: { stepOrder: 0 },
      });

      await prisma.approvalStep.create({
        data: {
          approvalWorkflowId: workflow.id,
          stageType: ApprovalStageTypeConst.PAYROLL_APPROVAL,
          stepOrder: 1,
          requiredRoleId: hrManagerRole.id,
          isRequired: true,
        },
      });

      console.log(`[ApprovalWorkflow] Added HR Manager PAYROLL_APPROVAL step to workflow ${workflow.id}`);
    }
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

      // Find the Admin, Finance Manager, and HR Manager roles dynamically
      const adminRole = await prisma.appRole.findFirst({
        where: { name: { in: ["Admin", "admin", "ADMIN"] } },
      });
      let financeRole = await prisma.appRole.findFirst({
        where: { name: { in: ["Finance Manager", "finance_manager", "FINANCE_MANAGER"] } },
      });
      if (!financeRole) {
        const adminRole = await prisma.appRole.findFirst({
          where: { name: { in: ["Admin", "admin", "ADMIN"] } },
        });
        financeRole = await prisma.appRole.upsert({
          where: { id: 16 },
          create: {
            id: 16,
            name: "Finance Manager",
            permissions: (adminRole?.permissions ?? null) as any,
          },
          update: {},
        });
      }

      let hrManagerRole = await prisma.appRole.findFirst({
        where: { name: { in: ["HR Manager", "HR_MANAGER", "hr_manager"] } },
      });
      if (!hrManagerRole) {
        const hrRole = await prisma.appRole.findFirst({
          where: { name: { in: ["HR", "hr", "HR Officer"] } },
        });
        hrManagerRole = await prisma.appRole.upsert({
          where: { id: 14 },
          create: {
            id: 14,
            name: "HR Manager",
            permissions: (hrRole?.permissions ?? null) as any,
          },
          update: {},
        });
      }

      const adminRoleId = adminRole?.id ?? 6; // fallback
      const financeRoleId = financeRole.id; // guaranteed non-null after upsert
      const hrManagerRoleId = hrManagerRole.id; // guaranteed non-null after upsert

      // Ensure Finance Officer role exists
      await this.ensureFinanceOfficerRole();

      await prisma.approvalStep.createMany({
        data: [
          {
            approvalWorkflowId: workflow.id,
            stageType: ApprovalStageTypeConst.PAYROLL_DOCUMENT,
            stepOrder: 0,
            requiredRoleId: hrManagerRoleId,
            isRequired: true,
          },
          {
            approvalWorkflowId: workflow.id,
            stageType: ApprovalStageTypeConst.PAYROLL_APPROVAL,
            stepOrder: 1,
            requiredRoleId: hrManagerRoleId,
            isRequired: true,
          },
          {
            approvalWorkflowId: workflow.id,
            stageType: ApprovalStageTypeConst.PAYROLL_APPROVAL,
            stepOrder: 2,
            requiredRoleId: financeRoleId,
            alternateRoleId: 15,
            isRequired: true,
          },
          {
            approvalWorkflowId: workflow.id,
            stageType: ApprovalStageTypeConst.PAYMENT_FILE,
            stepOrder: 3,
            requiredRoleId: financeRoleId,
            isRequired: true,
          },
        ],
      });

      console.log(`[ApprovalWorkflow] Seeded default workflow for company ${companyId}`);

      // Re-fetch with steps
      workflow = await prisma.approvalWorkflow.findUnique({
        where: { id: workflow.id },
        include: {
          steps: {
            orderBy: { stepOrder: "asc" },
            include: { requiredRole: true, alternateRole: true },
          },
        },
      }) as any;
    } else {
      // ── Upgrade existing workflows that are missing PAYROLL_DOCUMENT steps ──
      await this.ensurePayrollDocStep(companyId);
      await this.ensurePayrollApprovalSteps(companyId);

      // Re-fetch after potential upgrade
      workflow = await prisma.approvalWorkflow.findFirst({
        where: { companyId, isActive: true },
        include: {
          steps: {
            orderBy: { stepOrder: "asc" },
            include: { requiredRole: true, alternateRole: true },
          },
        },
      }) as any;
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
    const resolvedStageType =
      stageType === ApprovalStageTypeConst.ATTENDANCE
        ? ApprovalStageTypeConst.PAYROLL_DOCUMENT
        : stageType;

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
            referenceType: referenceType as any,
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

        return request;
      }

      // ── Single-run submission (legacy / per-batch) ──
      const request = await tx.approvalRequest.create({
        data: {
          stageType: resolvedStageType,
          referenceType: referenceType as any,
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

      return request;
    });

    // ── Notification hooks ──
    if (attendanceImportId && referenceType === "ATTENDANCE_IMPORT") {
      try {
        const hrManagerRole = await prisma.appRole.findFirst({
          where: { name: { in: ["HR Manager", "HR_MANAGER", "hr_manager"] } },
        });
        if (hrManagerRole) {
          const hrManagers = await prisma.appUser.findMany({
            where: { roleId: hrManagerRole.id },
          });
          for (const mgr of hrManagers) {
            await attendanceNotificationService.createNotification({
              recipientId: mgr.id,
              type: "ATTENDANCE_SUBMITTED" as any,
              title: "Attendance Submitted for Approval",
              message: `Attendance import has been submitted for your approval.`,
              attendanceImportId,
            });
          }
        }
      } catch (err) {
        console.error("[ApprovalWorkflow] Failed to send submit notification:", err);
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
    // Ensure the workflow has PAYROLL_DOCUMENT steps (safe to call even if not needed)
    await this.ensurePayrollDocStep(companyId);
    await this.ensurePayrollApprovalSteps(companyId);

    // Load workflow before the transaction so it's available in notification hooks
    // (The transaction only performs reads on the workflow, so this is safe.)
    const workflow = await prisma.approvalWorkflow.findFirst({
      where: { companyId, isActive: true },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
        },
      },
    });

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
          `Request is already ${request.status.toLowerCase()}. Only pending requests can be approved.`,
        );
      }

      if (!workflow) {
        throw new CustomError(
          httpStatus.BAD_REQUEST,
          "No active approval workflow configured for this company.",
        );
      }

      // Map stageType "ATTENDANCE" to "PAYROLL_DOCUMENT" dynamically
      const targetStageType = request.stageType === ApprovalStageTypeConst.ATTENDANCE
        ? ApprovalStageTypeConst.PAYROLL_DOCUMENT
        : request.stageType;

      // 3. Filter steps matching this request's stageType
      const relevantSteps = workflow.steps.filter(
        (s) => s.stageType === targetStageType,
      );

      if (relevantSteps.length === 0) {
        throw new CustomError(
          httpStatus.BAD_REQUEST,
          `No workflow steps configured for stage "${targetStageType}".`,
        );
      }

      // 4. Compute approved role IDs from existing actions
      const approvedRoleIds = new Set(
        request.approvalActions
          .filter((a) => a.action === "APPROVED")
          .map((a) => a.actor?.roleId)
          .filter((id): id is number => id != null),
      );

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

      console.log("[approveRequest DEBUG]", {
        requestId,
        approvedRoleIds: [...approvedRoleIds],
        currentStepRequiredRoleId: currentStep.requiredRoleId,
        currentStepAlternateRoleId: currentStep.alternateRoleId,
        userRoleId: user?.roleId,
        effectiveRoleId,
        jwtRoleName,
        actions: request.approvalActions.map(a => ({
          id: a.id,
          action: a.action,
          actorRoleId: (a.actor as any)?.roleId,
        })),
        relevantSteps: relevantSteps.map(s => ({
          id: s.id,
          stepOrder: s.stepOrder,
          requiredRoleId: s.requiredRoleId,
          alternateRoleId: s.alternateRoleId,
          isRequired: s.isRequired,
        })),
      });

      if (
        !effectiveRoleId ||
        (effectiveRoleId !== currentStep.requiredRoleId &&
         effectiveRoleId !== currentStep.alternateRoleId)
      ) {
        // Check if user is Admin/Super Admin with override capability
        const userRole = await tx.appRole.findUnique({
          where: { id: user?.roleId ?? (effectiveRoleId ?? 0) },
        });
        const isAdmin = userRole?.name && ["Admin", "Super Admin"].includes(userRole.name);

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
        await attendanceNotificationService.createNotification({
          recipientId: Number(result.requestedBy),
          type: "ATTENDANCE_APPROVED" as any,
          title: "Attendance Approved",
          message: "Your attendance submission has been approved.",
          attendanceImportId: result.attendanceImportId,
        });
      } catch (err) {
        console.error("[ApprovalWorkflow] Failed to send approve notification:", err);
      }
    }

    // ── Payroll approval notifications ──
    if (result?.stageType === ApprovalStageTypeConst.PAYROLL_APPROVAL && !result?.attendanceImportId) {
      try {
        const approvedRoleIds = new Set(
          result.approvalActions
            .filter((a: any) => a.action === "APPROVED")
            .map((a: any) => a.actor?.roleId)
            .filter((id: any): id is number => id != null),
        );

        if (!workflow) return;
        const relevantSteps = workflow.steps.filter(
          (s) => s.stageType === result!.stageType,
        );

        const allStepsDone = relevantSteps
          .filter((s) => s.isRequired)
          .every((s) => approvedRoleIds.has(s.requiredRoleId) || (s.alternateRoleId && approvedRoleIds.has(s.alternateRoleId)));

        if (allStepsDone) {
          await payrollNotificationService.createNotification({
            recipientId: Number(result.requestedBy),
            type: "PAYROLL_APPROVED",
            title: "Payroll Approved — Ready for Payment",
            message: "All approvals complete. Payroll is cleared for payment.",
            payrollRunId: result.payrollRunId ?? undefined,
          });
        } else {
          const financeRoleIds = [15, 16];
          for (const roleId of financeRoleIds) {
            const financeUsers = await prisma.appUser.findMany({
              where: { roleId },
              select: { id: true },
            });
            for (const user of financeUsers) {
              await payrollNotificationService.createNotification({
                recipientId: user.id,
                type: "PAYROLL_SUBMITTED",
                title: "Payroll Ready for Finance Review",
                message: "HR Manager has approved. Finance review and approval required.",
                payrollRunId: result.payrollRunId ?? undefined,
              });
            }
          }
        }
      } catch (err) {
        console.error("[ApprovalWorkflow] Failed to send payroll approval notifications:", err);
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
    // Ensure the workflow has PAYROLL_DOCUMENT steps (safe to call even if not needed)
    await this.ensurePayrollDocStep(companyId);
    await this.ensurePayrollApprovalSteps(companyId);

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

      // Map stageType "ATTENDANCE" to "PAYROLL_DOCUMENT" dynamically
      const targetStageType = request.stageType === ApprovalStageTypeConst.ATTENDANCE
        ? ApprovalStageTypeConst.PAYROLL_DOCUMENT
        : request.stageType;

      // 3. Verify the caller's role matches the current step (same logic as approve)
      const relevantSteps = workflow.steps.filter(
        (s) => s.stageType === targetStageType,
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
        const isAdmin = userRole?.name && ["Admin", "Super Admin"].includes(userRole.name);

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

      // 6. Reset PayrollRun to DRAFT (rejection always resets regardless of stage)
      if (request.payrollRunId) {
        await tx.payrollRun.update({
          where: { id: request.payrollRunId },
          data: { status: PayrollStatusConst.DRAFT },
        });

        // Also reset sibling runs in the same period that were submitted together
        if (request.stageType !== ApprovalStageTypeConst.PAYMENT_FILE) {
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
        await attendanceNotificationService.createNotification({
          recipientId: Number(result.requestedBy),
          type: "ATTENDANCE_REJECTED" as any,
          title: "Attendance Rejected",
          message: comment || "Your attendance submission has been rejected.",
          attendanceImportId: result.attendanceImportId,
          rejectionNote: comment || undefined,
        });
      } catch (err) {
        console.error("[ApprovalWorkflow] Failed to send reject notification:", err);
      }
    }

    // ── Payroll rejection notification ──
    if (result?.stageType === ApprovalStageTypeConst.PAYROLL_APPROVAL && !result?.attendanceImportId) {
      try {
        await payrollNotificationService.createNotification({
          recipientId: Number(result.requestedBy),
          type: "PAYROLL_REJECTED",
          title: "Payroll Approval Rejected",
          message: comment || "Your payroll submission has been rejected. Please correct and resubmit.",
          payrollRunId: result.payrollRunId ?? undefined,
        });
      } catch (err) {
        console.error("[ApprovalWorkflow] Failed to send payroll rejection notification:", err);
      }
    }

    return result;
  }
}

export const approvalWorkflowService = new ApprovalWorkflowService();
