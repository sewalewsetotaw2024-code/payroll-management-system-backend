import ExcelJS from "exceljs";
import prisma from "../config/database";
import CustomError from "../utils/customError";
import httpStatus from "http-status";

interface ReportFilters {
  companyId: number;
  payrollRunId: string;
  periodLabel: string;
}

function createWorkbook(): ExcelJS.Workbook {
  return new ExcelJS.Workbook();
}

function addSummaryRow(ws: ExcelJS.Worksheet, label: string, value: string | number): void {
  const row = ws.addRow([label, value]);
  row.getCell(1).font = { bold: true };
}

function styleHeaderRow(ws: ExcelJS.Worksheet, headerRow: ExcelJS.Row): void {
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  });
}

function styleDataCells(ws: ExcelJS.Worksheet, startRow: number, endRow: number, colCount: number): void {
  for (let r = startRow; r <= endRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { vertical: "middle" };
    }
  }
}

export async function generateTaxReport(
  filters: ReportFilters,
  workbook: ExcelJS.Workbook,
): Promise<ExcelJS.Workbook> {
  const { payrollRunId, periodLabel } = filters;

  const items = await prisma.payrollRunItem.findMany({
    where: { payrollRunId, payrollRun: { status: "DONE" } },
    include: {
      employee: {
        select: {
          externalId: true, firstName: true, lastName: true, tinNumber: true, hireDate: true,
          department: { select: { name: true } },
        },
      },
      payrollTax: true,
      payrollAllowances: true,
      payrollOvertime: true,
      payrollPension: true,
      payrollDeductions: true,
    },
    orderBy: { employee: { firstName: "asc" } },
  });

  if (items.length === 0) {
    throw new CustomError(httpStatus.NOT_FOUND, "No payroll items found for this period");
  }

  // Summary sheet
  const summaryWs = workbook.addWorksheet("Summary");
  summaryWs.columns = [{ width: 30 }, { width: 20 }];
  addSummaryRow(summaryWs, "Report Type", "Income Tax (MoR)");
  addSummaryRow(summaryWs, "Period", periodLabel);
  addSummaryRow(summaryWs, "Generated", new Date().toISOString().slice(0, 10));
  addSummaryRow(summaryWs, "Total Employees", items.length);
  addSummaryRow(summaryWs, "Total Tax", items.reduce((s, i) => s + Number(i.payrollTax?.taxAmount ?? 0), 0));

  // Helper to identify transport allowances by label
  const isTransportLabel = (label: string) =>
    /transport/i.test(label);

  // Detail sheet
  const ws = workbook.addWorksheet("Employee Tax Details");
  ws.columns = [
    { width: 5 },   // #
    { width: 20 },  // External ID
    { width: 30 },  // Employee Name
    { width: 20 },  // TIN Number
    { width: 16 },  // Date of Employment
    { width: 18 },  // Basic Earning (prorated)
    { width: 18 },  // Total Transport Allowance
    { width: 18 },  // Taxable Transport Allowance
    { width: 18 },  // Overtime
    { width: 18 },  // Other Allowances
    { width: 18 },  // Gross Taxable Income
    { width: 18 },  // Cost Sharing
    { width: 18 },  // Net Pay
  ];

  const headerRow = ws.addRow(["#", "External ID", "Employee Name", "TIN Number", "Date of Employment", "Basic Earning", "Total Transport Allowance", "Taxable Transport Allowance", "Overtime", "Other Allowances", "Gross Taxable Income", "Cost Sharing", "Net Pay"]);
  styleHeaderRow(ws, headerRow);

  items.forEach((item, idx) => {
    const allowances = item.payrollAllowances ?? [];
    const transportAllowances = allowances.filter((a: any) => isTransportLabel(a.label));
    const totalTransport = transportAllowances.reduce((s: number, a: any) => s + Number(a.amount), 0);
    // Taxable transport = sum of transport allowances where isTaxable=true
    const taxableTransport = transportAllowances
      .filter((a: any) => a.isTaxable)
      .reduce((s: number, a: any) => s + Number(a.amount), 0);
    const otherAllowances = allowances
      .filter((a: any) => !isTransportLabel(a.label))
      .reduce((s: number, a: any) => s + Number(a.amount), 0);
    const overtime = (item.payrollOvertime ?? [])
      .reduce((s: number, o: any) => s + Number(o.amount), 0);
    const costSharing = (item.payrollDeductions ?? [])
      .filter((d: any) => d.deductionType === 'COST_SHARING')
      .reduce((s: number, d: any) => s + Number(d.amount), 0);
    const hireDate = item.employee.hireDate
      ? new Date(item.employee.hireDate).toISOString().slice(0, 10)
      : "";

    ws.addRow([
      idx + 1,
      item.employee.externalId ?? "",
      `${item.employee.firstName} ${item.employee.lastName}`,
      item.employee.tinNumber ?? "",
      hireDate,
      Number(item.proratedSalary),
      totalTransport,
      taxableTransport,
      overtime,
      otherAllowances,
      Number(item.grossTaxableIncome),
      costSharing,
      Number(item.netSalary),
    ]);
  });

  styleDataCells(ws, 2, items.length + 1, 13);

  // Format currency columns (Basic Earning through Net Pay = cols 6-13)
  for (let r = 2; r <= items.length + 1; r++) {
    for (let c = 6; c <= 13; c++) {
      ws.getRow(r).getCell(c).numFmt = '#,##0.00';
    }
  }

  return workbook;
}

export async function generatePensionReport(
  filters: ReportFilters,
  workbook: ExcelJS.Workbook,
): Promise<ExcelJS.Workbook> {
  const { payrollRunId, periodLabel } = filters;

  const items = await prisma.payrollRunItem.findMany({
    where: { payrollRunId, payrollRun: { status: "DONE" } },
    include: {
      employee: {
        select: {
          externalId: true, firstName: true, lastName: true, tinNumber: true, hireDate: true,
          compensation: { select: { pensionNo: true } },
        },
      },
      payrollPension: true,
    },
    orderBy: { employee: { firstName: "asc" } },
  });

  if (items.length === 0) {
    throw new CustomError(httpStatus.NOT_FOUND, "No payroll items found for this period");
  }

  // Summary
  const summaryWs = workbook.addWorksheet("Summary");
  summaryWs.columns = [{ width: 30 }, { width: 20 }];
  addSummaryRow(summaryWs, "Report Type", "Pension (POESSA)");
  addSummaryRow(summaryWs, "Period", periodLabel);
  addSummaryRow(summaryWs, "Generated", new Date().toISOString().slice(0, 10));
  addSummaryRow(summaryWs, "Total Employees", items.length);
  const totalEmployeeContrib = items.reduce((s, i) => s + Number(i.payrollPension?.employeeContribution ?? 0), 0);
  const totalEmployerContrib = items.reduce((s, i) => s + Number(i.payrollPension?.employerContribution ?? 0), 0);
  addSummaryRow(summaryWs, "Total Employee Contribution", totalEmployeeContrib);
  addSummaryRow(summaryWs, "Total Employer Contribution", totalEmployerContrib);
  addSummaryRow(summaryWs, "Grand Total", totalEmployeeContrib + totalEmployerContrib);

  // Detail
  const ws = workbook.addWorksheet("Employee Pension Details");
  ws.columns = [
    { width: 5 },   // #
    { width: 30 },  // Employee Name
    { width: 20 },  // TIN Number
    { width: 20 },  // Pension No
    { width: 16 },  // Date of Employment
    { width: 18 },  // Basic Salary
    { width: 18 },  // 7% (Employee)
    { width: 18 },  // 11% (Employer)
    { width: 18 },  // Total 18%
  ];

  const headerRow = ws.addRow(["#", "Employee Name", "TIN Number", "Pension No", "Date of Employment", "Basic Salary", "7% (Employee)", "11% (Employer)", "Total 18%"]);
  styleHeaderRow(ws, headerRow);

  items.forEach((item, idx) => {
    const empContrib = Number(item.payrollPension?.employeeContribution ?? 0);
    const empyerContrib = Number(item.payrollPension?.employerContribution ?? 0);
    const hireDate = item.employee.hireDate
      ? new Date(item.employee.hireDate).toISOString().slice(0, 10)
      : "";
    ws.addRow([
      idx + 1,
      `${item.employee.firstName} ${item.employee.lastName}`,
      item.employee.tinNumber ?? "",
      item.employee.compensation?.pensionNo ?? "",
      hireDate,
      Number(item.payrollPension?.baseSalary ?? 0),
      empContrib,
      empyerContrib,
      empContrib + empyerContrib,
    ]);
  });

  styleDataCells(ws, 2, items.length + 1, 9);
  for (let r = 2; r <= items.length + 1; r++) {
    for (let c = 6; c <= 9; c++) {
      ws.getRow(r).getCell(c).numFmt = '#,##0.00';
    }
  }

  return workbook;
}

export async function generateBankReport(
  filters: ReportFilters,
  workbook: ExcelJS.Workbook,
): Promise<ExcelJS.Workbook> {
  const { payrollRunId, periodLabel } = filters;

  const items = await prisma.payrollRunItem.findMany({
    where: { payrollRunId, payrollRun: { status: "DONE" } },
    include: {
      employee: {
        select: {
          firstName: true, lastName: true,
          bankAccounts: {
            where: { isPrimary: true, isActive: true },
            select: { accountNumber: true, accountName: true, bank: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
    orderBy: { employee: { firstName: "asc" } },
  });

  if (items.length === 0) {
    throw new CustomError(httpStatus.NOT_FOUND, "No payroll items found for this period");
  }

  // Summary
  const summaryWs = workbook.addWorksheet("Summary");
  summaryWs.columns = [{ width: 30 }, { width: 20 }];
  addSummaryRow(summaryWs, "Report Type", "Bank Transfer");
  addSummaryRow(summaryWs, "Period", periodLabel);
  addSummaryRow(summaryWs, "Generated", new Date().toISOString().slice(0, 10));
  addSummaryRow(summaryWs, "Total Employees", items.length);
  addSummaryRow(summaryWs, "Total Net Pay", items.reduce((s, i) => s + Number(i.netSalary), 0));

  // Detail
  const ws = workbook.addWorksheet("Employee Bank Details");
  ws.columns = [
    { width: 5 },   // #
    { width: 30 },  // Employee Name
    { width: 25 },  // Bank Name
    { width: 25 },  // Account Number
    { width: 30 },  // Account Name
    { width: 18 },  // Net Pay
  ];

  const headerRow = ws.addRow(["#", "Employee Name", "Bank Name", "Account Number", "Account Name", "Net Pay"]);
  styleHeaderRow(ws, headerRow);

  items.forEach((item, idx) => {
    const bankAccount = item.employee.bankAccounts[0];
    ws.addRow([
      idx + 1,
      `${item.employee.firstName} ${item.employee.lastName}`,
      bankAccount?.bank?.name ?? "",
      bankAccount?.accountNumber ?? "",
      bankAccount?.accountName ?? "",
      Number(item.netSalary),
    ]);
  });

  styleDataCells(ws, 2, items.length + 1, 6);
  for (let r = 2; r <= items.length + 1; r++) {
    ws.getRow(r).getCell(6).numFmt = '#,##0.00';
  }

  return workbook;
}
