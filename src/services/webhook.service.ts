import prisma from "../config/database";
import config from "../config/env";
import logger from "../utils/logger";
import { EmployeeSyncService } from "./sync/syncRunner";

/**
 * Processes an incoming webhook event and triggers the appropriate sync action.
 * Currently handles employee update events by initiating an employee sync for the
 * associated company.
 *
 * @param _eventId - The unique identifier of the webhook event (reserved for idempotency).
 * @param source - The source system that emitted the event (e.g. "EMPLOYEE_MODULE").
 * @param eventType - The type of event (e.g. "employee.updated").
 * @param payload - The event payload containing relevant data such as company_id.
 * @returns A promise that resolves when the webhook processing is complete.
 */
export async function processWebhookEvent(
    _eventId: string,
    source: string,
    eventType: string,
    payload: any,
): Promise<void> {
    if (source === "EMPLOYEE_MODULE" && eventType === "employee.updated") {
        const token = config.externalApiToken || "";
        if (!token) {
            logger.warn("EXTERNAL_API_TOKEN not configured — skipping webhook sync");
            return;
        }
        const companyId = payload?.company_id;
        if (!companyId) {
            logger.warn({ payload }, "webhook.missing_company_id");
            return;
        }
        const sync = new EmployeeSyncService(token);
        await sync.syncEmployees(companyId);
    }
}
