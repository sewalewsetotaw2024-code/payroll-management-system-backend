import prisma from "../../config/database";
import { $Enums } from "../../generated/prisma";
import { externalApiClient } from "./externalApiClient";
import logger from "../../utils/logger";

type SyncStatus = $Enums.SyncStatus;

interface SyncResult {
    typesSynced: number;
    balancesSynced: number;
    applicationsSynced: number;
}

export class LeaveSyncService {
    constructor(
        private readonly token: string,
        private readonly companyId: number,
    ) { }

    async syncLeaveTypes(): Promise<number> {
        const types = await externalApiClient.getLeaveTypes(this.token);
        logger.info({ count: types.length }, "leaveSync.leaveTypes");
        return types.length;
    }

    async syncLeaveBalances(fiscalYear?: number): Promise<number> {
        const rows = await externalApiClient.getLeaveBalances(this.token, this.companyId, fiscalYear);
        let count = 0;

        for (const row of rows) {
            const employee = await prisma.employee.findFirst({
                where: { companyId: this.companyId, externalId: String(row.employee_id) },
            });
            if (!employee) {
                logger.warn({ employeeId: row.employee_id }, "leaveSync.employeeNotFound");
                continue;
            }

            await prisma.leaveBalance.upsert({
                where: {
                    employeeId_leaveType_fiscalYear: {
                        employeeId: employee.id,
                        leaveType: row.leaveType.name,
                        fiscalYear: row.fiscal_year,
                    },
                },
                update: {
                    totalEntitlement: row.total_entitlement,
                    usedDays: row.used_days,
                    pendingDays: row.pending_days,
                    remainingDays: row.remaining_days,
                    expiryDate: row.expiry_date ? new Date(row.expiry_date) : null,
                    syncedAt: new Date(),
                },
                create: {
                    employeeId: employee.id,
                    companyId: this.companyId,
                    leaveType: row.leaveType.name,
                    fiscalYear: row.fiscal_year,
                    totalEntitlement: row.total_entitlement,
                    usedDays: row.used_days,
                    pendingDays: row.pending_days,
                    remainingDays: row.remaining_days,
                    expiryDate: row.expiry_date ? new Date(row.expiry_date) : null,
                },
            });
            count++;
        }

        return count;
    }

    async syncLeaveApplications(startDate: string, endDate: string, payrollPeriodId?: string): Promise<number> {
        const rows = await externalApiClient.getLeaveApplications(this.token, this.companyId, startDate, endDate);
        let count = 0;

        for (const row of rows) {
            const employee = await prisma.employee.findFirst({
                where: { companyId: this.companyId, externalId: String(row.employee_id) },
            });
            if (!employee) {
                logger.warn({ employeeId: row.employee_id }, "leaveSync.employeeNotFound");
                continue;
            }

            const externalId = String(row.id);
            const leaveType = row.leaveType.name;

            await prisma.leaveApplication.upsert({
                where: { externalId },
                update: {
                    leaveType,
                    startDate: new Date(row.start_date),
                    endDate: new Date(row.end_date),
                    requestedDays: row.requested_days,
                    status: row.current_status,
                    syncedAt: new Date(),
                },
                create: {
                    employeeId: employee.id,
                    companyId: this.companyId,
                    leaveType,
                    startDate: new Date(row.start_date),
                    endDate: new Date(row.end_date),
                    requestedDays: row.requested_days,
                    status: row.current_status,
                    externalId,
                },
            });

            // Create LeaveDeduction for unpaid leave
            const isUnpaid = /unpaid|without.?pay|suspension/i.test(leaveType);
            if (isUnpaid && payrollPeriodId) {
                await prisma.leaveDeduction.upsert({
                    where: {
                        employeeId_payrollPeriodId_leaveType: {
                            employeeId: employee.id,
                            payrollPeriodId,
                            leaveType,
                        },
                    },
                    update: {
                        leaveDays: row.requested_days,
                        externalLeaveId: externalId,
                        syncedAt: new Date(),
                    },
                    create: {
                        employeeId: employee.id,
                        companyId: this.companyId,
                        payrollPeriodId,
                        leaveType,
                        leaveDays: row.requested_days,
                        deductionAmount: 0,
                        externalLeaveId: externalId,
                    },
                });
            }

            count++;
        }

        return count;
    }

    async runFullSync(fiscalYear?: number, payrollPeriodId?: string): Promise<SyncResult> {
        const log = await prisma.integrationLog.create({
            data: {
                system: "LEAVE_MODULE" as unknown as $Enums.IntegrationSystem,
                direction: "INBOUND" as unknown as $Enums.SyncDirection,
                status: "SUCCESS" as unknown as SyncStatus,
                recordsSynced: 0,
                startedAt: new Date(),
            },
        });

        try {
            const now = new Date();

            // const startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
            // const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

            const payrollPeriod = await prisma.payrollPeriod.findUnique({
                where: {
                    id: payrollPeriodId
                }
            })

            if (!payrollPeriod) {
                throw new Error("Payroll period not found")
            }

            const startDate = payrollPeriod.startDate.toISOString().split("T")[0];
            const endDate = payrollPeriod.endDate.toISOString().split("T")[0];

            const typesSynced = await this.syncLeaveTypes();
            const balancesSynced = await this.syncLeaveBalances(fiscalYear);
            const applicationsSynced = await this.syncLeaveApplications(startDate, endDate, payrollPeriodId);

            const total = balancesSynced + applicationsSynced;

            await prisma.leaveSyncLog.create({
                data: {
                    payrollPeriodId,
                    employeeCount: balancesSynced,
                    status: "SUCCESS" as unknown as SyncStatus,
                    syncedAt: new Date(),
                },
            });

            await prisma.integrationLog.update({
                where: { id: log.id },
                data: { recordsSynced: total, completedAt: new Date() },
            });

            return { typesSynced, balancesSynced, applicationsSynced };
        } catch (error) {
            await prisma.leaveSyncLog.create({
                data: {
                    payrollPeriodId,
                    employeeCount: 0,
                    status: "FAILED" as unknown as SyncStatus,
                    errorDetails: (error as Error).message,
                    syncedAt: new Date(),
                },
            });

            await prisma.integrationLog.update({
                where: { id: log.id },
                data: {
                    status: "FAILED" as unknown as SyncStatus,
                    errorDetails: (error as Error).message,
                    completedAt: new Date(),
                },
            });

            throw error;
        }
    }
}
