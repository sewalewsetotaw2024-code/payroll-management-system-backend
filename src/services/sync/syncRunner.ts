import { EmployeeSyncService } from "./employeeSync.service";

/**
 * Runs a full synchronization of all entities (roles, companies, banks, app users, employees)
 * from the external employee module for a given company.
 *
 * @param companyId - The numeric ID of the company to sync data for.
 * @param token - The API token used to authenticate with the external system.
 * @returns A promise resolving to an object containing the count of synced records per entity type.
 */
export async function runFullSync(companyId: number, token: string) {
    const sync = new EmployeeSyncService(token);
    return sync.runFullSync(companyId);
}

export { EmployeeSyncService };
