// Canonical role name constants that match the database values
export const RoleNames = {
  SUPERADMIN: "Super Admin",
  ADMIN: "Admin",
  HR: "HR",
  HR_MANAGER: "HR Manager",
  HR_OFFICER: "HR Officer",
  PAYROLL_OFFICER: "Payroll Officer",
  FINANCE_MANAGER: "Finance Manager",
  FINANCE_OFFICER: "Finance Officer",
  DEPARTMENT_MANAGER: "Department Manager",
  EMPLOYEE: "Employee",
} as const;

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
  "3": "HR",
  "7": "HR",
  "11": "HR",
  // HR Officer
  "13": "HR Officer",
  // HR Manager
  "14": "HR Manager",
  // Finance Officer
  "15": "Finance Officer",
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
  HR_OFFICER: {
    canActivateImport: true,
    canCalculateOt: true,
    canCalculateSummary: true,
    canApproveImport: true,
    canRunPayroll: false,
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
  },
  PAYROLL_OFFICER: {
    canActivateImport: false,
    canCalculateOt: true,
    canCalculateSummary: true,
    canApproveImport: false,
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
    canSubmitPaymentFile: false,
    canViewEmployeeDetail: true,
    canApproveAttendance: false,
    canRejectAttendance: false,
  },
  HR_MANAGER: {
    canActivateImport: false,
    canCalculateOt: false,
    canCalculateSummary: false,
    canApproveImport: false,
    canRunPayroll: false,
    canSyncLeave: false,
    canReRunEmployee: false,
    canSubmitForApproval: false,
    canSubmitPayroll: true,
    canApproveRun: true,
    canRejectRun: true,
    canSubmitPaymentFile: false,
    canViewEmployeeDetail: true,
    canApproveAttendance: true,
    canRejectAttendance: true,
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
