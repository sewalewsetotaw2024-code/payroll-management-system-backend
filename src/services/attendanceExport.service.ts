import ExcelJS from "exceljs";
import prisma from "../config/database";

export class AttendanceExportService {
  async generateExport(importId: string): Promise<Buffer> {
    const attendanceImport = await prisma.attendanceImport.findUnique({
      where: { id: importId },
      include: {
        payrollPeriod: true,
        attendanceRecords: {
          include: { employee: true, overtimeRecords: true },
        },
        monthlySummaries: true,
        attendancePeriodSummaries: {
          include: { employee: true },
        },
      },
    });

    if (!attendanceImport) {
      throw new Error("Attendance import not found");
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Payroll System";
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.columns = [
      { header: "Field", key: "field", width: 30 },
      { header: "Value", key: "value", width: 40 },
    ];

    const summaryRows = [
      { field: "Payroll Period", value: attendanceImport.payrollPeriod?.name || attendanceImport.periodLabel || "—" },
      { field: "Import Date", value: attendanceImport.importedAt.toISOString().split("T")[0] },
      { field: "Status", value: attendanceImport.status },
      { field: "Total Employees", value: attendanceImport.totalEmployees },
      { field: "Total Records", value: attendanceImport.totalRecords },
      { field: "Imported By", value: attendanceImport.importedBy },
      { field: "Active", value: attendanceImport.isActive ? "Yes" : "No" },
    ];

    summaryRows.forEach((row) => summarySheet.addRow(row));
    summarySheet.getRow(1).font = { bold: true };

    const recordsSheet = workbook.addWorksheet("Attendance Records");
    recordsSheet.columns = [
      { header: "Employee ID", key: "employeeId", width: 15 },
      { header: "Employee Name", key: "employeeName", width: 30 },
      { header: "Date", key: "date", width: 14 },
      { header: "Check In", key: "checkIn", width: 12 },
      { header: "Check Out", key: "checkOut", width: 12 },
      { header: "Regular Hours", key: "regularHours", width: 14 },
      { header: "Late (min)", key: "lateMinutes", width: 12 },
      { header: "Absent", key: "isAbsent", width: 10 },
      { header: "OT Hours", key: "otHours", width: 12 },
    ];
    recordsSheet.getRow(1).font = { bold: true };

    for (const record of attendanceImport.attendanceRecords) {
      const totalOt = record.overtimeRecords?.reduce(
        (sum, ot) => sum + Number(ot.hours || 0),
        0,
      ) ?? 0;

      recordsSheet.addRow({
        employeeId: record.employeeId,
        employeeName: record.employee?.firstName
          ? `${record.employee.firstName} ${record.employee.lastName || ""}`
          : record.employeeId,
        date: record.date instanceof Date ? record.date.toISOString().split("T")[0] : String(record.date),
        checkIn: record.checkIn
          ? new Date(record.checkIn).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
          : "—",
        checkOut: record.checkOut
          ? new Date(record.checkOut).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
          : "—",
        regularHours: Number(record.regularHours),
        lateMinutes: record.lateMinutes,
        isAbsent: record.isAbsent ? "Yes" : "No",
        otHours: totalOt,
      });
    }

    if (attendanceImport.attendancePeriodSummaries.length > 0) {
      const summaryDataSheet = workbook.addWorksheet("Employee Summary");
      summaryDataSheet.columns = [
        { header: "Employee ID", key: "employeeId", width: 15 },
        { header: "Employee Name", key: "employeeName", width: 30 },
        { header: "Total Hours", key: "totalHours", width: 14 },
        { header: "Total Days", key: "totalDays", width: 12 },
        { header: "Absences", key: "absences", width: 12 },
      ];
      summaryDataSheet.getRow(1).font = { bold: true };

      for (const summary of attendanceImport.attendancePeriodSummaries) {
        summaryDataSheet.addRow({
          employeeId: summary.employeeId,
          employeeName: (summary as any).employee?.firstName
            ? `${(summary as any).employee.firstName} ${(summary as any).employee.lastName || ""}`
            : summary.employeeId,
          totalHours: Number(summary.totalHours),
          totalDays: summary.workingDays ?? 0,
          absences: summary.absentDays ?? 0,
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

export const attendanceExportService = new AttendanceExportService();
