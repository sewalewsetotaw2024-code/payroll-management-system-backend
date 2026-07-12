import type { Request, Response } from "express";
import httpStatus from "http-status";
import asyncHandler from "../utils/asyncHandler";
import CustomError from "../utils/customError";
import { payrollRunService } from "../services/payrollRun.service";
import { writeAudit } from "../utils/audit";
import { resolveCompanyId } from "../utils/roleGuard";
import { getPaginationParams, formatPaginatedResponse } from "../utils/pagination";

export const PayrollRunController = {
    /**
     * Runs payroll for a given period, generating pay items for all eligible employees.
     *
     * @param req - Express request object containing payrollPeriodId, page, and limit in body.
     * @param res - Express response object used to return payroll run result.
     * @returns JSON response with success status and created payroll run data.
     * @throws {CustomError} If user ID is not found in the request.
     */
    runPayroll: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req);
        const userId = (req as any).user?.id;
        const { payrollPeriodId, page = 1, limit = 100, batchId, employeeId } = req.body;

        if (!userId) {
            throw new CustomError(httpStatus.UNAUTHORIZED, "User ID not found");
        }

        const result = await payrollRunService.runPayroll(
            companyId,
            Number(userId),
            payrollPeriodId,
            Number(page),
            Number(limit),
            batchId,
            employeeId,
        );

        await writeAudit(req, {
            action: "CREATE",
            resource: "PayrollRun",
            resourceId: result.payrollRunId,
            newValue: { payrollPeriodId, page, limit, batchId, employeeId },
        });

        res.status(httpStatus.CREATED).json({
            success: true,
            message: "Payroll processed successfully",
            data: result,
        });
    }),

    /**
     * Retrieves a paginated list of all payroll runs for the company.
     *
     * @param req - Express request object with pagination query parameters.
     * @param res - Express response object used to return paginated payroll runs.
     * @returns JSON response with paginated payroll runs data.
     */
    getPayrollRuns: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req);
        const { page, limit, skip, take } = getPaginationParams(req);
        const payrollPeriodId = req.query.payrollPeriodId as string | undefined;

        const { runs, totalItems } = await payrollRunService.getPayrollRuns(
            companyId,
            skip,
            take,
            payrollPeriodId,
        );

        const response = formatPaginatedResponse(
            runs,
            totalItems,
            page,
            limit,
            "Payroll runs fetched successfully",
        );
        res.status(httpStatus.OK).json(response);
    }),

    /**
     * Retrieves a single payroll run by its ID.
     *
     * @param req - Express request object with payroll run ID in params.
     * @param res - Express response object used to return payroll run.
     * @returns JSON response with success status and payroll run data.
     */
    getPayrollRun: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req);
        const { id } = req.params;

        const run = await payrollRunService.getPayrollRun(companyId, id);

        res.status(httpStatus.OK).json({
            success: true,
            message: "Payroll run fetched successfully",
            data: run,
        });
    }),

    /**
     * Retrieves a paginated list of pay items within a payroll run.
     *
     * @param req - Express request object with payroll run ID in params and pagination query parameters.
     * @param res - Express response object used to return paginated pay items.
     * @returns JSON response with paginated payroll run items data.
     */
    getPayrollRunItems: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req);
        const { id } = req.params;
        const { page, limit, skip, take } = getPaginationParams(req);

        const { items, totalItems } = await payrollRunService.getPayrollRunItems(
            companyId,
            id,
            skip,
            take,
        );

        const response = formatPaginatedResponse(
            items,
            totalItems,
            page,
            limit,
            "Payroll run items fetched successfully",
        );
        res.status(httpStatus.OK).json(response);
    }),

    /**
     * Retrieves a single payroll run item with all its detail records.
     *
     * @param req - Express request object with payroll run ID and item ID in params.
     * @param res - Express response object used to return pay item.
     * @returns JSON response with success status and payroll run item data.
     */
    getPayrollRunItem: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req);
        const { id, itemId } = req.params;

        const item = await payrollRunService.getPayrollRunItem(
            companyId,
            id,
            itemId,
        );

        res.status(httpStatus.OK).json({
            success: true,
            message: "Payroll run item fetched successfully",
            data: item,
        });
    }),
};
