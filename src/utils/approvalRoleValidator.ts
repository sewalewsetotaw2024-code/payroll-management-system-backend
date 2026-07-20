/**
 * Approval Role Configuration Validator
 * ─────────────────────────────────────
 * Detects missing approval roles before they cause silent step-skipping or
 * stuck migrations.  Can be run on app boot, as a CLI script, or exposed as
 * an admin endpoint.
 *
 * Roles are global in the payroll backend's `AppRole` table (no companyId),
 * so a single global check is sufficient.
 *
 * @see REQUIRED_APPROVAL_ROLES in ./roleConstants.ts
 */

import prisma from "../config/database";
import logger from "./logger";
import { REQUIRED_APPROVAL_ROLES, CRITICAL_APPROVAL_ROLES } from "./roleConstants";

export interface RoleValidationResult {
  /** Every role in REQUIRED_APPROVAL_ROLES and whether it resolved. */
  roles: { key: string; aliases: string[]; found: boolean; appRoleId: number | null }[];
  /** True when every role resolved to at least one AppRole row. */
  allFound: boolean;
  /** Human-readable summary. */
  summary: string;
}

export interface WorkflowAuditEntry {
  workflowId: string;
  companyId: number;
  name: string;
  isActive: boolean;
  schemaVersion: number;
  stepCount: number;
  missingStageTypes: string[];
  stuckMigration: boolean;
  blockingMissingRoles: string[];
}

/**
 * Check every approval-related role alias against the AppRole table and report
 * which ones are missing.
 *
 * Roles are global in the payroll backend (no company scoping), so this runs
 * once across the entire AppRole table.
 */
export async function validateApprovalRoleConfiguration(): Promise<RoleValidationResult> {
  const allRows = await prisma.appRole.findMany({ select: { id: true, name: true } });
  const allNames = new Set(allRows.map((r) => r.name));

  const roles = Object.entries(REQUIRED_APPROVAL_ROLES).map(([key, aliases]) => {
    const match = allRows.find((r) => aliases.includes(r.name));
    return {
      key,
      aliases,
      found: match != null,
      appRoleId: match?.id ?? null,
    };
  });

  const allFound = roles.every((r) => r.found);

  const missing = roles.filter((r) => !r.found);
  const summary = allFound
    ? "All approval roles are present."
    : `Missing ${missing.length} approval role(s): ${missing.map((m) => m.key).join(", ")}`;

  return { roles, allFound, summary };
}

/**
 * Audit all active workflows for stuck migrations, zero-step states, or
 * missing stage types.  Returns an array of workflow-level issues.
 */
export async function auditWorkflowConfiguration(): Promise<WorkflowAuditEntry[]> {
  // Resolve required role IDs from the DB
  const allRoles = await prisma.appRole.findMany({ select: { id: true, name: true } });
  const roleResolutions = Object.entries(REQUIRED_APPROVAL_ROLES).map(([key, aliases]) => {
    const match = allRoles.find((r) => aliases.includes(r.name));
    return { key, appRoleId: match?.id ?? null };
  });

  const requiredStageTypes = ["ATTENDANCE", "PAYROLL_APPROVAL", "PAYMENT_FILE"];

  const workflows = await prisma.approvalWorkflow.findMany({
    where: { isActive: true },
    include: {
      steps: {
        select: { stageType: true },
      },
    },
  });

  const entries: WorkflowAuditEntry[] = workflows.map((wf) => {
    const stepStageTypes = new Set(wf.steps.map((s) => s.stageType));
    const missingStageTypes = requiredStageTypes.filter((st) => !stepStageTypes.has(st as any));

    const stuckMigration = wf.schemaVersion < 3;

    // Determine which roles are blocking the migration
    const blockingMissingRoles = roleResolutions
      .filter((r) => r.appRoleId == null && CRITICAL_APPROVAL_ROLES.includes(r.key as any))
      .map((r) => r.key);

    return {
      workflowId: wf.id,
      companyId: wf.companyId,
      name: wf.name,
      isActive: wf.isActive,
      schemaVersion: wf.schemaVersion,
      stepCount: wf.steps.length,
      missingStageTypes,
      stuckMigration,
      blockingMissingRoles,
    };
  });

  return entries;
}

/**
 * Log missing roles as structured errors tagged with `APPROVAL_ROLE_MISSING`.
 * Returns `true` if everything is OK, `false` if any role is missing.
 */
export async function logApprovalRoleHealth(): Promise<boolean> {
  const result = await validateApprovalRoleConfiguration();

  if (result.allFound) {
    logger.info("[APPROVAL_ROLE_OK] All approval roles resolved in AppRole table.");
    return true;
  }

  for (const role of result.roles) {
    if (!role.found) {
      logger.error(
        {
          errorCode: "APPROVAL_ROLE_MISSING",
          roleKey: role.key,
          aliases: role.aliases,
        },
        `[APPROVAL_ROLE_MISSING] Role "${role.key}" (aliases: ${role.aliases.join(", ")}) not found in AppRole table. ` +
        "Workflow seeding / migrations that depend on this role will silently skip. " +
        "Add a matching row to the AppRole table before onboarding companies.",
      );
    }
  }

  // Audit workflows for stuck states
  const audit = await auditWorkflowConfiguration();
  for (const wf of audit) {
    if (wf.missingStageTypes.length > 0) {
      logger.error(
        {
          errorCode: "APPROVAL_STAGE_MISSING",
          workflowId: wf.workflowId,
          companyId: wf.companyId,
          schemaVersion: wf.schemaVersion,
          stepCount: wf.stepCount,
          missingStageTypes: wf.missingStageTypes,
        },
        `[APPROVAL_STAGE_MISSING] Workflow ${wf.workflowId} (company ${wf.companyId}) is missing stage types: ${wf.missingStageTypes.join(", ")}. ` +
        "This will cause approval/rejection requests to fail at runtime.",
      );
    }
    if (wf.stuckMigration) {
      logger.error(
        {
          errorCode: "APPROVAL_MIGRATION_STUCK",
          workflowId: wf.workflowId,
          companyId: wf.companyId,
          schemaVersion: wf.schemaVersion,
          blockingMissingRoles: wf.blockingMissingRoles,
        },
        `[APPROVAL_MIGRATION_STUCK] Workflow ${wf.workflowId} (company ${wf.companyId}) is stuck at schemaVersion ${wf.schemaVersion}. ` +
        `Blocked by missing roles: ${wf.blockingMissingRoles.join(", ") || "unknown"}.`,
      );
    }
  }

  return false;
}
