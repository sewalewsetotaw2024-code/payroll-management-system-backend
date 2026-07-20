// Canonical role name constants that match the database values
export const RoleNames = {
  SUPERADMIN: "Super Admin",
  ADMIN: "Admin",
  HR_GENERALIST: "HR Generalist",
  HR_CS_MANAGER: "HR CS Manager",
  HR_CS_DIRECTOR: "HR CS Director",
  FINANCE_MANAGER: "Finance Manager",
  FINANCE_OFFICER: "Finance Officer",
  DEPARTMENT_MANAGER: "Department Manager",
  EMPLOYEE: "Employee",
} as const;

/**
 * REQUIRED_APPROVAL_ROLES
 * ──────────────────────────
 * Central registry of every role that the ApprovalWorkflowService depends on.
 * Each entry lists the display-name aliases that the database's `AppRole.name`
 * column may contain for that logical role.
 *
 * These exact names (or their listed aliases) MUST exist in the `AppRole` table
 * BEFORE onboarding a new company or deploying changes that run workflow
 * migration/seed logic.  If a role is missing:
 *   - `getWorkflowForCompany` will log an APPROVAL_ROLE_MISSING error and
 *     create a workflow with zero steps.
 *   - Schema upgrades (v1→v2, v2→v3) will skip and remain stuck below their
 *     target `schemaVersion`.
 *   - `approveRequest` / `rejectRequest` will throw "No workflow steps
 *     configured for stage …" at request time.
 *
 * Run `npm run validate:approval-roles` in CI or pre-deploy to catch missing
 * roles before they reach production.
 */
export const REQUIRED_APPROVAL_ROLES: Record<string, string[]> = {
  HR_CS_MANAGER:   ["HR CS Manager", "HR_CS_MANAGER", "hr_cs_manager", "HR Manager", "HR_MANAGER", "hr_manager"],
  HR_CS_DIRECTOR:  ["HR CS Director", "HR_CS_DIRECTOR", "hr_cs_director"],
  HR_GENERALIST:   ["HR Generalist", "HR_GENERALIST", "hr_generalist"],
  FINANCE_MANAGER: ["Finance Manager", "FINANCE_MANAGER", "finance_manager"],
  FINANCE_OFFICER: ["Finance Officer", "FINANCE_OFFICER", "finance_officer"],
  ADMIN:           ["Admin", "admin", "ADMIN"],
  // Legacy alias used by the v1→v2 migration (replaced by HR_CS_MANAGER in v3)
  HR_MANAGER:      ["HR Manager", "HR_MANAGER", "hr_manager"],
};

/** Keys whose roles are considered critical — if missing, seeding and
 *  migrations will silently skip, but the workflow will be stuck. */
export const CRITICAL_APPROVAL_ROLES = [
  "HR_CS_MANAGER",
  "HR_CS_DIRECTOR",
  "FINANCE_MANAGER",
  "FINANCE_OFFICER",
] as const;

// Case-insensitive variants of the Super Admin role name for flexible matching
export const SUPERADMIN_VARIANTS = [
  "SuperAdmin",
  "Superadmin",
  "superadmin",
  "Super Admin",
  "super admin",
  "SUPERADMIN",
] as const;

// Checks if a role name matches Super Admin (case-insensitive, supports multiple variants)
export const isSuperAdminRole = (roleName: string): boolean => {
  if (!roleName) return false;
  const normalized = roleName.toLowerCase().trim();
  return (
    normalized === "superadmin" ||
    normalized === "super admin" ||
    SUPERADMIN_VARIANTS.some((variant) => variant.toLowerCase() === normalized)
  );
};

// Checks if a role name is Admin or Super Admin (case-insensitive)
export const isAdminRole = (roleName: string): boolean => {
  if (!roleName) return false;
  const normalized = roleName.toLowerCase().trim();
  return normalized === "admin" || isSuperAdminRole(roleName);
};

// Maps numeric role IDs from external systems to canonical role names
export const RoleIds: Record<string, string> = {
  "1": "Super Admin",
  "5": "Super Admin",
  "9": "Super Admin",
  "2": "Admin",
  "6": "Admin",
  "10": "Admin",
  "3": "HR Generalist",
  "7": "HR",          // legacy HR role in DB
  "11": "HR Generalist",
  // HR CS Manager (DB id=14)
  "13": "HR CS Manager",
  "14": "HR CS Manager",
  // HR CS Director (DB id=17)
  "17": "HR CS Director",
  // HR Generalist (DB id=18)
  "18": "HR Generalist",
  // Finance Officer (DB id=15)
  "15": "Finance Officer",
  // Finance Manager (DB id=16)
  "16": "Finance Manager",
  "4": "Employee",
  "8": "Employee",
  "12": "Employee",
};

/** Normalizes a role name to an uppercased underscore key (e.g. "HR Manager" → "HR_MANAGER"). */
export const roleKey = (name: string): string =>
  name.toUpperCase().replace(/\s+/g, "_");

/**
 * Default payroll pipeline permissions for known roles.
 * Used as fallback during sync and when querying roles that haven't had
 * their permissions seeded yet.
 */
export const DEFAULT_PERMISSIONS: Record<string, Record<string, boolean>> = {
  HR_GENERALIST: {
    canActivateImport: true,
    canCalculateOt: true,
    canCalculateSummary: true,
    canApproveImport: true,
    canRunPayroll: true,
    canSyncLeave: true,
    canReRunEmployee: true,
    canSubmitForApproval: true,
    canSubmitPayroll: true,
    canApproveRun: false,
    canRejectRun: false,
    canSubmitPaymentFile: false,
    canViewEmployeeDetail: true,
    canApproveAttendance: false,
    canRejectAttendance: false,
    canApprovePayment: false,
    canRejectPayment: false,
  },
  HR_CS_MANAGER: {
    canActivateImport: true,
    canCalculateOt: true,
    canCalculateSummary: true,
    canApproveImport: true,
    canRunPayroll: true,
    canSyncLeave: true,
    canReRunEmployee: true,
    canSubmitForApproval: true,
    canSubmitPayroll: true,
    canApproveRun: true,
    canRejectRun: true,
    canSubmitPaymentFile: false,
    canViewEmployeeDetail: true,
    canApproveAttendance: true,
    canRejectAttendance: true,
    canApprovePayment: false,
    canRejectPayment: false,
  },
  HR_CS_DIRECTOR: {
    canActivateImport: false,
    canCalculateOt: false,
    canCalculateSummary: false,
    canApproveImport: false,
    canRunPayroll: false,
    canSyncLeave: false,
    canReRunEmployee: false,
    canSubmitForApproval: false,
    canSubmitPayroll: false,
    canApproveRun: true,
    canRejectRun: true,
    canSubmitPaymentFile: false,
    canViewEmployeeDetail: true,
    canApproveAttendance: true,
    canRejectAttendance: true,
    canApprovePayment: false,
    canRejectPayment: false,
  },
  FINANCE_MANAGER: {
    canActivateImport: false,
    canCalculateOt: false,
    canCalculateSummary: false,
    canApproveImport: false,
    canRunPayroll: false,
    canSyncLeave: false,
    canReRunEmployee: false,
    canSubmitForApproval: false,
    canSubmitPayroll: false,
    canApproveRun: true,
    canRejectRun: true,
    canSubmitPaymentFile: true,
    canViewEmployeeDetail: true,
    canApproveAttendance: false,
    canRejectAttendance: false,
    canApprovePayment: true,
    canRejectPayment: true,
  },
  FINANCE_OFFICER: {
    canActivateImport: false,
    canCalculateOt: false,
    canCalculateSummary: false,
    canApproveImport: false,
    canRunPayroll: false,
    canSyncLeave: false,
    canReRunEmployee: false,
    canSubmitForApproval: false,
    canSubmitPayroll: false,
    canApproveRun: false,
    canRejectRun: false,
    canSubmitPaymentFile: true,   // Finance Officer submits the payment file
    canViewEmployeeDetail: true,
    canApproveAttendance: false,
    canRejectAttendance: false,
    canApprovePayment: false,     // Finance MANAGER approves
    canRejectPayment: false,
  },
  DEPARTMENT_MANAGER: {
    canActivateImport: false,
    canCalculateOt: false,
    canCalculateSummary: false,
    canApproveImport: false,
    canRunPayroll: false,
    canSyncLeave: false,
    canReRunEmployee: false,
    canSubmitForApproval: false,
    canSubmitPayroll: false,
    canApproveRun: false,
    canRejectRun: false,
    canSubmitPaymentFile: false,
    canViewEmployeeDetail: true,
    canApproveAttendance: true,
    canRejectAttendance: true,
    canApprovePayment: false,
    canRejectPayment: false,
  },
  ADMIN: {
    canActivateImport: true,
    canCalculateOt: true,
    canCalculateSummary: true,
    canApproveImport: true,
    canRunPayroll: true,
    canSyncLeave: true,
    canReRunEmployee: true,
    canSubmitForApproval: true,
    canSubmitPayroll: true,
    canApproveRun: true,
    canRejectRun: true,
    canSubmitPaymentFile: true,
    canViewEmployeeDetail: true,
    canApproveAttendance: true,
    canRejectAttendance: true,
    canApprovePayment: true,
    canRejectPayment: true,
  },
};

/**
 * Known permission keys for the payroll pipeline.
 * Derived from DEFAULT_PERMISSIONS so the list is always in sync.
 */
export const VALID_PERMISSION_KEYS: string[] = Object.keys(DEFAULT_PERMISSIONS.ADMIN);

// Checks if the user's role matches any of the required roles, with normalization and variant support
export const hasAnyRole = (userRole: string, requiredRoles: string[]): boolean => {
  if (!userRole) return false;
  
  // Resolve numeric role strings to their names if possible
  let normalizedUserRole = userRole.toLowerCase().trim();
  if (RoleIds[userRole]) {
    normalizedUserRole = RoleIds[userRole].toLowerCase().trim();
  }
  
  return requiredRoles.some(requiredRole => {
    const normalizedRequired = requiredRole.toLowerCase().trim();
    
    // Direct match
    if (normalizedUserRole === normalizedRequired) return true;
    
    // Special handling for Super Admin variants
    if (normalizedRequired === "super admin" || normalizedRequired === "superadmin") {
      // Check if the resolved user role is a Super Admin variant
      return (
        normalizedUserRole === "super admin" || 
        normalizedUserRole === "superadmin" || 
        SUPERADMIN_VARIANTS.some(v => v.toLowerCase() === normalizedUserRole)
      );
    }
    
    // Special handling for Admin (which usually implies Super Admin)
    if (normalizedRequired === "admin") {
      return normalizedUserRole === "admin" || 
             normalizedUserRole === "super admin" || 
             normalizedUserRole === "superadmin" ||
             SUPERADMIN_VARIANTS.some(v => v.toLowerCase() === normalizedUserRole);
    }
    
    return false;
  });
};
