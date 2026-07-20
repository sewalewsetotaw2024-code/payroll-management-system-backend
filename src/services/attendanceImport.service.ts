import crypto from "node:crypto";
import * as XLSX from "xlsx";
import prisma from "../config/database";
import cloudinary from "../config/cloudinary";
import { $Enums } from "../generated/prisma";
import CustomError from "../utils/customError";
import httpStatus from "http-status";
import logger from "../utils/logger";
import { payrollConfigurationService } from "./payrollConfiguration.service";

const OvertimeCategory = $Enums.OvertimeCategory;

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeFloat(val: any): number {
    if (val == null || val === "") return 0;
    const n = parseFloat(String(val));
    return isNaN(n) ? 0 : n;
}



function safeInt(val: any): number {
    if (val == null || val === "") return 0;
    const n = parseInt(String(val), 10);
    return isNaN(n) ? 0 : n;
}

/**
 * Returns the ISO week string (e.g. "2026-W24") for a given date.
 */
function getIsoWeek(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Maps day-number columns to actual Date objects.
 * Sheet "20260604" → year=2026, month=6 (June), days 26-30→prev month, 01-25→period month.
 * JavaScript months are 0-indexed (0=Jan, 11=Dec).
 */
function parseDayColumnToDate(dayNumber: number, year: number, month: number): Date {
    if (dayNumber >= 26) {
        return new Date(year, month - 2, dayNumber);
    }
    return new Date(year, month - 1, dayNumber);
}

/**
 * Builds an in-memory Map of externalId → employee UUID for the given company.
 * Replaces the N+1 per-row query pattern with a single batch load.
 */
async function buildEmployeeMap(companyId: number): Promise<Map<string, string>> {
    const employees = await prisma.employee.findMany({
        where: { companyId },
        select: { id: true, externalId: true },
    });
    const map = new Map<string, string>();
    for (const emp of employees) {
        if (emp.externalId) {
            map.set(emp.externalId, emp.id);
        }
    }
    return map;
}

// ── Interfaces ───────────────────────────────────────────────────────────────

interface ImportResult {
    importId: string;
    totalEmployees: number;
    totalRecords: number;
    periodLabel: string;
    errors: { row: number; message: string }[];
}

interface OtCalculationResult {
    importId: string;
    totalEmployees: number;
    totalOtRecords: number;
    byCategory: { category: string; totalHours: number }[];
    byEmployee?: { summaryId: string; categories: { category: string; hours: number }[] }[];
}

// ── Service ──────────────────────────────────────────────────────────────────

export class AttendanceImportService {
    /**
     * Parses a biometric Excel workbook, normalizes data into AttendanceRecord
     * and AttendanceMonthlySummary records.
     */
    async importFromExcel(
        companyId: number,
        userId: string,
        file: Express.Multer.File,
        sheetName: string,
    ): Promise<ImportResult> {
        // ── 1. Parse workbook ──────────────────────────────────────────
        const workbook = XLSX.read(file.buffer, { type: "buffer" });
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            throw new CustomError(httpStatus.BAD_REQUEST, `Sheet "${sheetName}" not found in workbook`);
        }

        const jsonRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        // ── 2. Extract period info from sheet name ─────────────────────
        // Sheet name format: "YYYYMM<xx>" e.g., "20260604" → June 2026
        const periodYear = parseInt(sheetName.substring(0, 4), 10);
        const periodMonth = parseInt(sheetName.substring(4, 6), 10);

        // Determine period boundaries: 26th of prev month → 25th of period month
        const periodStartDate = new Date(periodYear, periodMonth - 2, 26);
        const periodEndDate = new Date(periodYear, periodMonth - 1, 25);

        // Look up the current active payroll period (DRAFT or ACTIVE)
        const payrollPeriod = await prisma.payrollPeriod.findFirst({
            where: {
                companyId,
                status: { in: [$Enums.PayrollPeriodStatus.DRAFT, $Enums.PayrollPeriodStatus.ACTIVE] as any },
            },
            orderBy: { startDate: "desc" },
        });
        if (!payrollPeriod) {
            throw new CustomError(
                httpStatus.BAD_REQUEST,
                `No active payroll period found. Please create and activate a payroll period before importing attendance data.`,
            );
        }

        // Build a human-readable label: payroll period name + import date
        const today = new Date();
        const dateStr = today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const periodLabel = payrollPeriod.name
            ? `${payrollPeriod.name} — imported ${dateStr}`
            : `${sheetName} — imported ${dateStr}`;

        // Pre-load all employees into a Map (externalId → uuid) — kills the N+1
        const employeeMap = await buildEmployeeMap(companyId);

        // ── 3. Find header row dynamically ──────────────────────────
        // ZKTeco exports can have varying numbers of header rows (company name,
        // day-of-week row, column headers). Find the actual column header row
        // by looking for "Employee ID" (or similar) in column 0.

        // First, detect the card number column index from the header row
        // (it may or may not exist depending on the Excel format)
        let cardNumberColIndex = -1;

        let headerRowIndex = -1;
        for (let i = 0; i < jsonRows.length; i++) {
            const cell0 = String(jsonRows[i]?.[0] ?? "").toLowerCase().trim();
            if (
                cell0.includes("employee id") ||
                cell0.includes("employee") ||
                cell0.includes("user id") ||
                cell0.includes("badge number") ||
                cell0.includes("badge")
            ) {
                // Verify next row has non-header data (numeric ID in col 0)
                const nextRow = jsonRows[i + 1];
                if (nextRow && nextRow[0] != null && !isNaN(Number(nextRow[0]))) {
                    headerRowIndex = i;
                    // Detect card number column by scanning header cells
                    const headerCells = jsonRows[i];
                    for (let c = 0; c < headerCells.length; c++) {
                        const cell = String(headerCells[c] ?? "").toLowerCase().trim();
                        if (
                            cell.includes("card") ||
                            cell.includes("badge") ||
                            cell.includes("external") ||
                            cell.includes("biometric")
                        ) {
                            // Skip if this is the employee ID column itself
                            if (c === 0) continue;
                            cardNumberColIndex = c;
                            break;
                        }
                    }
                    break;
                }
            }
        }

        // Fallback: try known ZKTeco row layouts
        if (headerRowIndex === -1) {
            // ZKTeco format: row 0=company name, row 1=day-of-week, row 2=date headers
            // The header row with "Employee ID" is typically row 2 (0-indexed)
            // Check rows 1-3 for the one that has day numbers in columns after the fixed fields
            for (let r = 1; r <= 3; r++) {
                if (jsonRows[r]) {
                    // Check if this row has "Employee ID" or similar in column 0
                    const cell0 = String(jsonRows[r]?.[0] ?? "").toLowerCase().trim();
                    if (cell0.includes("employee") || cell0.includes("user id") || cell0.includes("badge")) {
                        headerRowIndex = r;
                        // Detect card number column
                        const headerCells = jsonRows[r];
                        for (let c = 1; c < headerCells.length; c++) {
                            const cell = String(headerCells[c] ?? "").toLowerCase().trim();
                            if (cell.includes("card") || cell.includes("badge") || cell.includes("external")) {
                                cardNumberColIndex = c;
                                break;
                            }
                        }
                        break;
                    }
                }
            }
            // Ultimate fallback: use row 2 (common ZKTeco layout)
            if (headerRowIndex === -1) {
                headerRowIndex = 2;
                // Try to detect card number from row 2
                if (jsonRows[2]) {
                    for (let c = 1; c < Math.min(jsonRows[2].length, 6); c++) {
                        const cell = String(jsonRows[2][c] ?? "").toLowerCase().trim();
                        if (cell.includes("card") || cell.includes("badge") || cell.includes("external")) {
                            cardNumberColIndex = c;
                            break;
                        }
                    }
                }
            }
        }

        // ── 3a. Compute file hash for duplicate detection ──────────────
        const fileHash = crypto.createHash("sha256").update(file.buffer).digest("hex");

        // Check if the same file was already imported for this payroll period
        const existingWithHash = await prisma.attendanceImport.findFirst({
            where: {
                payrollPeriodId: payrollPeriod.id,
                fileHash,
            },
            select: { id: true, periodLabel: true, importedAt: true },
        });
        if (existingWithHash) {
            const importedDate = existingWithHash.importedAt.toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
            });
            throw new CustomError(
                httpStatus.CONFLICT,
                `This file has already been imported (${importedDate}) — duplicate detected.`,
            );
        }

        logger.info({ headerRowIndex, cardNumberColIndex }, "Import detection result");

        const headerRow = jsonRows[headerRowIndex];

        // ── 4. Count daily columns from header ──────────────────────────
        // ZKTeco exports usually have ~31 columns for days (01-31).
        // Scan specifically for columns that representing day-of-month (1-31).
        // Start scanning after Employee ID(0), Name(1), Dept(2), and Card Number(if detected).
        const dayScanStart = cardNumberColIndex >= 0 ? cardNumberColIndex + 1 : 3;
        let dayCount = 0;
        const dayNumbers: number[] = [];
        const dayColIndices: number[] = [];

        for (let i = dayScanStart; i < headerRow.length; i++) {
            const val = parseInt(String(headerRow[i] ?? "").trim(), 10);
            if (!isNaN(val) && val >= 1 && val <= 31) {
                dayCount++;
                dayNumbers.push(val);
                dayColIndices.push(i);
            } else if (dayCount > 0) {
                // If we've found some days and hit a non-day col, that's likely the end of daily logs
                // but we check a few more cols just in case of blanks
                let foundMore = false;
                for (let j = 1; j <= 2; j++) {
                    const nextVal = parseInt(String(headerRow[i + j] ?? "").trim(), 10);
                    if (!isNaN(nextVal) && nextVal >= 1 && nextVal <= 31) {
                        foundMore = true;
                        break;
                    }
                }
                if (!foundMore) break;
            }
        }
        // Fallback to 31 if detection failed completely
        if (dayCount === 0) dayCount = 31;

        // ── 5. Data rows (after header row) ─────────────────────────────
        const dataRows = jsonRows.slice(headerRowIndex + 1).filter((r: any[]) => {
            const v = r[0];
            return v != null && String(v).trim() !== "";
        });

        // ── 6. Parse all rows ──────────────────────────────────────────
        interface ParsedEmployee {
            rowIndex: number;
            employeeDbId: string;
            firstName: string;
            department: string;
            dailyRecords: { date: Date; hours: number }[];
            summary: {
                regularHours: number;
                lateMinutes: number;
                earlyOutMinutes: number;
                absenceHours: number;
                normalOtHours: number;
                weekendOtHours: number;
                holidayOtHours: number;
                ot1Hours: number;
            };
        }

        const parsed: ParsedEmployee[] = [];
        const errors: { row: number; message: string }[] = [];

        // Debug: log header detection result and first data row for troubleshooting
        if (dataRows.length > 0) {
            const firstRow = dataRows[0];
            logger.info({ headerRowIndex, rowCount: dataRows.length, sample: [firstRow?.[0], firstRow?.[1], firstRow?.[2]] }, "Header detection result");
        }

        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const rowNum = headerRowIndex + 1 + i;
            try {
                const empIdField = String(row[0] ?? "").trim();
                const firstName = String(row[1] ?? "").trim();
                const dept = String(row[2] ?? "").trim();

                // Use dynamically detected card number column, or fall back to column 3
                const cardNumberCol = cardNumberColIndex >= 0 ? cardNumberColIndex : 3;
                const cardNumber = String(row[cardNumberCol] ?? "").trim();

                if (!empIdField && !firstName && !cardNumber) {
                    errors.push({ row: rowNum, message: "Missing employee identifier" });
                    continue;
                }

                // Match by Card Number (externalId) — skip row if no match found
                const empDbId = cardNumber ? (employeeMap.get(cardNumber) ?? null) : null;
                if (!empDbId) {
                    errors.push({ row: rowNum, message: `Skipped: Card#="${cardNumber}" — no matching employee found (import by card number only)` });
                    continue;
                }

                // Parse daily columns using detected indices
                const dailyRecords: { date: Date; hours: number }[] = [];
                let lastDayColIndex = 3;

                for (let d = 0; d < dayColIndices.length; d++) {
                    const colIdx = dayColIndices[d];
                    const dayNum = dayNumbers[d];
                    lastDayColIndex = Math.max(lastDayColIndex, colIdx);

                    const date = parseDayColumnToDate(dayNum, periodYear, periodMonth);
                    // Only keep records within the payroll period boundaries
                    if (date < payrollPeriod.startDate || date > payrollPeriod.endDate) continue;

                    const cellVal = row[colIdx];
                    const hours = cellVal != null && cellVal !== "" ? parseFloat(String(cellVal)) : 0;
                    dailyRecords.push({ date, hours });
                }

                // Parse summary columns starting after the last daily column.
                // Excel column order (after daily columns):
                //   [0] RegularHrs  [1] LateMin  [2] EarlyOutMin  [3] AbsentHrs
                //   [4] NormalOT(H)  [5] WeekendOT(H)  [6] HolidayOT(H)  [7] OT1(H)
                const summaryColStart = lastDayColIndex + 1;
                const summaryFields = row.slice(summaryColStart, summaryColStart + 8);
                const summary = {
                    regularHours: safeFloat(summaryFields[0]),
                    lateMinutes: safeInt(summaryFields[1]),
                    earlyOutMinutes: safeInt(summaryFields[2]),
                    absenceHours: safeFloat(summaryFields[3]),
                    normalOtHours: safeFloat(summaryFields[4]),
                    weekendOtHours: safeFloat(summaryFields[5]),
                    holidayOtHours: safeFloat(summaryFields[6]),
                    ot1Hours: safeFloat(summaryFields[7]),
                };

                parsed.push({
                    rowIndex: rowNum,
                    employeeDbId: empDbId,
                    firstName,
                    department: dept,
                    dailyRecords,
                    summary,
                });
            } catch (err: any) {
                errors.push({ row: rowNum, message: err.message || "Unknown error" });
            }
        }

        if (parsed.length === 0) {
            return {
                importId: "__none__",
                totalEmployees: 0,
                totalRecords: 0,
                periodLabel,
                errors,
            };
        }

        // ── 5. Upload raw file to Cloudinary (for later download) ──────
        let cloudUrl = file.originalname;
        try {
            const base64 = file.buffer.toString("base64");
            const dataUri = `data:${file.mimetype};base64,${base64}`;
            const cloudResult = await cloudinary.uploader.upload(dataUri, {
                folder: `company_${companyId}/imports/attendance`,
                resource_type: "raw",
                public_id: `${Date.now()}_${file.originalname.replace(/\.[^/.]+$/, "")}`,
            });
            cloudUrl = cloudResult.secure_url;
        } catch (err) {
            logger.warn({ err }, "Cloudinary upload failed — storing filename only");
            // Non-fatal: fall back to storing just the original filename
        }

        // ── 6. Create AttendanceImport + records in transaction ────────
        const importRecord = await prisma.attendanceImport.create({
            data: {
                payrollPeriodId: payrollPeriod.id,
                source: $Enums.AttendanceSource.ZK_BIOMETRIC,
                importedBy: userId,
                periodLabel,
                totalEmployees: parsed.length,
                totalRecords: parsed.reduce((sum, p) => sum + p.dailyRecords.length, 0),
                fileReference: cloudUrl,
                fileHash,
                sizeBytes: file.size,
                isActive: true,
            },
        });

        // Deactivate any other active imports for the same period
        await prisma.attendanceImport.updateMany({
            where: {
                payrollPeriodId: payrollPeriod.id,
                id: { not: importRecord.id },
                isActive: true,
            },
            data: { isActive: false },
        });

        // Batch create attendance records
        const attendanceData = parsed.flatMap((p) =>
            p.dailyRecords.map((dr) => ({
                attendanceImportId: importRecord.id,
                employeeId: p.employeeDbId,
                date: dr.date,
                regularHours: dr.hours,
                lateMinutes: 0,
                isAbsent: dr.hours === 0,
            })),
        );

        if (attendanceData.length > 0) {
            await prisma.attendanceRecord.createMany({ data: attendanceData });
        }

        // Batch create monthly summaries.
        // Leave-related fields (annualLeave, sickLeave, etc.) are set to 0 since
        // leave data is managed exclusively by the Leave sync module.
        const summaryData = parsed.map((p) => ({
            attendanceImportId: importRecord.id,
            employeeId: p.employeeDbId,
            employeeName: p.firstName,
            department: p.department,
            regularHours: p.summary.regularHours,
            lateMinutes: p.summary.lateMinutes,
            earlyOutMinutes: p.summary.earlyOutMinutes,
            absenceHours: p.summary.absenceHours,
            normalOtHours: p.summary.normalOtHours,
            weekendOtHours: p.summary.weekendOtHours,
            holidayOtHours: p.summary.holidayOtHours,
            ot1Hours: p.summary.ot1Hours,
            annualLeaveHours: 0,
            sickLeaveHours: 0,
            casualLeaveHours: 0,
            maternityLeaveHours: 0,
            compassionateLeaveHours: 0,
            businessTripHours: 0,
            compensatoryHours: 0,
        }));

        await prisma.attendanceMonthlySummary.createMany({ data: summaryData });

        return {
            importId: importRecord.id,
            totalEmployees: parsed.length,
            totalRecords: attendanceData.length,
            periodLabel,
            errors,
        };
    }

    /**
     * Calculates overtime from attendance records using configured workday rules.
     */
    async calculateOvertime(companyId: number, importId: string): Promise<OtCalculationResult> {
        const importRecord = await prisma.attendanceImport.findUnique({
            where: { id: importId },
            include: {
                payrollPeriod: true,
                monthlySummaries: {
                    include: {
                        employee: { select: { id: true, firstName: true, lastName: true } },
                    },
                },
            },
        });
        if (!importRecord) throw new CustomError(httpStatus.NOT_FOUND, "Import not found");

        // Load OT rules with weekly and monthly caps
        const otRules = await prisma.overtimeRule.findMany({
            where: { companyId, isActive: true },
        });
        const ruleMap = new Map(otRules.map((r) => [r.category, r]));

        // Map Excel-imported OT columns → OvertimeCategory
        // normalOtHours → WEEKDAY_DAY, ot1Hours → WEEKDAY_NIGHT
        // weekendOtHours → WEEKEND, holidayOtHours → PUBLIC_HOLIDAY
        const columnToCategory: { field: string; category: $Enums.OvertimeCategory }[] = [
            { field: 'normalOtHours', category: 'WEEKDAY_DAY' },
            { field: 'ot1Hours', category: 'WEEKDAY_NIGHT' },
            { field: 'weekendOtHours', category: 'WEEKEND' },
            { field: 'holidayOtHours', category: 'PUBLIC_HOLIDAY' },
        ];

        // Track per-employee OT totals for weekly/monthly cap enforcement
        // Also track per ISO week for weekly cap enforcement
        const weeklyTracker: Record<string, number> = {};        // Key: `${employeeId}:${isoWeek}`
        const monthlyTracker: Record<string, number> = {};       // Key: `${employeeId}` (for monthly cap)
        const newOtRecords: any[] = [];
        const categoryTotals: Record<string, number> = {};
        const employeeOt: Record<string, Record<string, number>> = {};

        for (const summary of importRecord.monthlySummaries) {
            const employeeId = summary.employeeId;
            const empKey = employeeId;
            const summaryKey = summary.id;  // Use monthlySummary ID for frontend lookups

            if (!employeeOt[summaryKey]) employeeOt[summaryKey] = {};
            if (!monthlyTracker[empKey]) monthlyTracker[empKey] = 0;

            // Map each non-zero OT column to an OvertimeRecord entry
            for (const mapping of columnToCategory) {
                const rawHours = Number((summary as any)[mapping.field] ?? 0);
                if (rawHours <= 0) continue;

                const rule = ruleMap.get(mapping.category);
                const weeklyCap = rule ? Number(rule.weeklyCapHours) : 0;
                const monthlyCap = rule && rule.monthlyCapHours ? Number(rule.monthlyCapHours) : 0;

                let cappedHours = rawHours;

                // Apply weekly cap per ISO week.
                // NOTE: The weekly cap currently uses the period start date for all records,
                // meaning all OT hours get bucketed into the same ISO week. This is a known
                // limitation — the summary aggregates OT hours for the entire period, so we
                // can't determine which calendar week each hour belongs to. For accurate
                // weekly cap enforcement, OT should be calculated from daily records during
                // import (not from the summary). TODO: refactor to use per-day OT records.
                if (weeklyCap > 0) {
                    const isoWeek = getIsoWeek(importRecord.payrollPeriod.startDate);
                    const weekKey = `${employeeId}:${isoWeek}`;
                    const weekUsed = weeklyTracker[weekKey] || 0;
                    const weekRemaining = Math.max(0, weeklyCap - weekUsed);
                    cappedHours = Math.min(rawHours, weekRemaining);
                    weeklyTracker[weekKey] = weekUsed + cappedHours;
                }

                // Apply monthly cap across all categories
                if (monthlyCap > 0) {
                    const monthUsed = monthlyTracker[empKey];
                    const monthRemaining = Math.max(0, monthlyCap - monthUsed);
                    // For the per-category cap, take the smaller of the weekly-capped hours and remaining monthly
                    // Actually monthly cap applies to total OT per employee, so we use monthRemaining
                    if (monthRemaining <= 0) continue;
                    cappedHours = Math.min(cappedHours, monthRemaining);
                }

                if (cappedHours <= 0) continue;

                newOtRecords.push({
                    attendanceMonthlySummaryId: summary.id,
                    category: mapping.category,
                    hours: cappedHours,
                    isManualEntry: false,
                });

                // Track monthly cap usage across all categories
                monthlyTracker[empKey] = (monthlyTracker[empKey] || 0) + cappedHours;

                const catKey = mapping.category;
                categoryTotals[catKey] = (categoryTotals[catKey] || 0) + cappedHours;
                employeeOt[summaryKey][catKey] = (employeeOt[summaryKey][catKey] || 0) + cappedHours;
            }
        }

        // Delete old auto-calculated OT records linked to this import's monthly summaries
        const summaryIds = importRecord.monthlySummaries.map((s) => s.id);
        await prisma.overtimeRecord.deleteMany({
            where: { attendanceMonthlySummaryId: { in: summaryIds }, isManualEntry: false },
        });

        if (newOtRecords.length > 0) {
            await prisma.overtimeRecord.createMany({ data: newOtRecords });
        }

        const byCategory = Object.entries(categoryTotals).map(([category, totalHours]) => ({
            category,
            totalHours: Math.round(totalHours * 100) / 100,
        }));

        // Per-employee OT breakdown keyed by monthlySummaryId
        const byEmployee = Object.entries(employeeOt).map(([summaryId, categories]) => ({
            summaryId,
            categories: Object.entries(categories).map(([category, hours]) => ({
                category,
                hours: Math.round(hours * 100) / 100,
            })),
        }));

        const totalEmployees = Object.keys(employeeOt).length;

        return {
            importId,
            totalEmployees,
            totalOtRecords: newOtRecords.length,
            byCategory,
            byEmployee,
        };
    }

    /**
     * Retrieves existing overtime calculation results for an import without
     * re-calculating. Returns null if no OT records have been computed yet.
     */
    async getOvertimeResults(
        companyId: number,
        importId: string,
    ): Promise<OtCalculationResult | null> {
        // Verify the import belongs to this company
        const importRecord = await prisma.attendanceImport.findFirst({
            where: { id: importId, payrollPeriod: { companyId } },
            select: { id: true },
        });
        if (!importRecord) {
            throw new CustomError(httpStatus.NOT_FOUND, "Import not found");
        }

        // Aggregate existing OT records by category via monthly summaries
        const otRecords = await prisma.overtimeRecord.findMany({
            where: {
                attendanceMonthlySummary: {
                    attendanceImportId: importId,
                },
            },
            select: {
                category: true,
                hours: true,
                attendanceMonthlySummaryId: true,
            },
        });

        if (otRecords.length === 0) return null;

        const categoryTotals: Record<string, number> = {};
        const employeeOtMap: Record<string, Record<string, number>> = {};

        for (const record of otRecords) {
            categoryTotals[record.category] = (categoryTotals[record.category] || 0) + Number(record.hours);

            // Group by employee (via summary ID)
            const empKey = record.attendanceMonthlySummaryId || 'unknown';
            if (!employeeOtMap[empKey]) employeeOtMap[empKey] = {};
            employeeOtMap[empKey][record.category] = (employeeOtMap[empKey][record.category] || 0) + Number(record.hours);
        }

        const byCategory = Object.entries(categoryTotals).map(([category, totalHours]) => ({
            category,
            totalHours: Math.round(totalHours * 100) / 100,
        }));

        // Per-employee OT breakdown keyed by monthlySummaryId
        const byEmployee = Object.entries(employeeOtMap).map(([summaryId, categories]) => ({
            summaryId,
            categories: Object.entries(categories).map(([category, hours]) => ({
                category,
                hours: Math.round(hours * 100) / 100,
            })),
        }));

        return {
            importId,
            totalEmployees: Object.keys(employeeOtMap).length,
            totalOtRecords: otRecords.length,
            byCategory,
            byEmployee,
        };
    }

    /**
     * Retrieves daily attendance records for a single employee within an import,
     * grouped by month for direct consumption by the frontend heatmap component.
     *
     * Returns a structured object with a `months` array, where each month contains
     * a `days` array with per-day hours and absence status.
     */
    async getEmployeeDailyRecords(
        companyId: number,
        importId: string,
        employeeId: string,
    ): Promise<{
        employeeId: string;
        importId: string;
        months: {
            key: string;
            monthName: string;
            year: number;
            days: { day: number; date: string; hours: number; isAbsent: boolean }[];
        }[];
    }> {
        // Verify the import belongs to this company
        const importRecord = await prisma.attendanceImport.findFirst({
            where: { id: importId, payrollPeriod: { companyId } },
            select: { id: true },
        });
        if (!importRecord) {
            throw new CustomError(httpStatus.NOT_FOUND, "Import not found");
        }

        const records = await prisma.attendanceRecord.findMany({
            where: { attendanceImportId: importId, employeeId },
            select: { date: true, regularHours: true, isAbsent: true },
            orderBy: { date: "asc" },
        });

        if (records.length === 0) {
            return { employeeId, importId, months: [] };
        }

        // Group records by YYYY-MM key
        const monthMap = new Map<
            string,
            { key: string; monthName: string; year: number; days: { day: number; date: string; hours: number; isAbsent: boolean }[] }
        >();

        for (const r of records) {
            const d = r.date;
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            const key = `${year}-${String(month).padStart(2, "0")}`;

            if (!monthMap.has(key)) {
                const date = new Date(year, month - 1, 2);
                monthMap.set(key, {
                    key,
                    monthName: date.toLocaleString("default", { month: "long" }),
                    year,
                    days: [],
                });
            }

            monthMap.get(key)!.days.push({
                day: d.getDate(),
                date: d.toISOString().slice(0, 10),
                hours: Number(r.regularHours),
                isAbsent: r.isAbsent,
            });
        }

        const months = Array.from(monthMap.values());

        return { employeeId, importId, months };
    }
}

// ── Singleton export ─────────────────────────────────────────────────────────

export const attendanceImportService = new AttendanceImportService();
