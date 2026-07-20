import { Router, Request, Response } from "express";
import { PrismaClient } from "../generated/prisma";
import { DEFAULT_PERMISSIONS, roleKey, VALID_PERMISSION_KEYS } from "../utils/roleConstants";
import { authenticate as protect } from "../middlewares/auth";
import { requireStrictAdmin } from "../middlewares/roleGuard";

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
router.patch("/:roleId/permissions", protect, requireStrictAdmin, async (req: Request, res: Response) => {
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

/**
 * DELETE /roles/:roleId/users/:userId
 * Remove a user from a role by setting their roleId to null.
 */
router.delete("/:roleId/users/:userId", protect, requireStrictAdmin, async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.roleId, 10);
    const userId = parseInt(req.params.userId, 10);

    if (isNaN(roleId) || isNaN(userId)) {
      res.status(400).json({ status: "error", message: "Invalid role ID or user ID" });
      return;
    }

    const appUser = await prisma.appUser.findUnique({
      where: { id: userId },
      include: { role: { select: { name: true } } },
    });

    if (!appUser) {
      res.status(404).json({ status: "error", message: "AppUser not found" });
      return;
    }

    if (appUser.roleId !== roleId) {
      res.status(400).json({
        status: "error",
        message: `User is not assigned to role ID ${roleId}`,
      });
      return;
    }

    await prisma.appUser.update({
      where: { id: userId },
      data: { roleId: null },
    });

    res.json({
      status: "success",
      message: `User ${userId} removed from role "${appUser.role?.name ?? roleId}"`,
    });
  } catch (err: any) {
    console.error("[Roles] Failed to remove user from role:", err);
    res.status(500).json({ status: "error", message: "Failed to remove user from role" });
  }
});

/**
 * POST /roles/:roleId/users
 * Assign an employee to a role. Body: { employeeId: string }
 * Creates or updates the AppUser entry for the employee's userId.
 */
router.post("/:roleId/users", protect, requireStrictAdmin, async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.roleId, 10);
    if (isNaN(roleId)) {
      res.status(400).json({ status: "error", message: "Invalid role ID" });
      return;
    }

    const { employeeId } = req.body;
    if (!employeeId) {
      res.status(400).json({ status: "error", message: "employeeId is required" });
      return;
    }

    // Verify role exists FIRST (data integrity — no FK constraint on AppRole)
    const role = await prisma.appRole.findUnique({
      where: { id: roleId },
      select: { id: true, name: true },
    });
    if (!role) {
      res.status(404).json({ status: "error", message: "Role not found" });
      return;
    }

    // Find the employee
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, userId: true, firstName: true, lastName: true, externalId: true },
    });

    if (!employee) {
      res.status(404).json({ status: "error", message: "Employee not found" });
      return;
    }

    // Determine the AppUser ID — create one if the employee has none yet
    let appUserId = employee.userId;

    if (!appUserId) {
      // Auto-create an AppUser for this employee
      const maxId = await prisma.appUser.aggregate({ _max: { id: true } });
      appUserId = (maxId._max.id ?? 0) + 1;

      await prisma.appUser.create({
        data: {
          id: appUserId,
          roleId,
          status: "ACTIVE",
        },
      });

      // Link the employee to the newly created AppUser
      await prisma.employee.update({
        where: { id: employee.id },
        data: { userId: appUserId },
      });

      console.log(`[Roles] Created AppUser ${appUserId} for employee "${employee.firstName} ${employee.lastName}" and assigned to role "${role.name}"`);
    } else {
      // Upsert the AppUser entry (existing user)
      await prisma.appUser.upsert({
        where: { id: appUserId },
        update: { roleId },
        create: {
          id: appUserId,
          roleId,
          status: "ACTIVE",
        },
      });
    }

    // Fetch the final AppUser with role info
    const appUser = await prisma.appUser.findUnique({
      where: { id: appUserId },
      include: { role: { select: { id: true, name: true } } },
    });

    if (!appUser) {
      res.status(500).json({ status: "error", message: "Failed to create AppUser" });
      return;
    }

    res.json({
      status: "success",
      data: {
        id: appUser.id,
        email: appUser.email,
        status: appUser.status,
        role,
        employee: {
          id: employee.id,
          externalId: employee.externalId ?? employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
        },
      },
      message: `User assigned to role "${role.name}"`,
    });
  } catch (err: any) {
    console.error("[Roles] Failed to assign user to role:", err);
    res.status(500).json({ status: "error", message: "Failed to assign user to role" });
  }
});

/**
 * GET /roles/employees/unassigned
 * Returns employees available to assign to a role.
 * Optional ?excludeRoleId=N — excludes employees already assigned to that specific role.
 * Without excludeRoleId: returns employees with no role at all.
 */
router.get("/employees/unassigned", protect, async (req: Request, res: Response) => {
  try {
    const excludeRoleId = req.query.excludeRoleId
      ? parseInt(req.query.excludeRoleId as string, 10)
      : null;

    if (excludeRoleId != null && isNaN(excludeRoleId)) {
      res.status(400).json({ status: "error", message: "Invalid excludeRoleId" });
      return;
    }

    if (excludeRoleId != null) {
      // ── Role-aware mode: return employees NOT already in this role ──
      const usersInRole = await prisma.appUser.findMany({
        where: { roleId: excludeRoleId },
        select: { id: true },
      });
      const userIdsInRole = new Set(usersInRole.map((u) => u.id));

      // Include employees with no userId (no AppUser yet) OR not in this role
      const employees = await prisma.employee.findMany({
        where: userIdsInRole.size > 0
          ? {
              OR: [
                { userId: null },
                { userId: { notIn: [...userIdsInRole] } },
              ],
            }
          : {}, // No one in this role → return all employees
        select: {
          id: true,
          externalId: true,
          firstName: true,
          lastName: true,
          userId: true,
        },
        orderBy: { firstName: "asc" },
        take: 200,
      });

      res.json({ status: "success", data: employees });
      return;
    }

    // ── Legacy mode: return employees with no role at all ──
    const appUsersWithRole = await prisma.appUser.findMany({
      where: { roleId: { not: null } },
      select: { id: true },
    });
    const assignedUserIds = new Set(appUsersWithRole.map((u) => u.id));

    const employees = await prisma.employee.findMany({
      where: assignedUserIds.size > 0
        ? {
            OR: [
              { userId: null },
              { userId: { notIn: [...assignedUserIds] } },
            ],
          }
        : {}, // No assigned users → return all employees
      select: {
        id: true,
        externalId: true,
        firstName: true,
        lastName: true,
        userId: true,
      },
      orderBy: { firstName: "asc" },
      take: 200,
    });

    res.json({ status: "success", data: employees });
  } catch (err: any) {
    console.error("[Roles] Failed to fetch unassigned employees:", err);
    res.status(500).json({ status: "error", message: "Failed to fetch unassigned employees" });
  }
});

/**
 * POST /roles
 * Create a new role. Body: { name: string, permissions?: Record<string, boolean> }
 * Requires admin.
 */
router.post("/", protect, requireStrictAdmin, async (req: Request, res: Response) => {
  try {
    const { name, permissions } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ status: "error", message: "Role name is required" });
      return;
    }

    const trimmedName = name.trim();

    // Check for duplicate name
    const existing = await prisma.appRole.findFirst({
      where: { name: trimmedName },
      select: { id: true },
    });
    if (existing) {
      res.status(409).json({ status: "error", message: `Role "${trimmedName}" already exists` });
      return;
    }

    // Compute next available ID (AppRole.id is not auto-increment)
    const maxId = await prisma.appRole.aggregate({ _max: { id: true } });
    const nextId = (maxId._max.id ?? 0) + 1;

    // Validate permissions if provided
    let rolePermissions: Record<string, boolean> | null = null;
    if (permissions && typeof permissions === "object") {
      rolePermissions = {};
      for (const [key, value] of Object.entries(permissions)) {
        if (VALID_PERMISSION_KEYS.includes(key) && typeof value === "boolean") {
          rolePermissions[key] = value;
        }
      }
    }

    const createData: any = {
      id: nextId,
      name: trimmedName,
    };
    if (rolePermissions !== null) {
      createData.permissions = rolePermissions;
    }

    const role = await prisma.appRole.create({ data: createData });

    console.log(`[Roles] Created role "${trimmedName}" (id=${nextId})`);

    res.status(201).json({
      status: "success",
      data: { id: role.id, name: role.name, permissions: role.permissions },
      message: `Role "${trimmedName}" created`,
    });
  } catch (err: any) {
    console.error("[Roles] Failed to create role:", err);
    res.status(500).json({ status: "error", message: "Failed to create role" });
  }
});

/**
 * PATCH /roles/:roleId
 * Update a role's name. Body: { name?: string }
 * Requires admin.
 */
router.patch("/:roleId", protect, requireStrictAdmin, async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.roleId, 10);
    if (isNaN(roleId)) {
      res.status(400).json({ status: "error", message: "Invalid role ID" });
      return;
    }

    const existing = await prisma.appRole.findUnique({
      where: { id: roleId },
      select: { id: true, name: true },
    });
    if (!existing) {
      res.status(404).json({ status: "error", message: "Role not found" });
      return;
    }

    const { name } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ status: "error", message: "Role name is required" });
      return;
    }

    const trimmedName = name.trim();

    // Check for duplicate name (excluding current role)
    const duplicate = await prisma.appRole.findFirst({
      where: { name: trimmedName, NOT: { id: roleId } },
      select: { id: true },
    });
    if (duplicate) {
      res.status(409).json({ status: "error", message: `Role "${trimmedName}" already exists` });
      return;
    }

    await prisma.appRole.update({
      where: { id: roleId },
      data: { name: trimmedName },
    });

    console.log(`[Roles] Renamed role "${existing.name}" → "${trimmedName}"`);

    res.json({
      status: "success",
      data: { id: roleId, name: trimmedName },
      message: `Role renamed to "${trimmedName}"`,
    });
  } catch (err: any) {
    console.error("[Roles] Failed to update role:", err);
    res.status(500).json({ status: "error", message: "Failed to update role" });
  }
});

/**
 * DELETE /roles/:roleId
 * Delete a role. Blocks if the role is referenced by any approval step.
 * Unsets roleId on any AppUsers assigned to this role.
 * Requires admin.
 */
router.delete("/:roleId", protect, requireStrictAdmin, async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.roleId, 10);
    if (isNaN(roleId)) {
      res.status(400).json({ status: "error", message: "Invalid role ID" });
      return;
    }

    const role = await prisma.appRole.findUnique({
      where: { id: roleId },
      select: { id: true, name: true },
    });
    if (!role) {
      res.status(404).json({ status: "error", message: "Role not found" });
      return;
    }

    // Block if role is referenced in any approval step
    const stepsUsingRole = await prisma.approvalStep.findFirst({
      where: {
        OR: [{ requiredRoleId: roleId }, { alternateRoleId: roleId }],
      },
      select: { id: true },
    });
    if (stepsUsingRole) {
      res.status(409).json({
        status: "error",
        message: `Cannot delete "${role.name}" — it is used in approval workflow steps. Remove it from all steps first.`,
      });
      return;
    }

    // Unset roleId on all AppUsers assigned to this role
    await prisma.appUser.updateMany({
      where: { roleId },
      data: { roleId: null },
    });

    await prisma.appRole.delete({ where: { id: roleId } });

    console.log(`[Roles] Deleted role "${role.name}" (id=${roleId})`);

    res.json({
      status: "success",
      message: `Role "${role.name}" deleted`,
    });
  } catch (err: any) {
    console.error("[Roles] Failed to delete role:", err);
    res.status(500).json({ status: "error", message: "Failed to delete role" });
  }
});

/**
 * GET /roles/:roleId/users
 * Returns all AppUsers assigned to a given role, joined with Employee data.
 */
router.get("/:roleId/users", protect, async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.roleId, 10);
    if (isNaN(roleId)) {
      res.status(400).json({ status: "error", message: "Invalid role ID" });
      return;
    }

    const appUsers = await prisma.appUser.findMany({
      where: { roleId },
      include: {
        role: { select: { id: true, name: true } },
      },
      orderBy: { id: "asc" },
    });

    // Attach Employee info where available (Employee.userId maps to AppUser.id)
    const employeeIds = appUsers.map((u) => u.id);
    const employees = await prisma.employee.findMany({
      where: { userId: { in: employeeIds } },
      select: { userId: true, id: true, externalId: true, firstName: true, lastName: true },
    });
    const employeeMap = new Map(employees.map((e) => [e.userId, e]));

    const enriched = appUsers.map((u) => ({
      id: u.id,
      email: u.email,
      status: u.status,
      role: u.role,
      employee: employeeMap.get(u.id) ?? null,
    }));

    res.json({ status: "success", data: enriched });
  } catch (err: any) {
    console.error("[Roles] Failed to fetch role users:", err);
    res.status(500).json({ status: "error", message: "Failed to fetch role users" });
  }
});

export default router;
