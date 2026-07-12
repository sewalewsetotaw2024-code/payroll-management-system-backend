import type { Request, Response } from "express";
import httpStatus from "http-status";
import asyncHandler from "../utils/asyncHandler";
import CustomError from "../utils/customError";
import { dataManagementService } from "../services/dataManagement.service";
import { resolveCompanyId } from "../utils/roleGuard";
import { writeAudit } from "../utils/audit";
import {
    getPaginationParams,
    formatPaginatedResponse,
} from "../utils/pagination";

export const DataManagementController = {
    /**
     * Imports employees from an uploaded file, creating or updating records.
     *
     * @param req - Express request object containing the uploaded file and optional folderId in body.
     * @param res - Express response object used to return import summary.
     * @returns JSON response with success status, message, and created/updated counts.
     * @throws {CustomError} If no file is provided in the request.
     */
    importEmployees: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const userId = req.user?.id ? Number(req.user.id) : 0;
            const file = req.file;

            if (!file) {
                throw new CustomError(httpStatus.BAD_REQUEST, "File is required");
            }

            const { data, folderId } = req.body;

            const result = await dataManagementService.importEmployees(
                companyId, userId, file, data, folderId,
            );

            await writeAudit(req, {
                action: "IMPORT",
                resource: "Employee",
                resourceId: result.attachmentId,
                newValue: result,
            });

            res.status(httpStatus.CREATED).json({
                success: true,
                message: `Imported ${result.created} employees, updated ${result.updated}`,
                data: result,
            });
        },
    ),

    /**
     * Imports attendance records from an uploaded file for a specific payroll period.
     *
     * @param req - Express request object containing the uploaded file, payrollPeriodId, and optional folderId in body.
     * @param res - Express response object used to return import summary.
     * @returns JSON response with success status, message, and imported record count.
     * @throws {CustomError} If no file is provided in the request.
     */
    importAttendance: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const userId = req.user?.id ? Number(req.user.id) : 0;
            const file = req.file;

            if (!file) {
                throw new CustomError(httpStatus.BAD_REQUEST, "File is required");
            }

            const { data, payrollPeriodId, folderId } = req.body;

            const result = await dataManagementService.importAttendance(
                companyId, userId, file, data, payrollPeriodId, folderId,
            );

            await writeAudit(req, {
                action: "IMPORT",
                resource: "Attendance",
                resourceId: result.attachmentId,
                newValue: result,
            });

            res.status(httpStatus.CREATED).json({
                success: true,
                message: `Imported ${result.imported} attendance records`,
                data: result,
            });
        },
    ),

    /**
     * Imports manual adjustments from an uploaded file.
     *
     * @param req - Express request object containing the uploaded file and optional folderId in body.
     * @param res - Express response object used to return import summary.
     * @returns JSON response with success status, message, and created adjustment count.
     * @throws {CustomError} If no file is provided in the request.
     */
    importAdjustments: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const userId = req.user?.id ? Number(req.user.id) : 0;
            const file = req.file;

            if (!file) {
                throw new CustomError(httpStatus.BAD_REQUEST, "File is required");
            }

            const { data, folderId } = req.body;

            const result = await dataManagementService.importAdjustments(
                companyId, userId, file, data, folderId,
            );

            await writeAudit(req, {
                action: "IMPORT",
                resource: "ManualAdjustment",
                resourceId: result.attachmentId,
                newValue: result,
            });

            res.status(httpStatus.CREATED).json({
                success: true,
                message: `Imported ${result.created} adjustments`,
                data: result,
            });
        },
    ),

    /**
     * Retrieves a paginated history of all data imports for the company.
     *
     * @param req - Express request object with pagination query parameters.
     * @param res - Express response object used to return paginated import history.
     * @returns JSON response with paginated import history data.
     */
    getImportHistory: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { page, limit, skip, take } = getPaginationParams(req);

            const { imports, totalItems } = await dataManagementService.getImportHistory(
                companyId, skip, take,
            );

            const response = formatPaginatedResponse(
                imports, totalItems, page, limit, "Import history fetched successfully",
            );

            res.status(httpStatus.OK).json(response);
        },
    ),

    /**
     * Retrieves a single import record by its ID.
     *
     * @param req - Express request object with import ID in params.
     * @param res - Express response object used to return import record.
     * @returns JSON response with success status and import record data.
     */
    getImportById: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;

            const record = await dataManagementService.getImportById(companyId, id);

            res.status(httpStatus.OK).json({
                success: true,
                message: "Import record fetched successfully",
                data: record,
            });
        },
    ),
};
