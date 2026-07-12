import type { Request, Response } from "express";
import httpStatus from "http-status";
import asyncHandler from "../utils/asyncHandler";
import CustomError from "../utils/customError";
import { employeeDeductionService } from "../services/employeeDeduction.service";
import { resolveCompanyId } from "../utils/roleGuard";
import {
    getPaginationParams,
    formatPaginatedResponse,
} from "../utils/pagination";
import { $Enums } from "../generated/prisma";

type EmployeeDeductionStatus = $Enums.EmployeeDeductionStatus;
type DeductionCalculationType = $Enums.DeductionCalculationType;

export const EmployeeDeductionController = {
    /**
     * Creates a new employee deduction with validation for calculation type and amounts.
     *
     * @param req - Express request object containing deduction details (employeeId, deductionType, label, calculationType, amounts, etc.) in body.
     * @param res - Express response object used to return created deduction.
     * @returns JSON response with success status and created employee deduction data.
     * @throws {CustomError} If required fields are missing or calculation type validation fails.
     */
    createEmployeeDeduction: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const {
                employeeId,
                deductionType,
                label,
                calculationType,
                deductionItemId,
                amount,
                percent,
                totalAmount,
                numInstallments,
                startDate,
                endDate,
                effectivePeriodId,
                description,
                refNo,
                priority,
                prorated,
            } = req.body;

            if (!employeeId || !deductionType || !label || !calculationType) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    "employeeId, deductionType, label, and calculationType are required",
                );
            }

            const validCalculationTypes: DeductionCalculationType[] = [
                "FIXED_AMOUNT",
                "PERCENTAGE_OF_BASIC",
                "PERCENTAGE_OF_GROSS",
                "REMAINING_BALANCE",
            ];
            if (!validCalculationTypes.includes(calculationType as DeductionCalculationType)) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    `calculationType must be one of: ${validCalculationTypes.join(", ")}`,
                );
            }

            if (calculationType === "FIXED_AMOUNT" && (amount == null || amount < 0)) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    "amount is required and must be >= 0 when calculationType is FIXED_AMOUNT",
                );
            }
            if ((calculationType === "PERCENTAGE_OF_BASIC" || calculationType === "PERCENTAGE_OF_GROSS") &&
                (percent == null || percent < 0 || percent > 100)) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    "percent is required and must be 0–100 for percentage calculation types",
                );
            }

            const employeeDeduction = await employeeDeductionService.createEmployeeDeduction(
                companyId,
                employeeId,
                deductionType,
                label,
                calculationType as DeductionCalculationType,
                {
                    deductionItemId,
                    amount,
                    percent,
                    totalAmount,
                    numInstallments,
                    startDate,
                    endDate,
                    effectivePeriodId,
                    description,
                    refNo,
                    priority,
                    prorated,
                }
            );

            res.status(httpStatus.CREATED).json({
                success: true,
                message: "Employee deduction created successfully",
                data: employeeDeduction,
            });
        },
    ),

    /**
     * Updates an existing employee deduction's details, status, and installment tracking.
     *
     * @param req - Express request object with deduction ID in params and updated fields in body.
     * @param res - Express response object used to return updated deduction.
     * @returns JSON response with success status and updated employee deduction data.
     */
    updateEmployeeDeduction: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const {
                label,
                calculationType,
                amount,
                percent,
                totalAmount,
                paidAmount,
                remaining,
                numInstallments,
                paidInstallments,
                status,
                startDate,
                endDate,
                description,
                refNo,
                priority,
                prorated,
                isActive,
                deductionItemId,
            } = req.body;

            const employeeDeduction = await employeeDeductionService.updateEmployeeDeduction(
                companyId,
                id,
                {
                    label,
                    calculationType: calculationType as DeductionCalculationType,
                    amount,
                    percent,
                    totalAmount,
                    paidAmount,
                    remaining,
                    numInstallments,
                    paidInstallments,
                    status: status as EmployeeDeductionStatus,
                    startDate,
                    endDate,
                    description,
                    refNo,
                    priority,
                    prorated,
                    isActive,
                    deductionItemId,
                }
            );

            res.status(httpStatus.OK).json({
                success: true,
                message: "Employee deduction updated successfully",
                data: employeeDeduction,
            });
        },
    ),

    /**
     * Retrieves a single employee deduction by its ID.
     *
     * @param req - Express request object with deduction ID in params.
     * @param res - Express response object used to return deduction.
     * @returns JSON response with success status and employee deduction data.
     */
    getEmployeeDeduction: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;

            const employeeDeduction = await employeeDeductionService.getEmployeeDeduction(
                companyId,
                id
            );

            res.status(httpStatus.OK).json({
                success: true,
                message: "Employee deduction fetched successfully",
                data: employeeDeduction,
            });
        },
    ),

    /**
     * Retrieves a paginated list of employee deductions filtered by employee, status, or search.
     *
     * @param req - Express request object with employeeId, deductionItemId, status, and search query parameters.
     * @param res - Express response object used to return paginated deductions.
     * @returns JSON response with paginated employee deductions data.
     */
    getEmployeeDeductions: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { employeeId, deductionItemId, status, search } = req.query;
            const { page, limit, skip, take } = getPaginationParams(req);

            const { deductions, totalItems } = await employeeDeductionService.getEmployeeDeductions(
                companyId,
                employeeId as string,
                deductionItemId as string,
                status as EmployeeDeductionStatus,
                search as string,
                skip,
                take
            );

            const response = formatPaginatedResponse(
                deductions,
                totalItems,
                page,
                limit,
                "Employee deductions fetched successfully",
            );

            res.status(httpStatus.OK).json(response);
        },
    ),

    /**
     * Retrieves all currently active deductions for a specific employee.
     *
     * @param req - Express request object with employeeId in params.
     * @param res - Express response object used to return active deductions.
     * @returns JSON response with success status and active deductions data.
     * @throws {CustomError} If employeeId is not provided.
     */
    getActiveEmployeeDeductions: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { employeeId } = req.params;

            if (!employeeId) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    "employeeId is required",
                );
            }

            const deductions = await employeeDeductionService.getActiveEmployeeDeductions(
                companyId,
                employeeId
            );

            res.status(httpStatus.OK).json({
                success: true,
                message: "Active employee deductions fetched successfully",
                data: deductions,
            });
        },
    ),

    /**
     * Cancels an employee deduction (soft delete) by its ID.
     *
     * @param req - Express request object with deduction ID in params and optional deductionItemId in query.
     * @param res - Express response object used to confirm deletion.
     * @returns JSON response with success status and cancelled deduction data.
     */
    deleteEmployeeDeduction: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const { deductionItemId } = req.query;

            const employeeDeduction = await employeeDeductionService.deleteEmployeeDeduction(
                companyId,
                id,
                deductionItemId as string | undefined
            );

            res.status(httpStatus.OK).json({
                success: true,
                message: "Employee deduction cancelled successfully",
                data: employeeDeduction,
            });
        },
    ),

    /**
     * Records a payment against an employee deduction, reducing the remaining balance.
     *
     * @param req - Express request object with deduction ID in params and paymentAmount, payrollRunItemId, periodId in body.
     * @param res - Express response object used to return updated deduction.
     * @returns JSON response with success status and updated deduction data.
     * @throws {CustomError} If paymentAmount is missing or negative.
     */
    recordPayment: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const { paymentAmount, payrollRunItemId, periodId } = req.body;

            if (paymentAmount == null || paymentAmount < 0) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    "paymentAmount is required and must be >= 0",
                );
            }

            const employeeDeduction = await employeeDeductionService.recordPayment(
                companyId,
                id,
                paymentAmount,
                {
                    payrollRunItemId,
                    periodId,
                }
            );

            res.status(httpStatus.OK).json({
                success: true,
                message: "Payment recorded successfully",
                data: employeeDeduction,
            });
        },
    ),

    /**
     * Assigns a deduction configuration to multiple employees, optionally assigning to all.
     *
     * @param req - Express request object containing deductionConfigId, assignments array, and assignAllEmployees flag in body.
     * @param res - Express response object used to return assignment result.
     * @returns JSON response with success status and assigned count.
     * @throws {CustomError} If deductionConfigId is missing, or assignments array is missing when assignAllEmployees is not set.
     */
    bulkAssignEmployeeDeductions: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const {
                deductionConfigId,
                assignments,
                assignAllEmployees,
            } = req.body;

            if (!deductionConfigId) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    "deductionConfigId is required",
                );
            }

            if (!assignAllEmployees && (!Array.isArray(assignments) || assignments.length === 0)) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    "assignments array is required when assignAllEmployees is not set",
                );
            }

            const result = await employeeDeductionService.bulkAssignEmployeeDeductions(
                companyId,
                deductionConfigId,
                assignments || [],
                { assignAllEmployees },
            );

            res.status(httpStatus.OK).json({
                success: true,
                message: `${result.assignedCount} employee deductions created successfully`,
                data: result,
            });
        },
    ),
};
