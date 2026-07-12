import type { Request, Response } from "express";
import httpStatus from "http-status";
import asyncHandler from "../utils/asyncHandler";
import { employeeService } from "../services/employee.service";
import { resolveCompanyId } from "../utils/roleGuard";

export const EmployeeController = {
    /**
     * Retrieves a paginated list of employees with optional search and status filters.
     *
     * @param req - Express request object with search, status, page, and limit query parameters.
     * @param res - Express response object used to return paginated employees.
     * @returns JSON response with success status, employee data, and pagination metadata.
     */
    getEmployees: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { search, status, page, limit } = req.query;

            const result = await employeeService.getEmployees(companyId, {
                search: search as string,
                status: status as string,
                page: page ? parseInt(page as string, 10) : 1,
                limit: limit ? parseInt(limit as string, 10) : 100,
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "Employees fetched successfully",
                data: result.employees,
                pagination: {
                    totalItems: result.totalItems,
                    totalPages: result.totalPages,
                    currentPage: result.page,
                    itemsPerPage: result.limit,
                },
            });
        },
    ),

    /**
     * Retrieves a single employee by their unique ID.
     *
     * @param req - Express request object with employee ID in params.
     * @param res - Express response object used to return employee.
     * @returns JSON response with success status and employee data.
     */
    getEmployeeById: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;

            const employee = await employeeService.getEmployeeById(companyId, id);

            res.status(httpStatus.OK).json({
                success: true,
                message: "Employee fetched successfully",
                data: employee,
            });
        },
    ),
};
