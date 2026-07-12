import type { Request } from "express";
import prisma from "../config/database";

// Creates an audit log entry recording a user action on a resource with IP and user-agent
export const writeAudit = async (
    req: Request,
    data: {
        action: string;
        resource: string;
        resourceId: string;
        newValue?: unknown;
        oldValue?: unknown;
    },
): Promise<void> => {
    await prisma.auditLog.create({
        data: {
            userId: req.user?.id ? Number(req.user.id) : null,
            action: data.action,
            resource: data.resource,
            resourceId: data.resourceId,
            oldValue: data.oldValue as any,
            newValue: data.newValue as any,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
        },
    });
};
