import { z } from "zod";

const employeeImportRowSchema = z.object({
    firstName: z.string().min(1, "firstName is required"),
    lastName: z.string().min(1, "lastName is required"),
    email: z.string().email().optional().nullable(),
    tinNumber: z.string().optional().nullable(),
    pensionNumber: z.string().optional().nullable(),
    jobPosition: z.string().optional().nullable(),
    departmentName: z.string().optional().nullable(),
    basicSalary: z.number().nonnegative().optional().nullable(),
    grossSalary: z.number().nonnegative().optional().nullable(),
    status: z.string().optional().nullable(),
});

const attendanceImportRowSchema = z.object({
    employeeId: z.string().optional().nullable(),
    employeeExternalId: z.string().optional().nullable(),
    date: z.string().min(1, "date is required"),
    checkIn: z.string().optional().nullable(),
    checkOut: z.string().optional().nullable(),
    regularHours: z.number().nonnegative().optional().nullable(),
    lateMinutes: z.number().int().nonnegative().optional().nullable(),
    isAbsent: z.boolean().optional().nullable(),
});

const adjustmentImportRowSchema = z.object({
    employeeId: z.string().optional().nullable(),
    employeeExternalId: z.string().optional().nullable(),
    adjustmentType: z.string().min(1, "adjustmentType is required"),
    amount: z.number().nonnegative("amount must be >= 0"),
    reason: z.string().min(1, "reason is required"),
    payrollPeriodId: z.string().optional().nullable(),
});

export const importEmployeesSchema = {
    body: z.object({
        data: z.string().min(1, "data is required"),
        folderId: z.string().uuid().optional(),
    }),
};

export const importAttendanceSchema = {
    body: z.object({
        data: z.string().min(1, "data is required"),
        payrollPeriodId: z.string().optional(),
        folderId: z.string().uuid().optional(),
    }),
};

export const importAdjustmentsSchema = {
    body: z.object({
        data: z.string().min(1, "data is required"),
        folderId: z.string().uuid().optional(),
    }),
};

export const getImportHistorySchema = {
    query: z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    }),
};
