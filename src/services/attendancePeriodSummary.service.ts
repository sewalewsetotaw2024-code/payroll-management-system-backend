import prisma from "../config/database";
import logger from "../utils/logger";
import { payrollConfigurationService } from "./payrollConfiguration.service";

// ─── Types ─────────────────────────────────────────────────────────────

export interface AttendanceSummaryItem {
    employeeId: string;
    employeeName: string;
    department: string;
    regularHours: number;
    paidLeaveHours: number;
    absenceHours?: number;
    totalHours: number;
    absentDays?: number;
    paidLeaveDays?: number;
    actualDays?: number;
    workingDays?: number;
    // Payroll-related fields (from Employee.compensation and Employee.allowances)
    basicSalary?: number;
    grossSalary?: number;
    totalAllowances?: number;
}

export interface CombinedPeriodSummary {
    importId: string;
    payrollPeriod: {
        id: string;
        startDate: Date;
        endDate: Date;
        name: string | null;
    };
    employees: AttendanceSummaryItem[];
    calculatedAt: Date;
}

// ─── Constants ─────────────────────────────────────────────────────────

/** Paid leave type hours fields in AttendanceMonthlySummary. */
const PAID_LEAVE_FIELDS = [
    "annualLeaveHours",
    "sickLeaveHours",
    "casualLeaveHours",
    "maternityLeaveHours",
    "compassionateLeaveHours",
    "businessTripHours",
    "compensatoryHours",
] as const;

/** Leave types from the LeaveApplication table that count as paid. */
const PAID_LEAVE_TYPES = [
    "Annual Leave",
    "Sick Leave",
    "Casual Leave",
    "Maternity Leave",
    "Compassionate Leave",
    "Business Trip",
] as const;

// ─── Service ───────────────────────────────────────────────────────────

export class AttendancePeriodSummaryService {
    /**
     * Calculate attendance summary for BOTH views (hourly and monthly)
     * and persist all results.  Returns a combined result the frontend
     * can toggle between: totalHours for hourly view, actualDays for
     * monthly view.
     */
    async calculateSummary(
        companyId: number,
        importId: string,
    ): Promise<CombinedPeriodSummary> {
        // 1. Fetch import with payroll period and all monthly summaries
        const attendanceImport = await prisma.attendanceImport.findFirst({
            where: {
                id: importId,
                payrollPeriod: { companyId },
            },
            include: {
                payrollPeriod: true,
                monthlySummaries: {
                    include: {
                        employee: {
                            include: {
                                compensation: { select: { basicSalary: true, grossSalary: true } },
                                allowances: { select: { allowanceType: true, amount: true } },
                            },
                        },
                    },
                },
            },
        });

        if (!attendanceImport) {
            throw new Error(`Attendance import ${importId} not found for company ${companyId}`);
        }

        const { payrollPeriod } = attendanceImport;

        // 2. Fetch workdays config
        const workdaysConfig = await payrollConfigurationService.getWorkdaysConfiguration(companyId);
        const { defaultMonthlyWorkdays = 30, dailyWorkingHours = 8 } = workdaysConfig;
        const monthlyWorkHours = defaultMonthlyWorkdays * dailyWorkingHours;

        // 3. Fetch attendance records for absent-days display
        const rawRecords = await prisma.attendanceRecord.findMany({
            where: { attendanceImportId: importId },
            select: {
                employeeId: true,
                date: true,
                regularHours: true,
                isAbsent: true,
            },
        });
        const attendanceRecords = rawRecords.map((r) => ({
            ...r,
            regularHours: Number(r.regularHours),
        }));

        // 4. Fetch approved paid leave applications for the period
        const employeeIds = attendanceImport.monthlySummaries.map((s) => s.employeeId);
        const leaveApplications = await prisma.leaveApplication.findMany({
            where: {
                companyId,
                status: "APPROVED",
                leaveType: { in: PAID_LEAVE_TYPES as unknown as string[] },
                startDate: { lte: payrollPeriod.endDate },
                endDate: { gte: payrollPeriod.startDate },
                employeeId: { in: employeeIds },
            },
            select: { employeeId: true, requestedDays: true },
        });

        // Group paid leave days by employee
        const paidLeaveDaysFromApps = new Map<string, number>();
        for (const la of leaveApplications) {
            const days = Number(la.requestedDays);
            paidLeaveDaysFromApps.set(
                la.employeeId,
                (paidLeaveDaysFromApps.get(la.employeeId) ?? 0) + days,
            );
        }

        // 5. Compute per-employee summary
        const employees: AttendanceSummaryItem[] = [];
        const upsertOps: any[] = [];

        for (const summary of attendanceImport.monthlySummaries) {
            const emp = summary.employee;

            // Sum paid leave hours from monthly summary fields (zero for biometric imports)
            let paidLeaveHours = 0;
            for (const field of PAID_LEAVE_FIELDS) {
                paidLeaveHours += Number((summary as any)[field] || 0);
            }

            // Add paid leave hours from LeaveApplication records
            const leaveAppDays = paidLeaveDaysFromApps.get(emp.id) ?? 0;
            paidLeaveHours += leaveAppDays * dailyWorkingHours;

            const regularHours = Number(summary.regularHours);
            const absenceHours = Number(summary.absenceHours || 0);
            const hireDate = emp.hireDate ? new Date(emp.hireDate) : null;
            const periodStart = new Date(payrollPeriod.startDate);
            const periodEnd = new Date(payrollPeriod.endDate);

            const employeeName = `${emp.firstName || ""} ${emp.lastName || ""}`.trim()
                || summary.employeeName
                || `Employee #${emp.id}`;

            // Payroll data from employee compensation and allowances
            const basicSalary = emp.compensation?.basicSalary ? Number(emp.compensation.basicSalary) : 0;
            const grossSalary = emp.compensation?.grossSalary ? Number(emp.compensation.grossSalary) : 0;
            const totalAllowances = (emp.allowances ?? []).reduce((sum, a) => sum + Number(a.amount), 0);

            // Total hours (for hourly view)
            const totalHours = regularHours + paidLeaveHours;

            // Working days (prorated for mid-period hires)
            let workingDays: number;
            if (hireDate && hireDate >= periodStart && hireDate <= periodEnd) {
                const diffTime = periodEnd.getTime() - hireDate.getTime();
                workingDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
            } else {
                workingDays = defaultMonthlyWorkdays;
            }

            // Day-based fields (for monthly view)
            // Absent days computed from absence hours ÷ daily working hours,
            // since biometric import records absent hours, not isAbsent flags.
            const absentDays = dailyWorkingHours > 0
                ? Math.round((absenceHours / dailyWorkingHours) * 100) / 100
                : 0;
            const paidLeaveDays = dailyWorkingHours > 0
                ? Math.round((paidLeaveHours / dailyWorkingHours) * 100) / 100
                : 0;
            const actualDays = workingDays - absentDays + paidLeaveDays;

            employees.push({
                employeeId: emp.id,
                employeeName,
                department: summary.department || "",
                regularHours,
                paidLeaveHours,
                absenceHours,
                totalHours,
                absentDays,
                paidLeaveDays,
                actualDays,
                workingDays,
                basicSalary,
                grossSalary,
                totalAllowances,
            });

            // Upsert single summary record (one per employee per import)
            upsertOps.push(
                prisma.attendancePeriodSummary.upsert({
                    where: {
                        attendanceImportId_employeeId: {
                            attendanceImportId: importId,
                            employeeId: emp.id,
                        },
                    },
                    create: {
                        attendanceImportId: importId,
                        employeeId: emp.id,
                        regularHours,
                        paidLeaveHours,
                        absenceHours,
                        monthlyWorkHours,
                        totalHours,
                        workingDays,
                        absentDays,
                        paidLeaveDays,
                        actualDays,
                    },
                    update: {
                        regularHours,
                        paidLeaveHours,
                        absenceHours,
                        monthlyWorkHours,
                        totalHours,
                        workingDays,
                        absentDays,
                        paidLeaveDays,
                        actualDays,
                    },
                }),
            );
        }

        // 5. Persist all summaries
        if (upsertOps.length > 0) {
            await prisma.$transaction(upsertOps);
        }

        return {
            importId,
            payrollPeriod: {
                id: payrollPeriod.id,
                startDate: payrollPeriod.startDate,
                endDate: payrollPeriod.endDate,
                name: payrollPeriod.name,
            },
            employees,
            calculatedAt: new Date(),
        };
    }

    /**
     * Retrieve previously calculated attendance summary for an import.
     */
    async getSummary(companyId: number, importId: string): Promise<CombinedPeriodSummary | null> {
        const attendanceImport = await prisma.attendanceImport.findFirst({
            where: {
                id: importId,
                payrollPeriod: { companyId },
            },
            include: {
                payrollPeriod: true,
                attendancePeriodSummaries: {
                    include: {
                        employee: {
                            select: {
                                firstName: true,
                                lastName: true,
                                compensation: { select: { basicSalary: true, grossSalary: true } },
                                allowances: { select: { allowanceType: true, amount: true } },
                            },
                        },
                    },
                },
            },
        });

        if (!attendanceImport || attendanceImport.attendancePeriodSummaries.length === 0) {
            return null;
        }

        const employees: AttendanceSummaryItem[] = attendanceImport.attendancePeriodSummaries.map((rec) => {
            const emp = rec.employee as any;
            const basicSalary = emp.compensation?.basicSalary ? Number(emp.compensation.basicSalary) : 0;
            const grossSalary = emp.compensation?.grossSalary ? Number(emp.compensation.grossSalary) : 0;
            const totalAllowances = (emp.allowances ?? []).reduce((sum: number, a: any) => sum + Number(a.amount), 0);

            return {
                employeeId: rec.employeeId,
                employeeName: `${emp.firstName || ""} ${emp.lastName || ""}`.trim(),
                department: "",
                regularHours: Number(rec.regularHours),
                paidLeaveHours: Number(rec.paidLeaveHours),
                absenceHours: rec.absenceHours ? Number(rec.absenceHours) : undefined,
                totalHours: Number(rec.totalHours),
                absentDays: rec.absentDays ?? undefined,
                paidLeaveDays: rec.paidLeaveDays ? Number(rec.paidLeaveDays) : undefined,
                actualDays: rec.actualDays ? Number(rec.actualDays) : undefined,
                workingDays: rec.workingDays ?? undefined,
                basicSalary,
                grossSalary,
                totalAllowances,
            };
        });

        return {
            importId,
            payrollPeriod: {
                id: attendanceImport.payrollPeriod.id,
                startDate: attendanceImport.payrollPeriod.startDate,
                endDate: attendanceImport.payrollPeriod.endDate,
                name: attendanceImport.payrollPeriod.name,
            },
            employees,
            calculatedAt: new Date(),
        };
    }
}

export const attendancePeriodSummaryService = new AttendancePeriodSummaryService();
