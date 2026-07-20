/**
 * Leave Period Sync Service
 * ===========================
 *
 * Provides period-accurate leave calculation for payroll processing.
 * Fetches approved leave applications from the employee management system
 * via the external HTTP API, computes days-in-period with half-day
 * support, and upserts PayrollLeaveItem records into the payroll DB.
 *
 * Basic salary for deduction calculation is sourced from the locally-synced
 * EmployeeCompensation table (populated by employee sync).
 *
 * Two entry points:
 *   - `syncLeaveForPeriod`  — sync a single employee (one PayrollRunItem)
 *   - `syncLeaveForRun`     — sync ALL employees in a PayrollRun at once
 *
 * Formula: dailyRate = basicSalary / 30
 *          deduction = unpaidDays × dailyRate
 */

import prisma from "../config/database";
import { Prisma } from "../generated/prisma";
import { externalApiClient, ExternalLeaveApplication } from "./sync/externalApiClient";
import config from "../config/env";
import logger from "../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  totalEmployees: number;
  totalLeaveTypes: number;
  totalDeductions: number;
  details: Array<{
    employeeId: string;
    employeeName: string;
    leaveType: string;
    days: number;
    isPaid: boolean;
    deductionAmount: number;
  }>;
}

/** Grouped leave data after period-accurate calculation. */
interface LeaveGrouped {
  employee_id: string;
  leave_type_name: string;
  leave_type_code: string;
  is_paid: boolean;
  total_days: number;
  basic_salary: string | null;
}

/** Intermediate type after period calculation. */
interface LeaveCalcRow {
  employee_id: string;
  leave_type_name: string;
  leave_type_code: string;
  is_paid: boolean;
  days_in_period: number;
  basic_salary: string | null;
}



// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the number of leave days that fall within a given period,
 * with half-day support.
 *
 * - Single-day half-day → 0.5
 * - Otherwise → clamped date difference + 1 (never below 0)
 */
function calcDaysInPeriod(
  startDate: Date,
  endDate: Date,
  isStartHalfDay: boolean,
  periodStart: Date,
  periodEnd: Date,
): number {
  const effectiveStart = new Date(Math.max(startDate.getTime(), periodStart.getTime()));
  const effectiveEnd   = new Date(Math.min(endDate.getTime(), periodEnd.getTime()));

  // Single-day half-day: start = end AND it's a half-day
  if (isStartHalfDay && startDate.getTime() === endDate.getTime()) {
    return 0.5;
  }

  // Full days clamped to period
  const diffMs = effectiveEnd.getTime() - effectiveStart.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(0, days);
}

/**
 * Group an array of individual leave rows by (employee, leave type),
 * summing the days-in-period and keeping the max basic_salary.
 */
function groupLeaveRows(rows: LeaveCalcRow[]): LeaveGrouped[] {
  const map = new Map<string, LeaveGrouped>();

  for (const row of rows) {
    const key = `${row.employee_id}__${row.leave_type_name}`;
    const existing = map.get(key);
    if (existing) {
      existing.total_days += row.days_in_period;
      // Keep the highest salary if there are multiple employment records
      if (row.basic_salary != null) {
        const existingSalary = existing.basic_salary ? parseFloat(existing.basic_salary) : 0;
        const newSalary = parseFloat(row.basic_salary);
        if (newSalary > existingSalary) {
          existing.basic_salary = row.basic_salary;
        }
      }
    } else {
      map.set(key, {
        employee_id: row.employee_id,
        leave_type_name: row.leave_type_name,
        leave_type_code: row.leave_type_code,
        is_paid: row.is_paid,
        total_days: row.days_in_period,
        basic_salary: row.basic_salary,
      });
    }
  }

  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LeavePeriodService {
  private prisma: typeof prisma;

  constructor(prismaClient?: typeof prisma) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * Fetch + calculate leave rows from the employee management DB for a
   * given period. Uses the employee module REST API to query leave
   * applications, then computes days-in-period and groups by
   * (employee, leave type) in TypeScript.
   *
   * @param token - Bearer token for the employee module API. Falls back to
   *                config.externalApiToken if not provided.
   */
  private async fetchLeaveFromEms(
    companyId: number,
    periodStart: Date,
    periodEnd: Date,
    token?: string,
  ): Promise<LeaveGrouped[]> {
    const apiToken = token || config.externalApiToken;
    if (!apiToken) {
      logger.warn(
        { companyId, periodStart, periodEnd },
        "No API token available for employee module — skipping leave sync",
      );
      return [];
    }

    // Format dates as ISO strings for the API query
    const startStr = periodStart.toISOString().split("T")[0];
    const endStr = periodEnd.toISOString().split("T")[0];

    let applications: ExternalLeaveApplication[] = [];
    try {
      applications = await externalApiClient.getLeaveApplications(
        apiToken,
        companyId,
        startStr,
        endStr,
      );
    } catch (error) {
      logger.error(
        { err: error, companyId, periodStart, periodEnd },
        "External API query failed for leave period sync",
      );
      throw error;
    }

    if (applications.length === 0) return [];

    // Collect unique employee external IDs from the leave applications
    const employeeIds = Array.from(
      new Set(applications.map((a) => a.employee_id)),
    );

    // Fetch basic salaries from locally-synced EmployeeCompensation table
    const employees = await this.prisma.employee.findMany({
      where: { externalId: { in: employeeIds } },
      include: {
        compensation: {
          select: { basicSalary: true },
        },
      },
    });

    const salaryMap = new Map<string, string | null>();
    for (const emp of employees) {
      if (emp.externalId) {
        salaryMap.set(
          emp.externalId,
          emp.compensation?.basicSalary?.toString() ?? null,
        );
      }
    }

    // Map API results → LeaveCalcRow with calculated days-in-period
    const calcRows: LeaveCalcRow[] = applications.map((app) => ({
      employee_id: app.employee_id,
      leave_type_name: app.leaveType.name,
      leave_type_code: app.leaveType.code,
      is_paid: app.leaveType.is_paid ?? true,
      days_in_period: calcDaysInPeriod(
        new Date(app.start_date),
        new Date(app.end_date),
        app.is_start_half_day ?? false,
        periodStart,
        periodEnd,
      ),
      basic_salary: salaryMap.get(app.employee_id) ?? null,
    }));

    // Group by (employee, leave type) and sum days
    return groupLeaveRows(calcRows);
  }

  /** Shared: upsert PayrollLeaveItem records from grouped leave data. */
  private async upsertLeaveItems(
    payrollRunItemId: string,
    localEmployeeId: string,
    employeeName: string,
    companyId: number,
    payrollPeriodId: string,
    groupedRows: LeaveGrouped[],
  ): Promise<SyncResult["details"]> {
    const details: SyncResult["details"] = [];
    const upsertOps: Prisma.PrismaPromise<any>[] = [];

    for (const row of groupedRows) {
      if (row.total_days <= 0) continue;

      const basicSalary = row.basic_salary ? parseFloat(row.basic_salary) : 0;
      const dailyRate = basicSalary / 30;
      const deductionAmount = row.is_paid
        ? 0
        : Math.round(row.total_days * dailyRate * 100) / 100;

      upsertOps.push(
        this.prisma.payrollLeaveItem.upsert({
          where: {
            payrollRunItemId_leaveType: {
              payrollRunItemId,
              leaveType: row.leave_type_name,
            },
          },
          update: {
            employeeId: localEmployeeId,
            companyId,
            payrollPeriodId,
            leaveCode: row.leave_type_code,
            leaveDaysInPeriod: row.total_days,
            isPaid: row.is_paid,
            deductionAmount,
            syncedAt: new Date(),
          },
          create: {
            payrollRunItemId,
            employeeId: localEmployeeId,
            companyId,
            payrollPeriodId,
            leaveType: row.leave_type_name,
            leaveCode: row.leave_type_code,
            leaveDaysInPeriod: row.total_days,
            isPaid: row.is_paid,
            deductionAmount,
          },
        }),
      );

      details.push({
        employeeId: localEmployeeId,
        employeeName,
        leaveType: row.leave_type_name,
        days: row.total_days,
        isPaid: row.is_paid,
        deductionAmount,
      });
    }

    if (upsertOps.length > 0) {
      await this.prisma.$transaction(upsertOps);
    }

    return details;
  }

  async syncLeaveForPeriod(
    companyId: number,
    periodStart: Date,
    periodEnd: Date,
    payrollRunItemId: string,
    apiToken?: string,
  ): Promise<SyncResult> {
    // -----------------------------------------------------------------------
    // 1. Resolve the local payroll-run-item and its employee
    // -----------------------------------------------------------------------
    const payrollRunItem = await this.prisma.payrollRunItem.findUnique({
      where: { id: payrollRunItemId },
      include: {
        payrollRun: { select: { payrollPeriodId: true } },
        employee: {
          select: { id: true, firstName: true, lastName: true, externalId: true },
        },
      },
    });

    if (!payrollRunItem) {
      logger.warn({ payrollRunItemId }, "PayrollRunItem not found — cannot sync leave");
      return { totalEmployees: 0, totalLeaveTypes: 0, totalDeductions: 0, details: [] };
    }

    const {
      employee: { id: localEmployeeId, firstName, lastName, externalId },
      payrollRun: { payrollPeriodId },
    } = payrollRunItem;

    if (!externalId) {
      logger.warn(
        { payrollRunItemId, localEmployeeId },
        "Employee has no externalId — cannot match leave records",
      );
      return { totalEmployees: 0, totalLeaveTypes: 0, totalDeductions: 0, details: [] };
    }

    const employeeName = `${firstName} ${lastName}`;

    // -----------------------------------------------------------------------
    // 2. Fetch + calculate leave from EMS (read-only)
    // -----------------------------------------------------------------------
    const grouped = await this.fetchLeaveFromEms(companyId, periodStart, periodEnd, apiToken);

    // Keep only rows for this specific employee
    const employeeRows = grouped.filter((r) => r.employee_id === externalId);

    if (employeeRows.length === 0) {
      logger.info(
        { companyId, externalId, payrollRunItemId },
        "No approved leave found for employee in period",
      );
      return { totalEmployees: 0, totalLeaveTypes: 0, totalDeductions: 0, details: [] };
    }

    // -----------------------------------------------------------------------
    // 3. Upsert PayrollLeaveItem records
    // -----------------------------------------------------------------------
    const details = await this.upsertLeaveItems(
      payrollRunItemId,
      localEmployeeId,
      employeeName,
      companyId,
      payrollPeriodId,
      employeeRows,
    );

    const totalDeductions = details.reduce((sum, d) => sum + d.deductionAmount, 0);

    logger.info(
      {
        companyId,
        payrollRunItemId,
        employeeId: localEmployeeId,
        leaveTypesProcessed: details.length,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
      },
      "leavePeriod.syncComplete",
    );

    return {
      totalEmployees: 1,
      totalLeaveTypes: details.length,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      details,
    };
  }

  /**
   * Sync period-accurate leave for ALL PayrollRunItems in a given PayrollRun.
   * Fetches EMS leave data ONCE for the whole period, then processes each
   * employee's items.
   *
   * @param companyId   The company to scope the query.
   * @param periodStart Start of the payroll period (inclusive).
   * @param periodEnd   End of the payroll period (inclusive).
   * @param payrollRunId The PayrollRun whose items should be synced.
   */
  async syncLeaveForRun(
    companyId: number,
    periodStart: Date,
    periodEnd: Date,
    payrollRunId: string,
    apiToken?: string,
  ): Promise<SyncResult> {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
      select: { payrollPeriodId: true },
    });

    if (!run) {
      logger.warn({ payrollRunId }, "PayrollRun not found — cannot sync leave");
      return { totalEmployees: 0, totalLeaveTypes: 0, totalDeductions: 0, details: [] };
    }

    const items = await this.prisma.payrollRunItem.findMany({
      where: { payrollRunId },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, externalId: true },
        },
      },
    });

    if (items.length === 0) {
      logger.warn({ payrollRunId }, "No PayrollRunItems found in run — nothing to sync");
      return { totalEmployees: 0, totalLeaveTypes: 0, totalDeductions: 0, details: [] };
    }

    // Fetch EMS data once (shared helper does the query + period calc + grouping)
    const allGrouped = await this.fetchLeaveFromEms(companyId, periodStart, periodEnd, apiToken);
    const allDetails: SyncResult["details"] = [];
    let employeesProcessed = 0;

    for (const item of items) {
      const { employee } = item;
      if (!employee.externalId) continue;

      const employeeRows = allGrouped.filter((r) => r.employee_id === employee.externalId);
      if (employeeRows.length === 0) continue;

      const employeeName = `${employee.firstName} ${employee.lastName}`;
      employeesProcessed++;

      const details = await this.upsertLeaveItems(
        item.id,
        employee.id,
        employeeName,
        companyId,
        run.payrollPeriodId,
        employeeRows,
      );

      allDetails.push(...details);
    }

    const totalDeductions = allDetails.reduce((sum, d) => sum + d.deductionAmount, 0);
    const uniqueLeaveTypes = new Set(allDetails.map((d) => d.leaveType)).size;

    logger.info(
      {
        companyId,
        payrollRunId,
        employeesProcessed,
        leaveItemsCreated: allDetails.length,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
      },
      "leavePeriod.syncForRunComplete",
    );

    return {
      totalEmployees: employeesProcessed,
      totalLeaveTypes: uniqueLeaveTypes,
      totalDeductions: Math.round(Math.abs(totalDeductions) * 100) / 100,
      details: allDetails,
    };
  }
}

export const leavePeriodService = new LeavePeriodService();
