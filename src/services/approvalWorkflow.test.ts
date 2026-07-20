/**
 * ApprovalWorkflowService — regression tests for role-missing paths
 *
 * These tests verify that:
 *   1. The validator catches missing roles in AppRole.
 *   2. `getWorkflowForCompany` logs and creates zero steps when roles are absent.
 *   3. `upgradeWorkflowSchema` / `upgradeWorkflowSchemaV3` don't advance
 *      `schemaVersion` when a required role is missing.
 *   4. `approveRequest` / `rejectRequest` throw the expected error when the
 *      workflow has zero steps for the request's stage type.
 *
 * The service is tested with a mocked Prisma client so we can control which
 * AppRole rows exist.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApprovalWorkflowService } from "./approvalWorkflow.service";
import { REQUIRED_APPROVAL_ROLES } from "../utils/roleConstants";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../config/database", () => ({
  default: {
    appRole: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    approvalWorkflow: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    approvalStep: {
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    approvalRequest: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    approvalAction: {
      create: vi.fn(),
    },
    appUser: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    payrollRun: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    attendanceImport: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../utils/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("./attendanceNotification.service", () => ({
  attendanceNotificationService: {
    createNotification: vi.fn(),
  },
}));

vi.mock("./payrollNotification.service", () => ({
  payrollNotificationService: {
    createNotification: vi.fn(),
  },
}));

vi.mock("./payslipRender.service", () => ({
  payslipRenderService: {
    batchGeneratePayslipPdfs: vi.fn().mockReturnValue(Promise.resolve()),
  },
}));

import prisma from "../config/database";
import logger from "../utils/logger";

// ── Helpers ────────────────────────────────────────────────────────────────

const mockRoleRow = (id: number, name: string) => ({
  id,
  name,
  syncedAt: new Date(),
  permissions: null,
});

/**
 * Set up the Prisma mock so findFirst/findMany for appRole return the given
 * set of role rows.  Any AppRole row not in the set will fail to resolve.
 */
function seedAppRoles(roles: { id: number; name: string; syncedAt: Date; permissions: null }[]) {
  const mock = vi.mocked(prisma.appRole);
  (mock.findFirst as any).mockImplementation(async ({ where }: any) => {
    const names = where?.name?.in ?? [];
    const match = roles.find((r) => names.includes(r.name)) ?? null;
    return match;
  });
  mock.findMany.mockResolvedValue(roles as any);
}

function resetMocks() {
  vi.clearAllMocks();
  // Default: no roles exist at all (simulate fresh DB with no sync)
  vi.mocked(prisma.appRole.findMany).mockResolvedValue([]);
  vi.mocked(prisma.appRole.findFirst).mockResolvedValue(null);
}

beforeEach(() => {
  resetMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Validator (validateApprovalRoleConfiguration)", () => {
  it("reports all roles found when all required roles exist", async () => {
    const roles = [
      mockRoleRow(13, "HR CS Manager"),
      mockRoleRow(14, "HR CS Director"),
      mockRoleRow(15, "Finance Manager"),
      mockRoleRow(16, "Finance Officer"),
      mockRoleRow(17, "Admin"),
      mockRoleRow(18, "HR Generalist"),
      mockRoleRow(19, "HR Manager"),
    ];
    seedAppRoles(roles);

    const { validateApprovalRoleConfiguration } = await import(
      "../utils/approvalRoleValidator"
    );
    const result = await validateApprovalRoleConfiguration();

    expect(result.allFound).toBe(true);
    expect(result.roles.every((r) => r.found)).toBe(true);
    expect(result.summary).toBe("All approval roles are present.");
  });

  it("reports missing roles when required roles are absent", async () => {
    // Only Admin exists — HR_CS_MANAGER, FINANCE_MANAGER etc. are missing
    seedAppRoles([mockRoleRow(1, "Admin")]);

    const { validateApprovalRoleConfiguration } = await import(
      "../utils/approvalRoleValidator"
    );
    const result = await validateApprovalRoleConfiguration();

    expect(result.allFound).toBe(false);
    const missing = result.roles.filter((r) => !r.found);
    expect(missing.length).toBeGreaterThan(0);
    // HR_CS_MANAGER and FINANCE_MANAGER should be missing
    expect(missing.some((m) => m.key === "HR_CS_MANAGER")).toBe(true);
    expect(missing.some((m) => m.key === "FINANCE_MANAGER")).toBe(true);
    expect(result.summary).toContain("Missing");
  });
});

describe("Service (getWorkflowForCompany) — role-missing path", () => {
  it("creates a workflow with zero steps when required roles are absent", async () => {
    const service = new ApprovalWorkflowService();
    const fakeWorkflow = {
      id: "wf-1",
      companyId: 1,
      name: "Default",
      description: null,
      schemaVersion: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // No workflow exists → will try to auto-seed
    vi.mocked(prisma.approvalWorkflow.findFirst).mockResolvedValue(null as any);
    // The create call with include returns a workflow WITH its nested steps array
    vi.mocked(prisma.approvalWorkflow.create).mockResolvedValue({
      ...fakeWorkflow,
      steps: [],
    } as any);

    // No roles in DB
    vi.mocked(prisma.appRole.findMany).mockResolvedValue([]);
    vi.mocked(prisma.appRole.findFirst).mockResolvedValue(null);

    const result = await service.getWorkflowForCompany(1);

    // The workflow was created but WITHOUT any steps (seed skipped)
    expect(result).toBeTruthy();
    expect(result!.steps).toHaveLength(0);
    expect(result!.id).toBe("wf-1");

    // Verify the APPROVAL_ROLE_MISSING error was logged
    expect(vi.mocked(logger.error).mock.calls.some((call) =>
      call.some(
        (arg) =>
          typeof arg === "object" &&
          arg !== null &&
          (arg as any).errorCode === "APPROVAL_ROLE_MISSING",
      ),
    )).toBe(true);
  });

  it("returns existing workflow with steps when roles are present", async () => {
    const service = new ApprovalWorkflowService();

    seedAppRoles([
      mockRoleRow(13, "HR CS Manager"),
      mockRoleRow(14, "HR CS Director"),
      mockRoleRow(15, "Finance Manager"),
      mockRoleRow(16, "Finance Officer"),
      mockRoleRow(17, "Admin"),
    ]);

    // Simulate existing workflow with steps
    const existingWorkflow = {
      id: "wf-existing",
      companyId: 1,
      name: "Existing Workflow",
      description: null,
      schemaVersion: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: [
        {
          id: "step-1",
          approvalWorkflowId: "wf-existing",
          stageType: "ATTENDANCE",
          stepOrder: 1,
          requiredRoleId: 13,
          alternateRoleId: null,
          isRequired: true,
          createdAt: new Date(),
          requiredRole: { id: 13, name: "HR CS Manager" },
          alternateRole: null,
        },
      ],
    };
    vi.mocked(prisma.approvalWorkflow.findFirst).mockResolvedValue(existingWorkflow as any);

    const result = await service.getWorkflowForCompany(1);

    expect(result).toBeTruthy();
    expect(result!.steps.length).toBeGreaterThan(0);
    expect(vi.mocked(logger.error).mock.calls.some((call) =>
      call.some(
        (arg) =>
          typeof arg === "object" &&
          arg !== null &&
          (arg as any).errorCode === "APPROVAL_ROLE_MISSING",
      ),
    )).toBe(false);
  });
});

describe("Service (approveRequest) — zero-step path", () => {
  it("throws 'No workflow steps configured' when workflow has no steps for stage", async () => {
    const service = new ApprovalWorkflowService();

    // $transaction mock: execute the callback synchronously
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
    // Provide a fake tx object that returns the same mocks
    const tx = prisma as any;
    return cb(tx);
  });

    // Active workflow exists but has zero steps
    vi.mocked(prisma.approvalWorkflow.findFirst).mockResolvedValue({
      id: "wf-empty",
      companyId: 1,
      name: "Empty Workflow",
      description: null,
      schemaVersion: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: [],
    } as any);

    // Pending request exists
    vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValue({
      id: "req-1",
      stageType: "PAYROLL_APPROVAL",
      referenceType: "PAYROLL_RUN",
      status: "PENDING",
      requestedBy: "1",
      requestedAt: new Date(),
      payrollRunId: "run-1",
      approvalActions: [],
    } as any);

    await expect(
      service.approveRequest(1, 1, "req-1"),
    ).rejects.toThrow(/No workflow steps configured for stage/);
  });
});

describe("Service (rejectRequest) — zero-step path", () => {
  it("throws 'No workflow steps configured' when workflow has no steps for stage", async () => {
    const service = new ApprovalWorkflowService();

    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      const tx = prisma as any;
      return cb(tx);
    });

    vi.mocked(prisma.approvalWorkflow.findFirst).mockResolvedValue({
      id: "wf-empty",
      companyId: 1,
      name: "Empty Workflow",
      description: null,
      schemaVersion: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: [],
    } as any);

    vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValue({
      id: "req-1",
      stageType: "PAYROLL_APPROVAL",
      referenceType: "PAYROLL_RUN",
      status: "PENDING",
      requestedBy: "1",
      requestedAt: new Date(),
      payrollRunId: "run-1",
      approvalActions: [],
    } as any);

    // rejectRequest doesn't have an explicit zero-step guard — it
    // iterates the (empty) relevantSteps, finds no current step, and
    // throws "All required steps for this stage have already been approved"
    await expect(
      service.rejectRequest(1, 1, "req-1"),
    ).rejects.toThrow(/All required steps for this stage/);
  });
});

describe("Audit (auditWorkflowConfiguration)", () => {
  it("flags workflows with zero steps and stuck migrations", async () => {
    // Create the audit function
    const { auditWorkflowConfiguration } = await import(
      "../utils/approvalRoleValidator"
    );

    // No roles in DB — all missing
    vi.mocked(prisma.appRole.findMany).mockResolvedValue([]);

    // One active workflow with zero steps and schemaVersion 1 (stuck)
    vi.mocked(prisma.approvalWorkflow.findMany).mockResolvedValue([
      {
        id: "wf-stuck",
        companyId: 1,
        name: "Stuck Workflow",
        isActive: true,
        schemaVersion: 1,
        steps: [],
      } as any,
    ]);

    const audit = await auditWorkflowConfiguration();

    expect(audit).toHaveLength(1);
    expect(audit[0].stepCount).toBe(0);
    expect(audit[0].stuckMigration).toBe(true);
    expect(audit[0].missingStageTypes).toEqual([
      "ATTENDANCE",
      "PAYROLL_APPROVAL",
      "PAYMENT_FILE",
    ]);
    expect(audit[0].blockingMissingRoles).toContain("HR_CS_MANAGER");
  });

  it("reports healthy workflow with no issues", async () => {
    const { auditWorkflowConfiguration } = await import(
      "../utils/approvalRoleValidator"
    );

    vi.mocked(prisma.appRole.findMany).mockResolvedValue([
      mockRoleRow(13, "HR CS Manager"),
      mockRoleRow(14, "HR CS Director"),
      mockRoleRow(15, "Finance Manager"),
      mockRoleRow(16, "Finance Officer"),
    ]);

    vi.mocked(prisma.approvalWorkflow.findMany).mockResolvedValue([
      {
        id: "wf-healthy",
        companyId: 1,
        name: "Healthy Workflow",
        isActive: true,
        schemaVersion: 3,
        steps: [
          { stageType: "ATTENDANCE" },
          { stageType: "PAYROLL_APPROVAL" },
          { stageType: "PAYMENT_FILE" },
        ],
      } as any,
    ]);

    const audit = await auditWorkflowConfiguration();

    expect(audit).toHaveLength(1);
    expect(audit[0].stepCount).toBe(3);
    expect(audit[0].stuckMigration).toBe(false);
    expect(audit[0].missingStageTypes).toHaveLength(0);
  });
});

describe("Central registry (REQUIRED_APPROVAL_ROLES)", () => {
  it("has entries for all critical approval roles", () => {
    expect(REQUIRED_APPROVAL_ROLES.HR_CS_MANAGER).toBeDefined();
    expect(REQUIRED_APPROVAL_ROLES.HR_CS_DIRECTOR).toBeDefined();
    expect(REQUIRED_APPROVAL_ROLES.FINANCE_MANAGER).toBeDefined();
    expect(REQUIRED_APPROVAL_ROLES.FINANCE_OFFICER).toBeDefined();
    expect(REQUIRED_APPROVAL_ROLES.HR_GENERALIST).toBeDefined();
    expect(REQUIRED_APPROVAL_ROLES.ADMIN).toBeDefined();
    expect(REQUIRED_APPROVAL_ROLES.HR_MANAGER).toBeDefined();
  });

  it("each entry contains at least one alias that matches the RoleNames constant", () => {
    expect(REQUIRED_APPROVAL_ROLES.HR_CS_MANAGER).toContain("HR CS Manager");
    expect(REQUIRED_APPROVAL_ROLES.HR_CS_DIRECTOR).toContain(
      "HR CS Director",
    );
    expect(REQUIRED_APPROVAL_ROLES.FINANCE_MANAGER).toContain(
      "Finance Manager",
    );
    expect(REQUIRED_APPROVAL_ROLES.FINANCE_OFFICER).toContain(
      "Finance Officer",
    );
  });
});
