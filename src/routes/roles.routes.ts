import { Router, Request, Response } from "express";
import { PrismaClient } from "../generated/prisma";
import { DEFAULT_PERMISSIONS, roleKey, VALID_PERMISSION_KEYS } from "../utils/roleConstants";
import { authenticate as protect } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/roleGuard";

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /roles
 * Returns all available roles from the AppRole table for the workflow builder.
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const roles = await prisma.appRole.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, permissions: true },
    });

    // Enrich roles with a permissions fallback for ones that haven't been seeded yet
    const enriched = roles.map((r) => ({
      ...r,
      // If the DB has permissions, use them; otherwise fall back to defaults
      permissions:
        r.permissions ?? DEFAULT_PERMISSIONS[roleKey(r.name)] ?? null,
    }));

    res.json({ status: "success", data: enriched });
  } catch (err: any) {
    console.error("[Roles] Failed to fetch roles:", err);
    res.status(500).json({ status: "error", message: "Failed to fetch roles" });
  }
});

/**
 * GET /roles/permissions
 * Returns a map of role-name-keys → permission capabilities.
 * The frontend uses this to replace the static ROLE_PERMISSIONS object.
 * Example: { "HR_MANAGER": { canActivateImport: false, ... }, "ADMIN": { ... } }
 */
router.get("/permissions", async (_req: Request, res: Response) => {
  try {
    const roles = await prisma.appRole.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, permissions: true },
    });

    const permissionsMap: Record<string, any> = {};
    for (const role of roles) {
      if (role.permissions) {
        permissionsMap[roleKey(role.name)] = role.permissions;
      }
    }

    // Merge in any defaults for roles not yet configured in the DB
    for (const [key, perms] of Object.entries(DEFAULT_PERMISSIONS)) {
      if (!permissionsMap[key]) {
        permissionsMap[key] = perms;
      }
    }

    res.json({ status: "success", data: permissionsMap });
  } catch (err: any) {
    console.error("[Roles] Failed to fetch role permissions:", err);
    res.status(500).json({ status: "error", message: "Failed to fetch role permissions" });
  }
});

/**
 * PATCH /roles/:roleId/permissions
 * Updates the permissions JSON for a specific role.
 * Body should be a partial permissions object, e.g. { "canActivateImport": true }.
 * Only known permission keys are accepted; unknown keys are silently ignored.
 */
router.patch("/:roleId/permissions", protect, requireAdmin, async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.roleId, 10);
    if (isNaN(roleId)) {
      res.status(400).json({ status: "error", message: "Invalid role ID" });
      return;
    }

    // Verify the role exists
    const existing = await prisma.appRole.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, permissions: true },
    });

    if (!existing) {
      res.status(404).json({ status: "error", message: "Role not found" });
      return;
    }

    // Validate body: must be an object
    if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
      res.status(400).json({
        status: "error",
        message: "Request body must be a JSON object of permission key → boolean pairs",
      });
      return;
    }

    // Filter to only valid permission keys and boolean values
    const updates: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (VALID_PERMISSION_KEYS.includes(key) && typeof value === "boolean") {
        updates[key] = value;
      }
    }

    // Merge updates into existing permissions
    const mergedPermissions = {
      ...((existing.permissions as Record<string, boolean> | null) ?? {}),
      ...updates,
    };

    await prisma.appRole.update({
      where: { id: roleId },
      data: { permissions: mergedPermissions },
    });

    console.log(`[Roles] Updated permissions for role "${existing.name}" (${roleId}):`, updates);

    res.json({
      status: "success",
      data: {
        id: roleId,
        name: existing.name,
        permissions: mergedPermissions,
      },
      message: `Permissions updated for role "${existing.name}"`,
    });
  } catch (err: any) {
    console.error("[Roles] Failed to update permissions:", err);
    res.status(500).json({ status: "error", message: "Failed to update permissions" });
  }
});

/**
 * GET /roles/labels
 * Returns a map of role-name-keys → display labels.
 * The frontend uses this to replace the static ROLE_LABELS object.
 * Example: { "HR_MANAGER": "HR Manager", "FINANCE_MANAGER": "Finance Manager" }
 */
router.get("/labels", async (_req: Request, res: Response) => {
  try {
    const roles = await prisma.appRole.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    const labelsMap: Record<string, string> = {};
    for (const role of roles) {
      labelsMap[roleKey(role.name)] = role.name;
    }

    res.json({ status: "success", data: labelsMap });
  } catch (err: any) {
    console.error("[Roles] Failed to fetch role labels:", err);
    res.status(500).json({ status: "error", message: "Failed to fetch role labels" });
  }
});

export default router;
