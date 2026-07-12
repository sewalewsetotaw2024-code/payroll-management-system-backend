import jwt from "jsonwebtoken";
import type { TokenType } from "../config/token";
import config from "../config/env";
import CustomError from "../utils/customError";
import httpStatus from "http-status";
import prisma from "../config/database";
import logger from "../utils/logger";

interface TokenPayload {
    sub: string;
    role: string;
    company_id?: string;
    type: TokenType;
    exp?: number;
}

/**
 * Verifies a JWT token and extracts the user identity and role from its payload.
 * Supports multiple claim naming conventions (sub, userId, user_id, id) and
 * resolves numeric role IDs to role names by querying the database.
 *
 * @param token - The JWT string to verify.
 * @param _type - The expected token type (reserved for future validation).
 * @returns An object containing the userId, role, and optionally the companyId extracted from the token.
 * @throws {CustomError} If the token is invalid, expired, or missing required claims.
 */
export const verifyToken = async (
    token: string,
    _type: TokenType,
): Promise<{ userId: string; role: string; companyId?: string }> => {
    let payload: TokenPayload;
    try {
        payload = jwt.verify(token, config.jwt.secret) as TokenPayload;
    } catch (err: unknown) {
        const message = err instanceof jwt.JsonWebTokenError
            ? `JWT verification failed: ${err.message}`
            : "Invalid or expired token";
        throw new CustomError(httpStatus.UNAUTHORIZED, message);
    }

    // Accept multiple claim name conventions
    const userId = payload.sub ?? (payload as any).userId ?? (payload as any).user_id ?? (payload as any).id;
    const rawRole = payload.role ?? (payload as any).roles ?? (payload as any).userRole ?? (payload as any).role_id;
    const companyId = payload.company_id ?? (payload as any).companyId ?? (payload as any).company;

    if (!userId || !rawRole) {
        throw new CustomError(
            httpStatus.UNAUTHORIZED,
            `Token missing required claims. Found keys: ${Object.keys(payload).join(", ")}`,
        );
    }

    let role = String(rawRole);

    // If role is numeric, attempt to resolve it from the DB
    if (/^\d+$/.test(role)) {
        try {
            const roleRecord = await prisma.appRole.findFirst({
                where: { id: parseInt(role, 10) }
            });
            if (roleRecord) {
                role = roleRecord.name;
            }
        } catch (dbErr: any) {
            logger.error({ err: dbErr, role }, "DB Error resolving role");
            // Fallback to the numeric role instead of crashing
        }
    }

    return {
        userId: String(userId),
        role: String(role),
        companyId: companyId ? String(companyId) : undefined,
    };
};
