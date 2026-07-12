import { z } from "zod";

/** POST /leave/sync */
export const syncLeaveSchema = z.object({
    body: z.object({
        fiscalYear: z.coerce.number().int().positive().optional(),
        payrollPeriodId: z.string().uuid().optional(),
    }),
});

/** GET /leave/balances */
export const getBalancesSchema = z.object({
    query: z.object({
        employeeId: z.string().optional(),
        fiscalYear: z.coerce.number().int().positive().optional(),
        leaveType: z.string().optional(),
    }),
});

/** GET /leave/applications */
export const getApplicationsSchema = z.object({
    query: z.object({
        employeeId: z.string().optional(),
        status: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
    }),
});

/** GET /leave/deductions */
export const getDeductionsSchema = z.object({
    query: z.object({
        payrollPeriodId: z.string().uuid().optional(),
        employeeId: z.string().optional(),
    }),
});

/** POST /leave/calculate-deductions */
export const calculateDeductionsSchema = z.object({
    body: z.object({
        payrollPeriodId: z.string().uuid("Payroll period ID is required"),
    }),
});

/** POST /leave/calculate-from-attendance */
export const calculateLeaveFromAttendanceSchema = z.object({
    body: z.object({
        payrollPeriodId: z.string().uuid("Payroll period ID is required"),
    }),
});

/** GET /leave/breakdown */
export const getLeaveBreakdownSchema = z.object({
    query: z.object({
        payrollRunItemId: z.string({ message: "PayrollRunItem ID is required" }),
    }),
});

/** POST /leave/sync-period — Sync leave for a single PayrollRunItem */
export const syncLeavePeriodSchema = z.object({
    body: z.object({
        companyId: z.coerce.number({ message: "Company ID is required" }),
        periodStart: z.string({ message: "Period start is required" }),
        periodEnd: z.string({ message: "Period end is required" }),
        payrollRunItemId: z.string({ message: "Payroll run item ID is required" }),
    }),
});

/** POST /leave/sync-period-run — Sync leave for ALL items in a PayrollRun */
export const syncLeavePeriodByRunSchema = z.object({
    body: z.object({
        companyId: z.coerce.number({ message: "Company ID is required" }),
        periodStart: z.string({ message: "Period start is required" }),
        periodEnd: z.string({ message: "Period end is required" }),
        payrollRunId: z.string({ message: "Payroll run ID is required" }),
    }),
});

/** GET /leave/run-summary — Aggregate PayrollLeaveItem totals for a PayrollRun */
export const getLeaveRunSummarySchema = z.object({
    query: z.object({
        payrollRunId: z.string({ message: "Payroll run ID is required" }),
    }),
});

/** GET /leave/employee-items — Fetch PayrollLeaveItem records for a specific employee */
export const getEmployeeLeaveItemsSchema = z.object({
    query: z.object({
        employeeId: z.string({ message: "Employee ID is required" }),
    }),
});

/** GET /leave/sync-logs */
export const getSyncLogsSchema = z.object({
    query: z.object({
        limit: z.coerce.number().int().positive().max(100).optional().default(50),
    }),
});
