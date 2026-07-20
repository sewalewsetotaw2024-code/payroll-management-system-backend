#!/usr/bin/env tsx
/**
 * Approval Role Validator — CLI
 * ───────────────────────────────
 * Run in CI or pre-deploy to verify every required approval role exists in the
 * AppRole table, and that no active workflow is stuck in a broken state.
 *
 * Usage:
 *   npx tsx src/scripts/validate-approval-roles.ts
 *
 * Exit codes:
 *   0 — everything OK
 *   1 — one or more roles missing and/or workflows in a broken state
 */

import { connectDatabase, disconnectDatabase } from "../config/database";
import logger from "../utils/logger";
import {
  validateApprovalRoleConfiguration,
  auditWorkflowConfiguration,
} from "../utils/approvalRoleValidator";

async function main() {
  await connectDatabase();

  let exitCode = 0;

  // ── 1. Role existence check ──────────────────────────────
  const roleResult = await validateApprovalRoleConfiguration();

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Approval Role Configuration Report");
  console.log("═══════════════════════════════════════════════════\n");

  for (const role of roleResult.roles) {
    const icon = role.found ? "  ✓" : "  ✗";
    const id = role.appRoleId != null ? ` (AppRole.id=${role.appRoleId})` : "";
    console.log(`${icon}  ${role.key.padEnd(20)} ${role.found ? "found" + id : "MISSING"}`);
  }

  if (roleResult.allFound) {
    console.log("\n  ✅ All approval roles are present.\n");
  } else {
    const missing = roleResult.roles.filter((r) => !r.found);
    console.log(`\n  ❌ ${missing.length} role(s) missing:\n`);
    for (const m of missing) {
      console.log(`     - ${m.key}  (aliases: ${m.aliases.join(", ")})`);
    }
    console.log(
      "\n  Action: Add a row to the AppRole table with one of the listed aliases",
    );
    console.log("  as the `name` before onboarding companies or deploying.\n");
    exitCode = 1;
  }

  // ── 2. Workflow audit ────────────────────────────────────
  const audit = await auditWorkflowConfiguration();

  if (audit.length > 0) {
    console.log("\n───────────────────────────────────────────────");
    console.log("  Active Workflow Health Report");
    console.log("───────────────────────────────────────────────\n");

    let hasIssues = false;

    for (const wf of audit) {
      const issues: string[] = [];
      if (wf.stepCount === 0) issues.push("zero steps (seed skipped)");
      if (wf.missingStageTypes.length > 0)
        issues.push(`missing stage types: ${wf.missingStageTypes.join(", ")}`);
      if (wf.stuckMigration)
        issues.push(`stuck at schemaVersion ${wf.schemaVersion}`);

      if (issues.length > 0) {
        hasIssues = true;
        console.log(`  ⚠  Workflow ${wf.workflowId} (company ${wf.companyId}):`);
        for (const issue of issues) {
          console.log(`       - ${issue}`);
        }
        if (wf.blockingMissingRoles.length > 0) {
          console.log(
            `       Blocked by missing roles: ${wf.blockingMissingRoles.join(", ")}`,
          );
        }
        console.log("");
      } else {
        console.log(`  ✓  Workflow ${wf.workflowId} (company ${wf.companyId}): healthy`);
        console.log(
          `       ${wf.stepCount} steps, schemaVersion ${wf.schemaVersion}\n`,
        );
      }
    }

    if (hasIssues) {
      exitCode = 1;
    }
  } else {
    console.log("\n  (No active workflows found)\n");
  }

  console.log("═══════════════════════════════════════════════════\n");

  await disconnectDatabase();
  process.exit(exitCode);
}

main().catch(async (err) => {
  logger.error({ err }, "[validate-approval-roles] Fatal error");
  await disconnectDatabase();
  process.exit(1);
});
