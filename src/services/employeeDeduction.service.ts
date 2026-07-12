import prisma from "../config/database";
import CustomError from "../utils/customError";
import httpStatus from "http-status";
import { $Enums } from "../generated/prisma";

type EmployeeDeductionStatus = $Enums.EmployeeDeductionStatus;
type DeductionCalculationType = $Enums.DeductionCalculationType;
type DeductionType = $Enums.DeductionType;
type Currency = $Enums.Currency;

/**
 * Service for managing employee-level deductions such as loans, advances, and garnishments.
 * Handles creation, update, retrieval, payment recording, and bulk assignment of deductions.
 */
export class EmployeeDeductionService {
    /**
     * Converts a value to a Date object, returning null for null/undefined inputs.
     *
     * @param value - A string, Date, null, or undefined value to convert.
     * @returns A Date object, or null if the input was null or undefined.
     */
    private toDate(value: string | Date | null | undefined): Date | null {
        if (value == null) return null;
        return typeof value === 'string' ? new Date(value) : value;
    }

    /**
     * Creates a new employee deduction linked to a specific employee within a company.
     * Validates that required fields (amount or percent) are present based on the calculation type.
     *
     * @param companyId - The numeric ID of the company.
     * @param employeeId - The ID of the employee to assign the deduction to.
     * @param deductionType - The type of deduction (e.g. LOAN, ADVANCE).
     * @param label - A human-readable label for the deduction.
     * @param calculationType - How the deduction amount is calculated (FIXED_AMOUNT, PERCENTAGE_OF_BASIC, etc.).
     * @param options - Additional optional parameters for the deduction configuration.
     * @returns The newly created employee deduction record.
     * @throws {CustomError} If the employee is not found or required calculation fields are missing.
     */
    async createEmployeeDeduction(
        companyId: number,
        employeeId: string,
        deductionType: DeductionType,
        label: string,
        calculationType: DeductionCalculationType,
        options: {
            deductionItemId?: string;
            amount?: number | null;
            percent?: number | null;
            totalAmount?: number | null;
            numInstallments?: number | null;
            startDate?: Date | string | null;
            endDate?: Date | string | null;
            effectivePeriodId?: string;
            description?: string;
            refNo?: string;
            priority?: number;
            prorated?: boolean;
        }
    ) {
        const employee = await prisma.employee.findFirst({
            where: { id: employeeId, companyId }
        });
        if (!employee) {
            throw new CustomError(httpStatus.NOT_FOUND, "Employee not found or unauthorized");
        }

        if (calculationType === 'FIXED_AMOUNT' && !options.amount) {
            throw new CustomError(httpStatus.BAD_REQUEST, "Amount is required for FIXED_AMOUNT calculation type");
        }
        if ((calculationType === 'PERCENTAGE_OF_BASIC' || calculationType === 'PERCENTAGE_OF_GROSS') && (options.percent == null)) {
            throw new CustomError(httpStatus.BAD_REQUEST, "Percent is required for percentage calculation types");
        }

        return prisma.employeeDeduction.create({
            data: {
                companyId,
                employeeId,
                deductionItemId: options.deductionItemId,
                deductionType,
                label,
                calculationType,
                amount: options.amount ?? undefined,
                percent: options.percent ?? undefined,
                status: 'ACTIVE' as EmployeeDeductionStatus,
                startDate: this.toDate(options.startDate) ?? undefined,
                endDate: this.toDate(options.endDate) ?? undefined,
                effectivePeriodId: options.effectivePeriodId,
                description: options.description,
                refNo: options.refNo,
                priority: options.priority ?? 0,
                isActive: true,
                prorated: options.prorated ?? undefined,
                paymentPlan: {
                    create: {
                        totalAmount: options.totalAmount ?? undefined,
                        paidAmount: 0,
                        remaining: options.totalAmount ?? undefined,
                        numInstallments: options.numInstallments ?? undefined,
                        paidInstallments: 0,
                    }
                }
            }
        });
    }

    /**
     * Updates an existing employee deduction. Prevents changes to the deductionItemId once set.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the deduction to update.
     * @param updates - Partial object containing the fields to update.
     * @returns The updated employee deduction record.
     * @throws {CustomError} If the deduction is not found or does not belong to the company.
     */
    async updateEmployeeDeduction(
        companyId: number,
        id: string,
        updates: {
            label?: string;
            calculationType?: DeductionCalculationType;
            amount?: number | null;
            percent?: number | null;
            totalAmount?: number | null;
            paidAmount?: number;
            remaining?: number | null;
            numInstallments?: number | null;
            paidInstallments?: number;
            status?: EmployeeDeductionStatus;
            startDate?: Date | string | null;
            endDate?: Date | string | null;
            description?: string;
            refNo?: string;
            priority?: number;
            prorated?: boolean;
            isActive?: boolean;
            deductionItemId?: string;
        }
    ) {
        const whereClause: any = { id, companyId };
        if (updates.deductionItemId) {
            whereClause.deductionItemId = updates.deductionItemId;
        }
        const existing = await prisma.employeeDeduction.findFirst({
            where: whereClause,
            include: { employee: true, paymentPlan: true }
        });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Employee deduction not found or unauthorized");
        }

        // deductionItemId must NOT be changed once set — remove it from the update payload
        const { deductionItemId: _, totalAmount, paidAmount, remaining, numInstallments, paidInstallments, refNo, ...rest } = updates;

        // Separate paymentPlan updates from employeeDeduction updates
        const paymentPlanData: any = {};
        if (totalAmount !== undefined) paymentPlanData.totalAmount = totalAmount;
        if (paidAmount !== undefined) paymentPlanData.paidAmount = paidAmount;
        if (remaining !== undefined) paymentPlanData.remaining = remaining;
        if (numInstallments !== undefined) paymentPlanData.numInstallments = numInstallments;
        if (paidInstallments !== undefined) paymentPlanData.paidInstallments = paidInstallments;

        return prisma.employeeDeduction.update({
            where: { id },
            data: {
                ...(rest.label !== undefined && { label: rest.label }),
                ...(rest.calculationType !== undefined && { calculationType: rest.calculationType }),
                ...(rest.amount !== undefined && { amount: rest.amount }),
                ...(rest.percent !== undefined && { percent: rest.percent }),
                ...(rest.status !== undefined && { status: rest.status }),
                ...(rest.startDate !== undefined && { startDate: this.toDate(rest.startDate) ?? undefined }),
                ...(rest.endDate !== undefined && { endDate: this.toDate(rest.endDate) ?? undefined }),
                ...(rest.description !== undefined && { description: rest.description }),
                ...(refNo !== undefined && { refNo }),
                ...(rest.priority !== undefined && { priority: rest.priority }),
                ...(rest.isActive !== undefined && { isActive: rest.isActive }),
                ...(rest.prorated !== undefined && { prorated: rest.prorated }),
                paymentPlan: Object.keys(paymentPlanData).length > 0 ? {
                    upsert: {
                        create: paymentPlanData,
                        update: paymentPlanData,
                    }
                } : undefined,
            }
        });
    }

    /**
     * Retrieves a single employee deduction by ID, scoped to a company.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the deduction to retrieve.
     * @returns The deduction record including the related employee data.
     * @throws {CustomError} If the deduction is not found.
     */
    async getEmployeeDeduction(companyId: number, id: string) {
        const deduction = await prisma.employeeDeduction.findFirst({
            where: { id, companyId },
            include: { employee: true, paymentPlan: true }
        });
        if (!deduction) {
            throw new CustomError(httpStatus.NOT_FOUND, "Employee deduction not found or unauthorized");
        }
        return deduction;
    }

    /**
     * Retrieves a paginated list of employee deductions with optional filtering by employee,
     * deduction config, status, and employee name search.
     *
     * @param companyId - The numeric ID of the company.
     * @param employeeId - Optional filter by employee ID.
     * @param deductionItemId - Optional filter by deduction configuration ID.
     * @param status - Optional filter by deduction status.
     * @param search - Optional search string to filter by employee first or last name.
     * @param skip - The number of records to skip for pagination (defaults to 0).
     * @param take - The number of records to take (defaults to 100).
     * @returns An object containing the deductions array and total count.
     */
    async getEmployeeDeductions(
        companyId: number,
        employeeId?: string,
        deductionItemId?: string,
        status?: EmployeeDeductionStatus,
        search?: string,
        skip: number = 0,
        take: number = 100
    ) {
        const whereArgs: any = {
            companyId,
            ...(employeeId && { employeeId }),
            ...(deductionItemId && { deductionItemId }),
            ...(status && { status }),
            ...(search && {
                employee: {
                    OR: [
                        { firstName: { contains: search, mode: 'insensitive' } },
                        { lastName: { contains: search, mode: 'insensitive' } },
                    ],
                },
            }),
        };

        const [deductions, totalItems] = await Promise.all([
            prisma.employeeDeduction.findMany({
                where: whereArgs,
                skip,
                take,
                include: { employee: true, paymentPlan: true },
                orderBy: { priority: 'asc' }
            }),
            prisma.employeeDeduction.count({ where: whereArgs })
        ]);

        return { deductions, totalItems };
    }

    /**
     * Retrieves all active deductions for a specific employee, ordered by priority.
     *
     * @param companyId - The numeric ID of the company.
     * @param employeeId - The ID of the employee to fetch deductions for.
     * @returns An array of active employee deduction records.
     */
    async getActiveEmployeeDeductions(companyId: number, employeeId: string) {
        return prisma.employeeDeduction.findMany({
            where: {
                companyId,
                employeeId,
                status: 'ACTIVE' as EmployeeDeductionStatus,
                isActive: true,
            },
            include: { paymentPlan: true },
            orderBy: { priority: 'asc' }
        });
    }

    /**
     * Soft-deletes an employee deduction by marking it as cancelled and inactive.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the deduction to delete.
     * @param deductionItemId - Optional filter by deduction configuration ID for additional safety.
     * @returns The updated deduction record with isActive set to false and status set to CANCELLED.
     * @throws {CustomError} If the deduction is not found.
     */
    async deleteEmployeeDeduction(companyId: number, id: string, deductionItemId?: string) {
        const whereClause: any = { id, companyId };
        if (deductionItemId) {
            whereClause.deductionItemId = deductionItemId;
        }
        const existing = await prisma.employeeDeduction.findFirst({
            where: whereClause
        });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Employee deduction not found or unauthorized");
        }
        return prisma.employeeDeduction.update({
            where: { id },
            data: { isActive: false, status: 'CANCELLED' as EmployeeDeductionStatus }
        });
    }

    /**
     * Records a payment against an employee deduction, updating paid amounts,
     * remaining balance, and automatically completing the deduction when fully paid.
     *
     * @param companyId - The numeric ID of the company.
     * @param employeeDeductionId - The ID of the deduction to record payment against.
     * @param paymentAmount - The amount being paid in this transaction.
     * @param options - Optional payroll run item ID and period ID for tracking.
     * @returns The updated deduction record with new paid amount and status.
     * @throws {CustomError} If the deduction is not found.
     */
    async recordPayment(
        companyId: number,
        employeeDeductionId: string,
        paymentAmount: number,
        options: {
            payrollRunItemId?: string;
            periodId?: string;
        } = {}
    ) {
        const deduction = await prisma.employeeDeduction.findFirst({
            where: { id: employeeDeductionId, companyId },
            include: { paymentPlan: true }
        });
        if (!deduction) {
            throw new CustomError(httpStatus.NOT_FOUND, "Employee deduction not found or unauthorized");
        }

        const plan = deduction.paymentPlan;
        const newPaidAmount = (plan?.paidAmount?.toNumber() ?? 0) + paymentAmount;
        const newPaidInstallments = (plan?.paidInstallments ?? 0) + 1;

        let newRemainingAmount: number | null = plan?.remaining?.toNumber() ?? null;
        let newStatus: EmployeeDeductionStatus = deduction.status;

        if (plan?.totalAmount !== null && plan?.totalAmount !== undefined) {
            newRemainingAmount = Math.max(0, (plan.totalAmount.toNumber() ?? 0) - newPaidAmount);
            if (newRemainingAmount <= 0) {
                newStatus = 'COMPLETED';
                newRemainingAmount = 0;
            }
        } else if (plan?.numInstallments !== null && plan?.numInstallments !== undefined) {
            if (newPaidInstallments >= plan.numInstallments) {
                newStatus = 'COMPLETED';
            }
        }

        return prisma.employeeDeduction.update({
            where: { id: employeeDeductionId },
            data: {
                status: newStatus,
                paymentPlan: {
                    upsert: {
                        create: {
                            paidAmount: newPaidAmount,
                            paidInstallments: newPaidInstallments,
                            remaining: newRemainingAmount ?? undefined,
                        },
                        update: {
                            paidAmount: newPaidAmount,
                            paidInstallments: newPaidInstallments,
                            remaining: newRemainingAmount ?? undefined,
                        },
                    }
                }
            }
        });
    }

    /**
     * Bulk assigns a deduction configuration to multiple employees in a single operation.
     * Per-employee values (amount, percent, calculationType) are taken from the request body,
     * as the DeductionItem config serves only as a template (label, type).
     *
     * @param companyId - The numeric ID of the company.
     * @param deductionConfigId - The ID of the deduction configuration to use as a template.
     * @param assignments - An array of per-employee value mappings including amount and/or percent.
     * @param options - Optional flag to assign to all active employees instead of specific ones.
     * @returns An object with assignedCount, skippedCount, and totalRequested counts.
     * @throws {CustomError} If the config is not found, no employees match, or required values are missing.
     */
    async bulkAssignEmployeeDeductions(
        companyId: number,
        deductionConfigId: string,
        assignments: {
            employeeId: string;
            amount?: number | null;
            percent?: number | null;
        }[],
        options?: {
            assignAllEmployees?: boolean;
        }
    ) {
        // 1. Fetch the deduction config as a template (label, deductionType only)
        const config = await prisma.deductionItem.findFirst({
            where: { id: deductionConfigId, isActive: true, salaryStructure: { companyId } }
        });
        if (!config) {
            throw new CustomError(httpStatus.NOT_FOUND, "Deduction config not found or unauthorized");
        }

        // 2. Determine employee IDs
        let employeeIds: string[];
        if (options?.assignAllEmployees) {
            const allEmployees = await prisma.employee.findMany({
                where: { companyId, status: 'ACTIVE' },
                select: { id: true }
            });
            employeeIds = allEmployees.map(e => e.id);
        } else {
            employeeIds = assignments.map(a => a.employeeId);
        }

        if (employeeIds.length === 0) {
            throw new CustomError(httpStatus.BAD_REQUEST, "No employees to assign");
        }

        // 3. Validate employees exist in the company
        const existingEmployees = await prisma.employee.findMany({
            where: { id: { in: employeeIds }, companyId },
            select: { id: true }
        });
        const existingIds = new Set(existingEmployees.map(e => e.id));
        const invalidIds = employeeIds.filter(id => !existingIds.has(id));
        if (invalidIds.length > 0) {
            throw new CustomError(httpStatus.BAD_REQUEST, `Employees not found: ${invalidIds.join(', ')}`);
        }

        // 4. Check for existing assignments (skip already-assigned)
        const existingAssignments = await prisma.employeeDeduction.findMany({
            where: {
                companyId,
                deductionItemId: deductionConfigId,
                employeeId: { in: employeeIds },
                isActive: true,
            },
            select: { employeeId: true }
        });
        const alreadyAssigned = new Set(existingAssignments.map(a => a.employeeId));

        // 5. Build create data from per-employee assignment values
        const createData = employeeIds
            .filter(id => !alreadyAssigned.has(id))
            .map(employeeId => {
                const assignment = assignments.find(a => a.employeeId === employeeId);

                let amount: number | undefined;
                let percent: number | undefined;
                let calcType: string;

                if (assignment?.amount != null) {
                    amount = assignment.amount;
                    percent = assignment?.percent ?? undefined;
                    calcType = 'FIXED_AMOUNT';
                } else if (assignment?.percent != null) {
                    percent = assignment.percent;
                    calcType = 'PERCENTAGE_OF_BASIC';
                } else if (options?.assignAllEmployees) {
                    // No per-employee values provided; create a placeholder reference
                    calcType = 'FIXED_AMOUNT';
                    amount = 0;
                } else {
                    throw new CustomError(httpStatus.BAD_REQUEST,
                        `Amount or percent is required for employee ${employeeId}`);
                }

                return {
                    companyId,
                    employeeId,
                    deductionItemId: deductionConfigId,
                    deductionType: config.deductionType,
                    label: config.label,
                    calculationType: calcType as any,
                    amount: amount ?? undefined,
                    percent: percent ?? undefined,
                    status: 'ACTIVE' as any,
                    isActive: true,
                    priority: 0,
                };
            });

        if (createData.length === 0) {
            return { assignedCount: 0, skippedCount: employeeIds.length, message: "All employees already assigned" };
        }

        // 7. Batch create in transaction (individual creates to support nested paymentPlan creation)
        const result = await prisma.$transaction(async (tx) => {
            let count = 0;
            for (const data of createData) {
                await tx.employeeDeduction.create({
                    data: {
                        ...data,
                        paymentPlan: {
                            create: {},
                        },
                    },
                });
                count++;
            }
            return { count };
        });

        return {
            assignedCount: result.count,
            skippedCount: alreadyAssigned.size,
            totalRequested: employeeIds.length
        };
    }
}

export const employeeDeductionService = new EmployeeDeductionService();
