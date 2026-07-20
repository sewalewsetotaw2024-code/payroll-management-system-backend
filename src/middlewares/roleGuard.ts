import { authorizeRoles } from "./auth";
import { RoleNames } from "../utils/roleConstants";

// Middleware for truly administrative actions (e.g. configuring the workflow pipeline).
export const requireStrictAdmin = authorizeRoles(
  RoleNames.ADMIN,
  RoleNames.SUPERADMIN,
);

// General management access for running payroll, configuring deductions, etc.
export const requireAdmin = authorizeRoles(
  RoleNames.ADMIN,
  RoleNames.SUPERADMIN,
  RoleNames.HR_GENERALIST,
  RoleNames.HR_CS_MANAGER,
  RoleNames.HR_CS_DIRECTOR,
  RoleNames.FINANCE_MANAGER,
  RoleNames.FINANCE_OFFICER,
  RoleNames.DEPARTMENT_MANAGER,
  RoleNames.EMPLOYEE
);

// Alias — same set of roles, accessible to anyone involved in the approval/payroll pipeline.
export const requireViewAccess = authorizeRoles(
  RoleNames.ADMIN,
  RoleNames.SUPERADMIN,
  RoleNames.HR_GENERALIST,
  RoleNames.HR_CS_MANAGER,
  RoleNames.HR_CS_DIRECTOR,
  RoleNames.FINANCE_MANAGER,
  RoleNames.FINANCE_OFFICER,
  RoleNames.DEPARTMENT_MANAGER,
  RoleNames.EMPLOYEE
);
