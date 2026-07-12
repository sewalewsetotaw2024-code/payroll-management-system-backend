import prisma from "../config/database";
import CustomError from "../utils/customError";
import httpStatus from "http-status";

/**
 * Service for managing employee records within a company.
 * Provides paginated listing with search and filtering, and single-record retrieval.
 */
export class EmployeeService {
    /**
     * Retrieves a paginated, searchable list of employees for a given company.
     * Supports filtering by status and searching across name, email, job position, and department fields.
     *
     * @param companyId - The numeric ID of the company to query employees for.
     * @param options - Optional search, status, page, and limit parameters.
     * @param options.search - A search string to filter employees by name, email, job position, or department.
     * @param options.status - An optional status filter for the employees.
     * @param options.page - The page number for pagination (defaults to 1).
     * @param options.limit - The maximum number of records per page (defaults to 100).
     * @returns An object containing the paginated employee list, total count, current page, limit, and total pages.
     */
    async getEmployees(
        companyId: number,
        options: {
            search?: string;
            status?: string;
            page?: number;
            limit?: number;
        } = {}
    ) {
        const { search, status, page = 1, limit = 100 } = options;
        const skip = (page - 1) * limit;

        const where: any = {
            companyId,
            ...(status && { status }),
        };

        if (search && search.trim()) {
            where.OR = [
                { firstName: { contains: search.trim(), mode: 'insensitive' as any } },
                { lastName: { contains: search.trim(), mode: 'insensitive' as any } },
                { email: { contains: search.trim(), mode: 'insensitive' as any } },
                { jobPosition: { contains: search.trim(), mode: 'insensitive' as any } },
                { department: { name: { contains: search.trim(), mode: 'insensitive' as any } } },
            ];
        }

        const [employees, totalItems] = await Promise.all([
            prisma.employee.findMany({
                where,
                skip,
                take: limit,
                select: {
                    id: true,
                    externalId: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    tinNumber: true,
                    jobPosition: true,
                    department: { select: { name: true } },
                    managerName: true,
                    hireDate: true,
                    status: true,
                    currency: true,
                    createdAt: true,
                    syncedAt: true,
                    profile: true,
                    compensation: {
                        select: {
                            basicSalary: true,
                            grossSalary: true,
                            taxablePay: true,
                            csBalance: true,
                            pensionElig: true,
                            taxExempt: true,
                            pensionNo: true,
                        }
                    },
                    allowances: {
                        where: { isActive: true },
                        select: {
                            allowanceType: true,
                            amount: true,
                        }
                    },
                },
                orderBy: [
                    { firstName: 'asc' },
                    { lastName: 'asc' },
                ],
            }),
            prisma.employee.count({ where }),
        ]);

        // Flatten compensation, department, and allowances fields to maintain API contract
        const mappedEmployees = employees.map(emp => {
            const findAmt = (type: string) => emp.allowances.find(a => a.allowanceType === type)?.amount ?? 0;
            return {
                ...emp,
                departmentName: emp.department?.name ?? null,
                gender: (emp.profile as any)?.gender ?? null,
                employmentType: (emp.profile as any)?.employmentType ?? null,
                basicSalary: emp.compensation?.basicSalary ?? null,
                grossSalary: emp.compensation?.grossSalary ?? null,
                taxableRemuneration: emp.compensation?.taxablePay ?? null,
                costSharingBalance: emp.compensation?.csBalance ?? null,
                isPensionEligible: emp.compensation?.pensionElig ?? null,
                isTaxExempt: emp.compensation?.taxExempt ?? null,
                pensionNumber: emp.compensation?.pensionNo ?? null,
                transportationAllowance: findAmt('TRANSPORTATION'),
                telephoneAllowance: findAmt('TELEPHONE'),
                representationAllowance: findAmt('REPRESENTATION'),
                housingAllowance: findAmt('HOUSING'),
                mealAllowance: findAmt('MEAL'),
                otherPayments: findAmt('OTHER'),
                department: undefined,
                compensation: undefined,
                allowances: undefined,
                profile: undefined,
            };
        });

        return {
            employees: mappedEmployees,
            totalItems,
            page,
            limit,
            totalPages: Math.ceil(totalItems / limit),
        };
    }

    /**
     * Retrieves a single employee by ID, ensuring it belongs to the specified company.
     * Includes the employee's active deductions in the response.
     *
     * @param companyId - The numeric ID of the company to scope the query.
     * @param id - The unique string ID of the employee to retrieve.
     * @returns The employee record with associated active deductions.
     * @throws {CustomError} If the employee is not found or does not belong to the company.
     */
    async getEmployeeById(companyId: number, id: string) {
        const employee = await prisma.employee.findFirst({
            where: { id, companyId },
            include: {
                compensation: true,
                profile: true,
                department: true,
                allowances: {
                    where: { isActive: true },
                    select: { allowanceType: true, amount: true }
                },
                employeeDeductions: {
                    where: { isActive: true },
                    include: { paymentPlan: true },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!employee) {
            throw new CustomError(httpStatus.NOT_FOUND, "Employee not found or unauthorized");
        }

        // Flatten nested fields to maintain API contract
        const { compensation, profile, department, allowances, ...empData } = employee;
        const findAmt = (type: string) => allowances.find(a => a.allowanceType === type)?.amount ?? 0;

        return {
            ...empData,
            departmentName: department?.name ?? null,
            gender: profile?.gender ?? null,
            employmentType: profile?.employmentType ?? null,
            probationEndDate: profile?.probationEndDate ?? null,
            employmentEndDate: profile?.employmentEndDate ?? null,
            placeOfWork: profile?.placeOfWork ?? null,
            contractReference: profile?.contractReference ?? null,
            basicSalary: compensation?.basicSalary ?? null,
            grossSalary: compensation?.grossSalary ?? null,
            taxableRemuneration: compensation?.taxablePay ?? null,
            costSharingBalance: compensation?.csBalance ?? null,
            isPensionEligible: compensation?.pensionElig ?? null,
            isTaxExempt: compensation?.taxExempt ?? null,
            pensionNumber: compensation?.pensionNo ?? null,
            transportationAllowance: findAmt('TRANSPORTATION'),
            telephoneAllowance: findAmt('TELEPHONE'),
            representationAllowance: findAmt('REPRESENTATION'),
            housingAllowance: findAmt('HOUSING'),
            mealAllowance: findAmt('MEAL'),
            otherPayments: findAmt('OTHER'),
        };
    }
}

export const employeeService = new EmployeeService();
