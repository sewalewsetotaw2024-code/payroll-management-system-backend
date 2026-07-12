import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { verifyToken } from "../services/token.service";
import { tokenTypes } from "../config/token";
import CustomError from "../utils/customError";
import asyncHandler from "../utils/asyncHandler";
import { hasAnyRole } from "../utils/roleConstants";

// Extracts and verifies the Bearer token from the Authorization header
const extractBearerToken = (authorizationHeader?: string): string => {
    if (!authorizationHeader) {
        throw new CustomError(httpStatus.UNAUTHORIZED, "Authorization header is required");
    }
    const [scheme, token] = authorizationHeader.trim().split(/\s+/);
    if (scheme !== "Bearer" || !token) {
        throw new CustomError(httpStatus.UNAUTHORIZED, "Authorization header must use Bearer token");
    }
    return token;
};

// Middleware — verifies the access token and attaches user payload to the request
export const authenticate = asyncHandler(
    async (req: Request, _res: Response, next: NextFunction) => {
        const token = extractBearerToken(req.headers.authorization);
        const payload = await verifyToken(token, tokenTypes.ACCESS);
        req.user = {
            id: payload.userId,
            role: payload.role,
            ...(payload.companyId ? { company_id: payload.companyId } : {}),
        };
        next();
    },
);

// Middleware factory — restricts access to authenticated users with one of the allowed roles
export const authorizeRoles =
    (...allowedRoles: string[]) =>
        (req: Request, _res: Response, next: NextFunction): void => {
            if (!req.user) {
                throw new CustomError(httpStatus.UNAUTHORIZED, "Authentication is required");
            }
            if (!hasAnyRole(req.user.role, allowedRoles)) {
                throw new CustomError(
                    httpStatus.FORBIDDEN,
                    `Role "${req.user.role}" is not allowed. Required: ${allowedRoles.join(", ")}`,
                );
            }
            next();
        };
