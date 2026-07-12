import type { Request, Response } from "express";
import httpStatus from "http-status";
import asyncHandler from "../utils/asyncHandler";
import { EmployeeSyncService } from "../services/sync/syncRunner";
import { apiCredentialService } from "../services/apiCredential.service";
import { processWebhookEvent } from "../services/webhook.service";
import prisma from "../config/database";
import logger from "../utils/logger";

export const IntegrationController = {
    triggerSync: asyncHandler(async (req: Request, res: Response) => {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith("Bearer ")) {
            res.status(httpStatus.UNAUTHORIZED).json({ message: "Missing or invalid Authorization header" });
            return;
        }
        const token = auth.slice(7);
        const companyId = (req.user as any)?.company_id;
        if (!companyId) {
            res.status(httpStatus.BAD_REQUEST).json({ message: "Company ID not found in auth token" });
            return;
        }
        const sync = new EmployeeSyncService(token);
        const result = await sync.runFullSync(companyId);
        res.status(httpStatus.OK).json({ message: "Sync completed", data: result });
    }),

    /**
     * Retrieves recent integration sync logs, optionally filtered by system.
     *
     * @param req - Express request object with optional system query parameter.
     * @param res - Express response object used to return sync logs.
     * @returns JSON response with array of sync log entries.
     */
    getSyncLogs: asyncHandler(async (req: Request, res: Response) => {
        const system = req.query.system as string | undefined;
        const logs = await prisma.integrationLog.findMany({
            where: system ? { system } as any : {},
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        res.status(httpStatus.OK).json({ data: logs });
    }),

    handleWebhook: asyncHandler(async (req: Request, res: Response) => {
        const { source, eventType, payload } = req.body;
        if (!source || !eventType) {
            res.status(httpStatus.BAD_REQUEST).json({ message: "source and eventType are required" });
            return;
        }
        const event = await prisma.webhookEvent.create({
            data: { source, eventType, payload: payload ?? {}, status: "PENDING" },
        });
        processWebhookEvent(event.id, source, eventType, payload).catch((err) =>
            logger.error({ err }, "webhook.processing_failed")
        );
        res.status(httpStatus.ACCEPTED).json({ message: "Webhook event received", data: { id: event.id } });
    }),

    getWebhookEvents: asyncHandler(async (_req: Request, res: Response) => {
        const events = await prisma.webhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
        res.status(httpStatus.OK).json({ data: events });
    }),

    listCredentials: asyncHandler(async (_req: Request, res: Response) => {
        const credentials = await apiCredentialService.list();
        res.status(httpStatus.OK).json({ data: credentials });
    }),

    /**
     * Creates a new API credential entry for an external system.
     *
     * @param req - Express request object containing system, authType, baseUrl, and credential in body.
     * @param res - Express response object used to return created credential.
     * @returns JSON response with success status and created credential data.
     */
    createCredential: asyncHandler(async (req: Request, res: Response) => {
        const { system, authType, baseUrl, credential } = req.body;
        const created = await apiCredentialService.create({ system, authType, baseUrl, credential });
        res.status(httpStatus.CREATED).json({ data: created });
    }),

    /**
     * Rotates (replaces) the credential value for a given API credential.
     *
     * @param req - Express request object with credential ID in params and new credential in body.
     * @param res - Express response object used to return updated credential.
     * @returns JSON response with success status and updated credential data.
     */
    rotateCredential: asyncHandler(async (req: Request, res: Response) => {
        const { credential } = req.body;
        const updated = await apiCredentialService.rotate(req.params.id, credential);
        res.status(httpStatus.OK).json({ data: updated });
    }),

    /**
     * Deactivates an API credential so it can no longer be used.
     *
     * @param req - Express request object with credential ID in params.
     * @param res - Express response object used to return deactivated credential.
     * @returns JSON response with success status and deactivated credential data.
     */
    deactivateCredential: asyncHandler(async (req: Request, res: Response) => {
        const updated = await apiCredentialService.deactivate(req.params.id);
        res.status(httpStatus.OK).json({ data: updated });
    }),
};


