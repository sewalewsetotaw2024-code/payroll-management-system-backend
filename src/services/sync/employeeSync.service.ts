import prisma from "../../config/database";
import { $Enums } from "../../generated/prisma";
import { externalApiClient } from "./externalApiClient";
import type { SyncReportModel } from "./externalApiClient";
import logger from "../../utils/logger";
import { DEFAULT_PERMISSIONS, roleKey } from "../../utils/roleConstants";

type SyncStatus = $Enums.SyncStatus;

/**
 * Service for synchronizing data from an external employee module into the local database.
 * Handles syncing of companies, banks, roles, app users, and employee records,
 * with full audit logging via integration and sync log tables.
 */
export class EmployeeSyncService {
    constructor(private readonly token: string) { }

    /**
     * Synchronizes external companies into the local database using upsert.
     *
     * @returns The number of companies synced.
     */
    async syncCompanies(): Promise<number> {
        const rows = await externalApiClient.getCompanies(this.token);
        let count = 0;

        for (const row of rows) {
            await prisma.company.upsert({
                where: { id: row.id },
                update: {
                    name: row.name,
                    code: row.company_code ?? row.name,
                    isActive: true,
                    syncedAt: new Date(),
                },
                create: {
                    id: row.id,
                    name: row.name,
                    code: row.company_code ?? row.name,
                    isActive: true,
                },
            });
            count++;
        }

        return count;
    }

    /**
     * Synchronizes external banks into the local database using upsert.
     *
     * @returns The number of banks synced.
     */
    async syncBanks(): Promise<number> {
        const rows = await externalApiClient.getBanks(this.token);
        let count = 0;

        for (const row of rows) {
            await prisma.bank.upsert({
                where: { id: row.id },
                update: {
                    name: row.name,
                    code: row.swift_code ?? null,
                    isActive: row.is_active,
                    syncedAt: new Date(),
                },
                create: {
                    id: row.id,
                    name: row.name,
                    code: row.swift_code ?? null,
                    isActive: row.is_active,
                },
            });
            count++;
        }

        return count;
    }

    /**
     * Synchronizes external application roles into the local database using upsert.
     * Also seeds payroll pipeline permissions from default values when a role
     * is created or its permissions are still null.
     *
     * @returns The number of roles synced.
     */
    async syncAppRoles(): Promise<number> {
        const rows = await externalApiClient.getRoles(this.token);
        let count = 0;

        for (const row of rows) {
            // Look up default permissions for this role based on its name
            const key = roleKey(row.name);
            const defaultPerms = DEFAULT_PERMISSIONS[key] ?? null;

            // Fetch existing role to check if permissions are already set
            const existing = await prisma.appRole.findUnique({
                where: { id: row.id },
                select: { permissions: true },
            });

            // Only seed permissions if:
            // 1. The role doesn't exist yet (create), OR
            // 2. The role exists but has null permissions (update with seed)
            const permissionsToSet =
                defaultPerms && (!existing || existing.permissions === null)
                    ? defaultPerms
                    : undefined; // don't overwrite existing permissions

            await prisma.appRole.upsert({
                where: { id: row.id },
                update: {
                    name: row.name,
                    syncedAt: new Date(),
                    ...(permissionsToSet !== undefined
                        ? { permissions: permissionsToSet }
                        : {}),
                },
                create: {
                    id: row.id,
                    name: row.name,
                    permissions: defaultPerms,
                },
            });
            count++;
        }

        return count;
    }

    /**
     * Synchronizes external application users into the local database using upsert.
     *
     * @returns The number of app users synced.
     */
    async syncAppUsers(): Promise<number> {
        const rows = await externalApiClient.getUsers(this.token, true);
        let count = 0;

        for (const row of rows) {
            await prisma.appUser.upsert({
                where: { id: row.id },
                update: {
                    email: row.email,
                    roleId: row.role_id,
                    status: "ACTIVE",
                    syncedAt: new Date(),
                },
                create: {
                    id: row.id,
                    email: row.email,
                    roleId: row.role_id,
                    status: "ACTIVE",
                },
            });
            count++;
        }

        return count;
    }

    /**
     * Synchronizes employee records from the external system for a given company.
     * Maps external field names to local schema, upserts employee data, and logs
     * each sync operation in the employee sync log.
     *
     * @param companyId - The numeric ID of the company to sync employees for.
     * @returns The number of employees synced.
     */
    async syncEmployees(companyId: number): Promise<number> {
        const rows = await externalApiClient.getSyncReport(this.token, companyId);
        let count = 0;
        const cId = Number(companyId);

        // Pre-load department name → id map for this company
        const allDepts = await prisma.department.findMany({ where: { companyId: cId } });
        const deptMap = new Map<string, number>(allDepts.map(d => [d.name, d.id]));

        /** Looks up department ID by name, creating the department if it doesn't exist yet. */
        async function resolveDeptId(name: string | null): Promise<number | null> {
            if (!name) return null;
            const existing = deptMap.get(name);
            if (existing) return existing;
            const maxDept = await prisma.department.findFirst({ orderBy: { id: 'desc' } });
            const nextId = (maxDept?.id ?? 0) + 1;
            const created = await prisma.department.create({
                data: { id: nextId, companyId: cId, name },
            });
            deptMap.set(name, created.id);
            return created.id;
        }

        for (const row of rows) {
            const fullName = row.employee_name || "";
            const nameParts = fullName.trim().split(/\s+/);
            const firstName = nameParts[0] ?? "";
            const lastName = nameParts.slice(1).join(" ") ?? "";

            const externalId = String(row.employee_id);

            const compensationFields = {
                basicSalary: row.basic_salary ?? null,
                grossSalary: row.gross_salary ?? null,
                taxablePay: row.taxable_remuneration ?? null,
                csBalance: row.cost_sharing_balance ?? null,
                pensionNo: row.pension_number ?? null,
            };

            const departmentId = await resolveDeptId(row.department_name);

            const employee = await prisma.employee.upsert({
                where: { externalId },
                update: {
                    companyId: cId,
                    firstName,
                    lastName,
                    email: row.email ?? null,
                    tinNumber: row.tin_number ?? null,
                    jobPosition: row.job_position ?? null,
                    departmentId,
                    managerName: row.manager_name ?? null,
                    hireDate: row.employment_date ? new Date(row.employment_date) : null,
                    status: "ACTIVE",
                    syncedAt: new Date(),
                    compensation: {
                        upsert: {
                            create: compensationFields,
                            update: compensationFields,
                        }
                    },
                    profile: {
                        upsert: {
                            update: {
                                gender: row.gender ?? null,
                                dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth) : null,
                                placeOfWork: row.place_of_work ?? null,
                                employmentType: row.employment_type ?? null,
                                contractReference: row.contract_reference ?? null,
                                probationEndDate: row.probation_end_date ? new Date(row.probation_end_date) : null,
                                employmentEndDate: row.employment_end_date ? new Date(row.employment_end_date) : null,
                            },
                            create: {
                                gender: row.gender ?? null,
                                dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth) : null,
                                placeOfWork: row.place_of_work ?? null,
                                employmentType: row.employment_type ?? null,
                                contractReference: row.contract_reference ?? null,
                                probationEndDate: row.probation_end_date ? new Date(row.probation_end_date) : null,
                                employmentEndDate: row.employment_end_date ? new Date(row.employment_end_date) : null,
                            }
                        }
                    }
                },
                create: {
                    externalId,
                    companyId: cId,
                    firstName,
                    lastName,
                    email: row.email ?? null,
                    tinNumber: row.tin_number ?? null,
                    jobPosition: row.job_position ?? null,
                    departmentId,
                    managerName: row.manager_name ?? null,
                    hireDate: row.employment_date ? new Date(row.employment_date) : null,
                    status: "ACTIVE",
                    compensation: {
                        create: compensationFields,
                    },
                    profile: {
                        create: {
                            gender: row.gender ?? null,
                            dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth) : null,
                            placeOfWork: row.place_of_work ?? null,
                            employmentType: row.employment_type ?? null,
                            contractReference: row.contract_reference ?? null,
                            probationEndDate: row.probation_end_date ? new Date(row.probation_end_date) : null,
                            employmentEndDate: row.employment_end_date ? new Date(row.employment_end_date) : null,
                        }
                    }
                },
            });

            const allowances = [
                { type: "TRANSPORTATION" as const, amount: row.transportation_allowance },
                { type: "TELEPHONE" as const, amount: row.telephone_allowance },
                { type: "REPRESENTATION" as const, amount: row.representation_allowance },
                { type: "HOUSING" as const, amount: row.housing_allowance },
                { type: "MEAL" as const, amount: row.meal_allowance },
                { type: "OTHER" as const, amount: row.other_payments },
            ];

            for (const allowance of allowances) {
                if (allowance.amount != null) {
                    await prisma.employeeAllowance.upsert({
                        where: {
                            employeeId_allowanceType: {
                                employeeId: employee.id,
                                allowanceType: allowance.type,
                            }
                        },
                        update: { amount: allowance.amount, isActive: true, syncedAt: new Date() },
                        create: {
                            employeeId: employee.id,
                            allowanceType: allowance.type,
                            amount: allowance.amount,
                            isActive: true,
                        }
                    });
                } else {
                    await prisma.employeeAllowance.updateMany({
                        where: { employeeId: employee.id, allowanceType: allowance.type },
                        data: { isActive: false }
                    });
                }
            }

            await prisma.employeeSyncLog.create({
                data: {
                    employeeId: employee.id,
                    externalId,
                    changeType: "SYNC",
                    payload: row as any,
                    status: "SUCCESS" as unknown as SyncStatus,
                },
            });

            count++;
        }

        return count;
    }

    /**
     * Runs a full synchronization of all entity types (roles, companies, banks, app users, employees)
     * within a single integration log transaction. Records success or failure in the integration log.
     *
     * @param companyId - The numeric ID of the company to sync data for.
     * @returns An object containing the sync count for each entity type.
     * @throws Re-throws any error encountered during sync, after logging the failure.
     */
    async runFullSync(companyId: number): Promise<{
        roles: number;
        companies: number;
        banks: number;
        appUsers: number;
        employees: number;
    }> {
        const log = await prisma.integrationLog.create({
            data: {
                system: "EMPLOYEE_MODULE" as unknown as $Enums.IntegrationSystem,
                direction: "INBOUND" as unknown as $Enums.SyncDirection,
                status: "SUCCESS" as unknown as SyncStatus,
                recordsSynced: 0,
                startedAt: new Date(),
            },
        });

        try {
            const roles = await this.syncAppRoles();
            const companies = await this.syncCompanies();
            const banks = await this.syncBanks();
            const appUsers = await this.syncAppUsers();
            const employees = await this.syncEmployees(companyId);

            const total = roles + companies + banks + appUsers + employees;

            await prisma.integrationLog.update({
                where: { id: log.id },
                data: {
                    recordsSynced: total,
                    completedAt: new Date(),
                },
            });

            return { roles, companies, banks, appUsers, employees };
        } catch (error) {
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
