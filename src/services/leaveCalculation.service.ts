import prisma from "../config/database";
import { Prisma } from "../generated/prisma";
import logger from "../utils/logger";
import { payrollConfigurationService } from "./payrollConfiguration.service";

export class LeaveCalculationService {
    async calculateUnpaidDeductions(companyId: number, payrollPeriodId: string): Promise<{
        totalEmployees: number;
        totalDeductions: number;
        items: { employeeId: string; employeeName: string; leaveDays: number; deductionAmount: number }[];
    }> {
        const deductions = await prisma.leaveDeduction.findMany({
            where: { companyId, payrollPeriodId, leaveDays: { gt: 0 } },
            include: {
                employee: {
                    include: { compensation: true },
                },
            },
        });

        const items: { employeeId: string; employeeName: string; leaveDays: number; deductionAmount: number }[] = [];
        const updates: Prisma.PrismaPromise<any>[] = [];

        for (const deduction of deductions) {
            const comp = deduction.employee.compensation;
            if (!comp?.basicSalary) {
                logger.warn({ employeeId: deduction.employeeId }, 'Missing compensation record for leave deduction');
                continue;
            }
            const basicSalary = Number(comp.basicSalary);
            const dailyRate = basicSalary / 30;
            const deductionAmount = Math.round(Number(deduction.leaveDays) * dailyRate * 100) / 100;

            updates.push(
                prisma.leaveDeduction.update({
                    where: { id: deduction.id },
                    data: { deductionAmount },
                })
            );

            items.push({
                employeeId: deduction.employeeId,
                employeeName: `${deduction.employee.firstName} ${deduction.employee.lastName}`,
                leaveDays: Number(deduction.leaveDays),
                deductionAmount,
            });
        }

        // Execute all updates in a single transaction
        if (updates.length > 0) {
            await prisma.$transaction(updates);
        }

        const totalDeductions = items.reduce((sum, i) => sum + i.deductionAmount, 0);

        return {
            totalEmployees: items.length,
            totalDeductions: Math.round(totalDeductions * 100) / 100,
            items,
        };
    }

    /**
     * Calculates paid and unpaid leave from attendance monthly summaries.
     * Paid leave types (annual, sick, casual, maternity, compassionate,
     * business trip, compensatory) are summed up; absence hours are
     * treated as unpaid leave.  Hours are converted to days using the
     * company's configured daily working hours.  Results are stored as
     * LeaveDeduction records for downstream payroll processing.
     */
    async calculateLeaveFromAttendance(companyId: number, payrollPeriodId: string): Promise<{
        totalEmployees: number;
        totalPaidDays: number;
        totalUnpaidDays: number;
        totalDeductionAmount: number;
        items: {
            employeeId: string;
            employeeName: string;
            paidLeaveDays: number;
            unpaidLeaveDays: number;
            deductionAmount: number;
        }[];
    }> {
        // Find the attendance import for this payroll period
        const importRecord = await prisma.attendanceImport.findFirst({
            where: { payrollPeriodId, payrollPeriod: { companyId } },
            select: { id: true },
            orderBy: { importedAt: "desc" },
        });

        if (!importRecord) {
            return { totalEmployees: 0, totalPaidDays: 0, totalUnpaidDays: 0, totalDeductionAmount: 0, items: [] };
        }

        // Get workday config to convert hours → days
        const workdays = await payrollConfigurationService.getWorkdaysConfiguration(companyId);
        const dailyHours = workdays.dailyWorkingHours;

        const summaries = await prisma.attendanceMonthlySummary.findMany({
            where: { attendanceImportId: importRecord.id },
            include: {
                employee: {
                    include: { compensation: { select: { basicSalary: true } } },
                },
            },
        });

        const paidLeaveTypes = [
            "annualLeaveHours", "sickLeaveHours", "casualLeaveHours",
            "maternityLeaveHours", "compassionateLeaveHours",
            "businessTripHours", "compensatoryHours",
        ] as const;

        const items: {
            employeeId: string;
            employeeName: string;
            paidLeaveDays: number;
            unpaidLeaveDays: number;
            deductionAmount: number;
        }[] = [];

        const leaveDeductionData: {
            employeeId: string;
            companyId: number;
            payrollPeriodId: string;
            leaveType: string;
            leaveDays: number;
            deductionAmount: number;
        }[] = [];

        for (const s of summaries) {
            const paidHours = paidLeaveTypes.reduce((sum, field) => sum + Number((s as any)[field] ?? 0), 0);
            const unpaidHours = Number(s.absenceHours ?? 0);

            if (paidHours === 0 && unpaidHours === 0) continue;

            const paidDays = Math.round((paidHours / dailyHours) * 100) / 100;
            const unpaidDays = Math.round((unpaidHours / dailyHours) * 100) / 100;

            const basicSalary = Number(s.employee?.compensation?.basicSalary ?? 0);
            const dailyRate = basicSalary > 0 ? basicSalary / 30 : 0;
            const deductionAmount = Math.round(unpaidDays * dailyRate * 100) / 100;

            const name = s.employee
                ? `${s.employee.firstName} ${s.employee.lastName}`.trim()
                : s.employeeName || `Employee #${s.employeeId}`;

            items.push({
                employeeId: s.employeeId,
                employeeName: name,
                paidLeaveDays: paidDays,
                unpaidLeaveDays: unpaidDays,
                deductionAmount,
            });

            // Persist paid leave deduction
            if (paidDays > 0) {
                leaveDeductionData.push({
                    employeeId: s.employeeId,
                    companyId,
                    payrollPeriodId,
                    leaveType: "Paid Leave",
                    leaveDays: paidDays,
                    deductionAmount: 0,
                });
            }

            // Persist unpaid leave deduction
            if (unpaidDays > 0) {
                leaveDeductionData.push({
                    employeeId: s.employeeId,
                    companyId,
                    payrollPeriodId,
                    leaveType: "Unpaid Leave",
                    leaveDays: unpaidDays,
                    deductionAmount,
                });
            }
        }

        // Replace old attendance-sourced deductions for this period, then insert fresh ones
        if (leaveDeductionData.length > 0) {
            await prisma.$transaction([
                prisma.leaveDeduction.deleteMany({
                    where: {
                        companyId,
                        payrollPeriodId,
                        leaveType: { in: ["Paid Leave", "Unpaid Leave"] },
                    },
                }),
                prisma.leaveDeduction.createMany({ data: leaveDeductionData }),
            ]);
        }

        const totalPaidDays = items.reduce((sum, i) => sum + i.paidLeaveDays, 0);
        const totalUnpaidDays = items.reduce((sum, i) => sum + i.unpaidLeaveDays, 0);
        const totalDeductionAmount = items.reduce((sum, i) => sum + i.deductionAmount, 0);

        return {
            totalEmployees: items.length,
            totalPaidDays: Math.round(totalPaidDays * 100) / 100,
            totalUnpaidDays: Math.round(totalUnpaidDays * 100) / 100,
            totalDeductionAmount: Math.round(totalDeductionAmount * 100) / 100,
            items,
        };
    }

}

export const leaveCalculationService = new LeaveCalculationService();
