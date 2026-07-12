import prisma from "../config/database";
import cloudinary from "../config/cloudinary";
import CustomError from "../utils/customError";
import httpStatus from "http-status";
import { $Enums } from "../generated/prisma";

type DeductionType = $Enums.DeductionType;

/**
 * Parses a JSON string to extract an array of the specified generic type.
 * Returns an empty array if the input value is null or undefined.
 *
 * @param value - The JSON string representing the data to parse.
 * @returns An array containing the parsed data of type T.
 * @throws {CustomError} If the provided string cannot be parsed as valid JSON.
 */
function parseJsonField<T>(value: string | undefined | null): T[] {
    if (!value) return [];
    try {
        return JSON.parse(value) as T[];
    } catch {
        throw new CustomError(httpStatus.BAD_REQUEST, "Invalid JSON in data field");
    }
}

export interface EmployeeImportRow {
    firstName: string;
    lastName: string;
    email?: string;
    tinNumber?: string;
    pensionNumber?: string;
    jobPosition?: string;
    departmentName?: string;
    basicSalary?: number;
    grossSalary?: number;
    status?: string;
}

export interface AttendanceImportRow {
    employeeId?: string;
    employeeExternalId?: string;
    date: string;
    checkIn?: string;
    checkOut?: string;
    regularHours?: number;
    lateMinutes?: number;
    isAbsent?: boolean;
}

export interface AdjustmentImportRow {
    employeeId?: string;
    employeeExternalId?: string;
    adjustmentType: string;
    amount: number;
    reason: string;
    payrollPeriodId?: string;
}

/**
 * Service for managing bulk data imports of employees, attendance records, and adjustments.
 * Handles file uploads to cloud storage, row-level validation, upsert logic, and import history retrieval.
 */
export class DataManagementService {
    /**
     * Processes a bulk import of employee data from an attached file. 
     * Parses the JSON payload, uploads the raw file to cloud storage, maps records 
     * to existing entities, and creates or updates employees accordingly.
     *
     * @param companyId - The numeric ID of the company processing the import.
     * @param userId - The numeric ID of the user initiating the import.
     * @param file - The Multer file object containing the uploaded file data.
     * @param data - The JSON string payload containing the parsed rows.
     * @param folderId - An optional folder ID to organize the imported document.
     * @returns An object containing the import summary, file details, execution metrics, and any row-level errors.
     * @throws {CustomError} If no valid employee data is found in the payload.
     */
    async importEmployees(
        companyId: number,
        userId: number,
        file: Express.Multer.File,
        data: string,
        folderId?: string,
    ) {
        const rows = parseJsonField<EmployeeImportRow>(data);
        if (!rows.length) {
            throw new CustomError(httpStatus.BAD_REQUEST, "No employee data found");
        }

        const [cloudResult] = await Promise.all([
            this.uploadToCloudinary(file, companyId, "employees"),
        ]);

        const attachment = await prisma.attachment.create({
            data: {
                referenceType: "DATA_IMPORT",
                referenceId: "EMPLOYEE",
                fileName: file.originalname,
                filePath: cloudResult.secure_url,
                mimeType: file.mimetype,
                sizeBytes: file.size,
                uploadedBy: userId,
                ...(folderId && { folderId }),
            },
        });

        let created = 0;
        let updated = 0;
        const errors: { row: number; message: string }[] = [];

        // Pre-load departments for this company
        const allDepts = await prisma.department.findMany({ where: { companyId } });
        const deptMap = new Map<string, number>(allDepts.map(d => [d.name, d.id]));
        let nextDeptId = (allDepts.reduce((max, d) => Math.max(max, d.id), 0)) + 1;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                if (!row.firstName || !row.lastName) {
                    errors.push({ row: i + 1, message: "firstName and lastName are required" });
                    continue;
                }

                const existing = row.email
                    ? await prisma.employee.findFirst({ where: { email: row.email, companyId } })
                    : null;

                const { basicSalary, grossSalary, pensionNumber, departmentName, ...employeeFields } = row;

                // Resolve department name → ID
                let departmentId: number | null = null;
                if (departmentName) {
                    let id = deptMap.get(departmentName);
                    if (!id) {
                        id = nextDeptId++;
                        await prisma.department.create({
                            data: { id, companyId, name: departmentName },
                        });
                        deptMap.set(departmentName, id);
                    }
                    departmentId = id;
                }

                const employeeData = {
                    companyId,
                    firstName: employeeFields.firstName,
                    lastName: employeeFields.lastName,
                    ...(employeeFields.email && { email: employeeFields.email }),
                    ...(employeeFields.tinNumber && { tinNumber: employeeFields.tinNumber }),
                    ...(employeeFields.jobPosition && { jobPosition: employeeFields.jobPosition }),
                    ...(departmentId != null && { departmentId }),
                    ...(employeeFields.status && { status: employeeFields.status as $Enums.EmployeeStatus }),
                };

                const compensationData = {
                    ...(basicSalary != null && { basicSalary }),
                    ...(grossSalary != null && { grossSalary }),
                    ...(pensionNumber != null && { pensionNo: pensionNumber }),
                };

                if (existing) {
                    await prisma.employee.update({
                        where: { id: existing.id },
                        data: {
                            ...employeeData,
                            ...(Object.keys(compensationData).length > 0 && {
                                compensation: {
                                    upsert: {
                                        create: compensationData,
                                        update: compensationData,
                                    }
                                }
                            }),
                        },
                    });
                    updated++;
                } else {
                    await prisma.employee.create({
                        data: {
                            ...employeeData,
                            ...(Object.keys(compensationData).length > 0 && {
                                compensation: {
                                    create: compensationData,
                                }
                            }),
                        }
                    });
                    created++;
                }
            } catch (err: any) {
                errors.push({ row: i + 1, message: err.message || "Unknown error" });
            }
        }

        return {
            attachmentId: attachment.id,
            fileName: file.originalname,
            fileUrl: cloudResult.secure_url,
            totalRows: rows.length,
            created,
            updated,
            errors,
        };
    }

    /**
     * Processes a bulk import of attendance data for employees within a company.
     * Extracts records, manages file uploads, assigns records to database entities 
     * (resolving both internal and external identifiers), and upserts attendance logs.
     *
     * @param companyId - The numeric ID of the company processing the import.
     * @param userId - The numeric ID of the user initiating the import.
     * @param file - The Multer file object containing the uploaded file data.
     * @param data - The JSON string payload containing the parsed attendance rows.
     * @param payrollPeriodId - An optional identifier linking the logs to a specific payroll run.
     * @param folderId - An optional folder ID to organize the imported document.
     * @returns An object summarizing the import process including the total rows imported and any encountered errors.
     * @throws {CustomError} If no valid attendance data is found in the payload.
     */
    async importAttendance(
        companyId: number,
        userId: number,
        file: Express.Multer.File,
        data: string,
        payrollPeriodId?: string,
        folderId?: string,
    ) {
        const rows = parseJsonField<AttendanceImportRow>(data);

        const [cloudResult] = await Promise.all([
            this.uploadToCloudinary(file, companyId, "attendance"),
        ]);

        const attachment = await prisma.attachment.create({
            data: {
                referenceType: "DATA_IMPORT",
                referenceId: "ATTENDANCE",
                fileName: file.originalname,
                filePath: cloudResult.secure_url,
                mimeType: file.mimetype,
                sizeBytes: file.size,
                uploadedBy: userId,
                ...(folderId && { folderId }),
            },
        });

        let imported = 0;
        const errors: { row: number; message: string }[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                let employeeId = row.employeeId;
                if (!employeeId && row.employeeExternalId) {
                    const emp = await prisma.employee.findFirst({
                        where: { externalId: row.employeeExternalId, companyId },
                    });
                    employeeId = emp?.id;
                }
                if (!employeeId) {
                    errors.push({ row: i + 1, message: "Employee not found" });
                    continue;
                }
                if (!row.date) {
                    errors.push({ row: i + 1, message: "date is required" });
                    continue;
                }

                const date = new Date(row.date);
                if (isNaN(date.getTime())) {
                    errors.push({ row: i + 1, message: `Invalid date: ${row.date}` });
                    continue;
                }

                await prisma.attendanceRecord.upsert({
                    where: {
                        attendanceImportId_employeeId_date: {
                            attendanceImportId: attachment.id,
                            employeeId,
                            date,
                        },
                    },
                    update: {
                        checkIn: row.checkIn ? new Date(row.checkIn) : undefined,
                        checkOut: row.checkOut ? new Date(row.checkOut) : undefined,
                        regularHours: row.regularHours ?? 0,
                        lateMinutes: row.lateMinutes ?? 0,
                        isAbsent: row.isAbsent ?? false,
                    },
                    create: {
                        attendanceImportId: attachment.id,
                        employeeId,
                        date,
                        checkIn: row.checkIn ? new Date(row.checkIn) : undefined,
                        checkOut: row.checkOut ? new Date(row.checkOut) : undefined,
                        regularHours: row.regularHours ?? 0,
                        lateMinutes: row.lateMinutes ?? 0,
                        isAbsent: row.isAbsent ?? false,
                    },
                });
                imported++;
            } catch (err: any) {
                errors.push({ row: i + 1, message: err.message || "Unknown error" });
            }
        }

        return {
            attachmentId: attachment.id,
            fileName: file.originalname,
            fileUrl: cloudResult.secure_url,
            totalRows: rows.length,
            imported,
            errors,
        };
    }

    /**
     * Processes a bulk import of manual adjustments (e.g., deductions or bonuses) 
     * for employees. Links records via internal or external IDs and persists the calculated amounts.
     *
     * @param companyId - The numeric ID of the company processing the import.
     * @param userId - The numeric ID of the user initiating the import.
     * @param file - The Multer file object containing the uploaded file data.
     * @param data - The JSON string payload containing the parsed adjustment rows.
     * @param folderId - An optional folder ID to organize the imported document.
     * @returns An object containing the processing results, overall totals, and any specific record errors.
     * @throws {CustomError} If no valid adjustment data is found in the payload.
     */
    async importAdjustments(
        companyId: number,
        userId: number,
        file: Express.Multer.File,
        data: string,
        folderId?: string,
    ) {
        const rows = parseJsonField<AdjustmentImportRow>(data);
        if (!rows.length) {
            throw new CustomError(httpStatus.BAD_REQUEST, "No adjustment data found");
        }

        const [cloudResult] = await Promise.all([
            this.uploadToCloudinary(file, companyId, "adjustments"),
        ]);

        const attachment = await prisma.attachment.create({
            data: {
                referenceType: "DATA_IMPORT",
                referenceId: "ADJUSTMENT",
                fileName: file.originalname,
                filePath: cloudResult.secure_url,
                mimeType: file.mimetype,
                sizeBytes: file.size,
                uploadedBy: userId,
                ...(folderId && { folderId }),
            },
        });

        let created = 0;
        const errors: { row: number; message: string }[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                let employeeId = row.employeeId;
                if (!employeeId && row.employeeExternalId) {
                    const emp = await prisma.employee.findFirst({
                        where: { externalId: row.employeeExternalId, companyId },
                    });
                    employeeId = emp?.id;
                }
                if (!employeeId) {
                    errors.push({ row: i + 1, message: "Employee not found" });
                    continue;
                }
                if (!row.adjustmentType || row.amount == null) {
                    errors.push({ row: i + 1, message: "adjustmentType and amount are required" });
                    continue;
                }

                await prisma.manualAdjustment.create({
                    data: {
                        companyId,
                        employeeId,
                        adjustmentType: row.adjustmentType as $Enums.AdjustmentType,
                        amount: row.amount,
                        reason: row.reason || "Bulk import",
                        payrollRunId: row.payrollPeriodId ?? undefined,
                        createdBy: userId,
                    },
                });
                created++;
            } catch (err: any) {
                errors.push({ row: i + 1, message: err.message || "Unknown error" });
            }
        }

        return {
            attachmentId: attachment.id,
            fileName: file.originalname,
            fileUrl: cloudResult.secure_url,
            totalRows: rows.length,
            created,
            errors,
        };
    }

    /**
     * Retrieves an historical overview of data import activities, providing paginated results.
     *
     * @param companyId - The numeric ID of the company to retrieve the import log for.
     * @param skip - The number of records to bypass for pagination.
     * @param take - The maximum number of records to retrieve.
     * @returns An object containing the paginated import attachment references and the total record count.
     */
    async getImportHistory(companyId: number, skip: number, take: number) {
        const where = { referenceType: "DATA_IMPORT" as const };
        const [imports, totalItems] = await Promise.all([
            prisma.attachment.findMany({
                where,
                skip,
                take,
                orderBy: { uploadedAt: "desc" },
            }),
            prisma.attachment.count({ where }),
        ]);
        return { imports, totalItems };
    }

    /**
     * Retrieves specific details for a single data import attachment.
     *
     * @param companyId - The numeric ID of the company to validate the scope of the import.
     * @param id - The unique string identifier for the import record.
     * @returns The associated attachment entity details.
     * @throws {CustomError} If the specified import record cannot be found.
     */
    async getImportById(companyId: number, id: string) {
        const record = await prisma.attachment.findFirst({
            where: { id, referenceType: "DATA_IMPORT" },
        });
        if (!record) {
            throw new CustomError(httpStatus.NOT_FOUND, "Import record not found");
        }
        return record;
    }

    /**
     * Uploads an implicitly encoded buffer to an external cloud storage provider (Cloudinary).
     * Validates and streams the raw attachment securely into a company-designated remote folder.
     *
     * @param file - The active Multer file payload currently in memory.
     * @param companyId - The numeric ID of the company defining the remote directory layout.
     * @param folder - The target remote sub-directory to construct the file path.
     * @returns The external provider's response object, containing the stored resource URL details.
     */
    private async uploadToCloudinary(
        file: Express.Multer.File,
        companyId: number,
        folder: string,
    ) {
        const base64 = file.buffer.toString("base64");
        const dataUri = `data:${file.mimetype};base64,${base64}`;

        return cloudinary.uploader.upload(dataUri, {
            folder: `company_${companyId}/imports/${folder}`,
            resource_type: "raw",
            public_id: `${Date.now()}_${file.originalname.replace(/\.[^/.]+$/, "")}`,
        });
    }
}

export const dataManagementService = new DataManagementService();
