import { Router } from "express";
import payrollConfigurationRoutes from "./payrollConfiguration.routes";
import integrationRoutes from "./integration.routes";
import attendanceRoutes from "./attendance.routes";
import dataManagementRoutes from "./dataManagement.routes";
import folderRoutes from "./folder.routes";
import payrollProcessingRoutes from "./payrollProcessing.routes";
import leaveRoutes from "./leave.routes";
import actingAllowanceRoutes from "./actingAllowance.routes";
import employeeRoutes from "./employee.routes";
import approvalWorkflowRoutes from "./approvalWorkflow.routes";
import attendanceNotificationRoutes from "./attendanceNotification.routes";
import rolesRoutes from "./roles.routes";
import paymentExportRoutes from "./paymentExport.routes";

const router = Router();

/**
 * Mounts payroll configuration routes (fiscal years, tax brackets, deductions, etc.) under /configurations.
 */
router.use("/configurations", payrollConfigurationRoutes);

/**
 * Mounts integration routes (webhooks, sync, credentials) under /integrations.
 */
router.use("/integrations", integrationRoutes);

/**
 * Mounts attendance import routes (import, calculate OT, list, CRUD) under /.
 * Routes use /attendance/* prefix internally.
 */
router.use("/", attendanceRoutes);

/**
 * Mounts folder management routes under /folders.
 */
router.use("/folders", folderRoutes);

/**
 * Mounts data management routes (import employees, attendance, adjustments) under /.
 */
router.use("/", dataManagementRoutes);

/**
 * Mounts payroll processing routes (run payroll, list runs) under /payroll.
 */
router.use("/payroll", payrollProcessingRoutes);
router.use("/leave", leaveRoutes);
router.use("/", actingAllowanceRoutes);

/**
 * Mounts employee routes (list, get by ID) under /employees.
 */
router.use("/employees", employeeRoutes);

/**
 * Mounts approval workflow routes (workflow config, approval requests) under /approval.
 */
router.use("/approval", approvalWorkflowRoutes);
router.use("/", attendanceNotificationRoutes);
router.use("/roles", rolesRoutes);
router.use("/", paymentExportRoutes);

export default router;
