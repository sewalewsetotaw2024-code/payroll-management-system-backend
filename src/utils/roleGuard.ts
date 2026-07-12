import type { Request } from "express";
import CustomError from "./customError";
import httpStatus from "http-status";

// Extracts the company ID from the authenticated user and throws if missing
export const resolveCompanyId = (req: Request): number => {
    const companyId = (req as any).user?.company_id ?? (req as any).user?.companyId;
    if (!companyId) {
        throw new CustomError(httpStatus.BAD_REQUEST, "Company ID is required");
    }
    return Number(companyId);
};
