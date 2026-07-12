import { authorizeRoles } from "./auth";
import { RoleNames } from "../utils/roleConstants";

// Middleware that allows Admin, Super Admin, and all approval-related roles
// (HR, HR Manager, HR Officer, Payroll Officer, Finance Manager, Finance Officer, Department Manager).
export const requireAdmin = authorizeRoles(
  RoleNames.ADMIN,
  RoleNames.SUPERADMIN,
  RoleNames.HR,
  RoleNames.HR_MANAGER,
  RoleNames.HR_OFFICER,
  RoleNames.PAYROLL_OFFICER,
  RoleNames.FINANCE_MANAGER,
  RoleNames.FINANCE_OFFICER,
  RoleNames.DEPARTMENT_MANAGER,
);

// Alias — same set of roles, accessible to anyone involved in the approval/payroll pipeline.
export const requireViewAccess = authorizeRoles(
  RoleNames.ADMIN,
  RoleNames.SUPERADMIN,
  RoleNames.HR,
  RoleNames.HR_MANAGER,
  RoleNames.HR_OFFICER,
  RoleNames.PAYROLL_OFFICER,
  RoleNames.FINANCE_MANAGER,
  RoleNames.FINANCE_OFFICER,
  RoleNames.DEPARTMENT_MANAGER,
);
