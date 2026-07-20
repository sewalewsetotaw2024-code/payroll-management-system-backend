import { z } from "zod";

export const runPayrollSchema = z.object({
    body: z.object({
        payrollPeriodId: z.string().uuid("payrollPeriodId must be a valid UUID"),
        batchId: z.string().uuid("batchId must be a valid UUID").optional(),
        employeeId: z.string().uuid("employeeId must be a valid UUID").optional(),
        page: z.coerce.number().int().positive().optional().default(1),
        limit: z.coerce.number().int().positive().max(500).optional().default(100),
    }),
});

export const getPayrollRunsSchema = z.object({
    query: z.object({
        page: z.coerce.number().int().positive().optional().default(1),
        limit: z.coerce.number().int().positive().max(100).optional().default(20),
        payrollPeriodId: z.string().uuid().optional(),
    }),
});

export const getEmployeeStatsSchema = z.object({
    query: z.object({
        payrollPeriodId: z.string().uuid("payrollPeriodId must be a valid UUID"),
    }),
});

export const getPayrollRunSchema = z.object({
    params: z.object({
        id: z.string().uuid("Run ID must be a valid UUID"),
    }),
});

export const getPayrollRunItemsSchema = z.object({
    params: z.object({
        id: z.string().uuid("Run ID must be a valid UUID"),
    }),
    query: z.object({
        page: z.coerce.number().int().positive().optional().default(1),
        limit: z.coerce.number().int().positive().max(1000).optional().default(20),
    }),
});

export const getPayrollRunItemSchema = z.object({
    params: z.object({
        id: z.string().uuid("Run ID must be a valid UUID"),
        itemId: z.string().uuid("Item ID must be a valid UUID"),
    }),
});
