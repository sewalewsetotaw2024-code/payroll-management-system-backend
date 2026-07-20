import prisma from "../config/database";
import CustomError from "../utils/customError";
import httpStatus from "http-status";
import ExcelJS from "exceljs";

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

    async exportToExcel(
        companyId: number,
        options: { search?: string; status?: string } = {}
    ): Promise<Buffer> {
        const { search, status } = options;

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

        const employees = await prisma.employee.findMany({
            where,
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
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
                    select: { allowanceType: true, amount: true }
                },
            },
        });

        // Flatten nested data
        const findAmt = (type: string, allowances: { allowanceType: string; amount: any }[]) =>
            allowances.find(a => a.allowanceType === type)?.amount ?? 0;

        const rows = employees.map(emp => ({
            employeeId: emp.externalId ?? '',
            firstName: emp.firstName,
            lastName: emp.lastName,
            email: emp.email ?? '',
            gender: (emp.profile as any)?.gender ?? '',
            jobPosition: emp.jobPosition ?? '',
            department: emp.department?.name ?? '',
            managerName: emp.managerName ?? '',
            employmentType: (emp.profile as any)?.employmentType ?? '',
            hireDate: emp.hireDate ? new Date(emp.hireDate).toLocaleDateString() : '',
            status: emp.status,
            tinNumber: emp.tinNumber ?? '',
            pensionNumber: emp.compensation?.pensionNo ?? '',
            basicSalary: emp.compensation?.basicSalary ? Number(emp.compensation.basicSalary) : 0,
            grossSalary: emp.compensation?.grossSalary ? Number(emp.compensation.grossSalary) : 0,
            taxableRemuneration: emp.compensation?.taxablePay ? Number(emp.compensation.taxablePay) : 0,
            transportAllowance: Number(findAmt('TRANSPORTATION', emp.allowances)),
            housingAllowance: Number(findAmt('HOUSING', emp.allowances)),
            mealAllowance: Number(findAmt('MEAL', emp.allowances)),
            telephoneAllowance: Number(findAmt('TELEPHONE', emp.allowances)),
            representationAllowance: Number(findAmt('REPRESENTATION', emp.allowances)),
            otherPayments: Number(findAmt('OTHER', emp.allowances)),
            costSharingBalance: emp.compensation?.csBalance ? Number(emp.compensation.csBalance) : 0,
            pensionEligible: emp.compensation?.pensionElig ? 'Yes' : 'No',
            taxExempt: emp.compensation?.taxExempt ? 'Yes' : 'No',
            placeOfWork: (emp.profile as any)?.placeOfWork ?? '',
            contractReference: (emp.profile as any)?.contractReference ?? '',
        }));

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Payroll System';
        workbook.created = new Date();
        const sheet = workbook.addWorksheet('Employees');

        // Define columns
        const columns: Partial<ExcelJS.Column>[] = [
            { header: 'Employee ID', key: 'employeeId', width: 18 },
            { header: 'First Name', key: 'firstName', width: 18 },
            { header: 'Last Name', key: 'lastName', width: 18 },
            { header: 'Email', key: 'email', width: 28 },
            { header: 'Gender', key: 'gender', width: 10 },
            { header: 'Job Position', key: 'jobPosition', width: 22 },
            { header: 'Department', key: 'department', width: 18 },
            { header: 'Manager', key: 'managerName', width: 20 },
            { header: 'Employment Type', key: 'employmentType', width: 16 },
            { header: 'Hire Date', key: 'hireDate', width: 14 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'TIN Number', key: 'tinNumber', width: 18 },
            { header: 'Pension Number', key: 'pensionNumber', width: 18 },
            { header: 'Basic Salary', key: 'basicSalary', width: 16 },
            { header: 'Gross Salary', key: 'grossSalary', width: 16 },
            { header: 'Taxable Remuneration', key: 'taxableRemuneration', width: 20 },
            { header: 'Transport Allowance', key: 'transportAllowance', width: 18 },
            { header: 'Housing Allowance', key: 'housingAllowance', width: 18 },
            { header: 'Meal Allowance', key: 'mealAllowance', width: 16 },
            { header: 'Telephone Allowance', key: 'telephoneAllowance', width: 18 },
            { header: 'Representation Allowance', key: 'representationAllowance', width: 22 },
            { header: 'Other Payments', key: 'otherPayments', width: 16 },
            { header: 'Cost Sharing Balance', key: 'costSharingBalance', width: 20 },
            { header: 'Pension Eligible', key: 'pensionEligible', width: 16 },
            { header: 'Tax Exempt', key: 'taxExempt', width: 14 },
            { header: 'Place of Work', key: 'placeOfWork', width: 20 },
            { header: 'Contract Reference', key: 'contractReference', width: 20 },
        ];

        // Add data rows (or empty row with message)
        if (rows.length === 0) {
            sheet.addRow({});
            const msgRow = sheet.addRow({ employeeId: 'No employees found matching the current filters.' });
            msgRow.getCell(1).font = { italic: true, color: { argb: 'FF9CA3AF' } };
        } else {
            sheet.columns = columns;
            sheet.addRows(rows);
        }

        // Style header row
        const headerRow = sheet.getRow(1);
        headerRow.height = 28;
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF047857' } },
                bottom: { style: 'thin', color: { argb: 'FF047857' } },
            };
        });

        // Style data rows
        if (rows.length > 0) {
            sheet.eachRow((row, rowNum) => {
                if (rowNum === 1) return; // skip header
                row.eachCell((cell) => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    };
                    cell.alignment = { vertical: 'middle' };
                    // Alternating row background
                    if (rowNum % 2 === 0) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                    }
                });
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        return Buffer.from(buffer);
    }
}

export const employeeService = new EmployeeService();
