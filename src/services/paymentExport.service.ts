import ExcelJS from "exceljs";
import prisma from "../config/database";

export class PaymentExportService {
  /**
   * Generates a full-detailed Excel workbook for a payroll run.
   * Two sheets: Summary (period totals) and Payment Export (employee breakdown
   * with salary, allowances, earnings, deductions, overtime, bonuses, tax,
   * pension, net pay, bank info).
   */
  async exportExcel(runId: string): Promise<Buffer> {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { payrollPeriod: true },
    });
    if (!run) throw new Error("Payroll run not found");

    // Aggregate totals from ALL runs in the period for the summary sheet
    const periodTotals = await this.fetchPeriodTotals(runId);

    const items = await this.fetchItems(runId);
    console.log(`[PaymentExport] fetchItems returned ${items.length} items`);

    if (items.length === 0) {
      throw new Error("No payroll run items found for this run");
    }

    if (items.length > 0) {
      const sample = items[0];
      console.log(
        "[PaymentExport] Sample item:",
        JSON.stringify({
          id: sample.id,
          employeeId: (sample.employee as any)?.externalId ?? (sample.employee as any)?.id,
          employeeName: `${(sample.employee as any)?.firstName ?? ""} ${(sample.employee as any)?.lastName ?? ""}`,
          basicSalary: Number(sample.basicSalary),
          netSalary: Number(sample.netSalary),
          currency: sample.currency,
          isMidMonthHire: sample.isMidMonthHire,
          allowanceCount: sample.payrollAllowances.length,
          deductionCount: sample.payrollDeductions.length,
          bonusCount: sample.payrollBonuses.length,
        }),
      );
    }

    // ── Dynamic column sets from actual data ──
    const allowanceLabels = [
      ...new Set(items.flatMap((i) => i.payrollAllowances.map((a) => a.label))),
    ];
    const earningLabels = [
      ...new Set(items.flatMap((i) => i.payrollEarnings.map((e) => e.label))),
    ];
    const deductionLabels = [
      ...new Set(items.flatMap((i) => i.payrollDeductions.map((d) => d.label))),
    ];
    const otCategories = [
      ...new Set(items.flatMap((i) => i.payrollOvertime.map((o) => o.category))),
    ];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Payroll System";
    workbook.created = new Date();

    // ── Sheet 1: Summary ──────────────────────────────────────
    const summarySheet = workbook.addWorksheet("Summary");

    const periodLabel = run.payrollPeriod
      ? (run.payrollPeriod.name ?? new Date(run.payrollPeriod.startDate).toLocaleDateString("en-US", { month: "long", year: "numeric" }))
      : "—";

    const summaryRows = [
      { Metric: "Period", Value: periodLabel },
      { Metric: "Status", Value: "DONE" },
      { Metric: "Employees", Value: String(periodTotals.employeeCount) },
      { Metric: "Total Gross Salary", Value: periodTotals.totalGross },
      { Metric: "Total Tax", Value: periodTotals.totalTax },
      { Metric: "Total Pension", Value: periodTotals.totalPension },
      { Metric: "Total Overtime", Value: periodTotals.totalOvertime },
      { Metric: "Total Deductions", Value: periodTotals.totalDeductions },
      { Metric: "Total Net Pay", Value: periodTotals.totalNet },
      { Metric: "Cost to Company", Value: periodTotals.totalCostToCompany },
      { Metric: "Processed At", Value: periodTotals.processedAt },
    ];

    summarySheet.columns = [
      { header: "Metric", key: "Metric", width: 25 },
      { header: "Value", key: "Value", width: 30 },
    ];
    summarySheet.getRow(1).font = { bold: true };

    for (const row of summaryRows) {
      const r = summarySheet.addRow(row);
      // Right-align numeric values
      if (typeof row.Value === "number") {
        r.getCell(2).numFmt = '#,##0.00';
      }
    }

    // ── Sheet 2: Payment Export (employee breakdown) ──────────
    const sheet = workbook.addWorksheet("Payment Export");

    // ── Column definitions ──
    const columns: Partial<ExcelJS.Column>[] = [
      { header: "Employee ID", key: "employeeId", width: 15 },
      { header: "Employee Name", key: "employeeName", width: 28 },
      { header: "First Name", key: "firstName", width: 18 },
      { header: "Last Name", key: "lastName", width: 18 },
      { header: "Department", key: "department", width: 20 },
      { header: "TIN Number", key: "tinNumber", width: 18 },
      { header: "Currency", key: "currency", width: 10 },
      { header: "Mid-Month Hire", key: "isMidMonthHire", width: 14 },
      { header: "Basic Salary", key: "basicSalary", width: 16 },
      { header: "Prorated Salary", key: "proratedSalary", width: 16 },
      { header: "Work Days", key: "workDays", width: 10 },
      { header: "Gross Taxable Income", key: "grossTaxableIncome", width: 20 },
      { header: "Gross Salary", key: "grossSalary", width: 16 },
      ...allowanceLabels.map((l) => ({
        header: `Allowance: ${l}`,
        key: `allowance_${l}`,
        width: 20,
      })),
      ...earningLabels.map((l) => ({
        header: `Earning: ${l}`,
        key: `earning_${l}`,
        width: 20,
      })),
      ...otCategories.map((c) => ({
        header: `OT: ${c}`,
        key: `ot_${c}`,
        width: 16,
      })),
      { header: "Gross Bonus", key: "grossBonus", width: 14 },
      { header: "Tax on Bonus", key: "taxOnBonus", width: 14 },
      { header: "Net Bonus", key: "netBonus", width: 14 },
      ...deductionLabels.map((l) => ({
        header: `Deduction: ${l}`,
        key: `deduction_${l}`,
        width: 20,
      })),
      { header: "Total Deductions", key: "totalDeductions", width: 16 },
      { header: "Tax Amount", key: "taxAmount", width: 14 },
      { header: "Pension (Employee)", key: "pensionEmployee", width: 18 },
      { header: "Pension (Employer)", key: "pensionEmployer", width: 18 },
      { header: "Net Salary", key: "netSalary", width: 16 },
      { header: "Cost to Company", key: "costToCompany", width: 18 },
      { header: "Bank Name", key: "bankName", width: 20 },
      { header: "Account Name", key: "accountName", width: 22 },
      { header: "Account Number", key: "accountNumber", width: 20 },
    ];

    sheet.columns = columns;
    sheet.getRow(1).font = { bold: true };

    // ── Data rows ──
    const totals: Record<string, number> = {};
    const allKeys = columns
      .map((c) => c.key as string)
      .filter(
        (k) =>
          k !== "employeeId" &&
          k !== "employeeName" &&
          k !== "firstName" &&
          k !== "lastName" &&
          k !== "department" &&
          k !== "tinNumber" &&
          k !== "currency" &&
          k !== "isMidMonthHire" &&
          k !== "bankName" &&
          k !== "accountName" &&
          k !== "accountNumber",
      );

    for (const item of items) {
      const emp = item.employee as any;
      const row: Record<string, any> = {
        employeeId: emp.externalId ?? emp.id,
        employeeName: `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim(),
        firstName: emp.firstName,
        lastName: emp.lastName,
        department: emp.department?.name ?? emp.departmentName ?? "—",
        tinNumber: emp.tinNumber ?? "—",
        currency: item.currency,
        isMidMonthHire: item.isMidMonthHire ? "Yes" : "No",
        basicSalary: Number(item.basicSalary),
        proratedSalary: Number(item.proratedSalary),
        workDays: Number(item.workDays),
        grossTaxableIncome: Number(item.grossTaxableIncome),
        grossSalary: Number(item.grossSalary),
      };

      // Dynamic allowance columns
      for (const label of allowanceLabels) {
        const match = item.payrollAllowances.find((a) => a.label === label);
        row[`allowance_${label}`] = match ? Number(match.amount) : 0;
      }

      // Dynamic earning columns
      for (const label of earningLabels) {
        const match = item.payrollEarnings.find((e) => e.label === label);
        row[`earning_${label}`] = match ? Number(match.amount) : 0;
      }

      // Dynamic OT columns
      for (const cat of otCategories) {
        const match = item.payrollOvertime.find((o) => o.category === cat);
        row[`ot_${cat}`] = match ? Number(match.amount) : 0;
      }

      // Bonus
      const totalGrossBonus = item.payrollBonuses.reduce(
        (s, b) => s + Number(b.grossBonus),
        0,
      );
      const totalTaxOnBonus = item.payrollBonuses.reduce(
        (s, b) => s + Number(b.taxOnBonus),
        0,
      );
      const totalNetBonus = item.payrollBonuses.reduce(
        (s, b) => s + Number(b.netBonus),
        0,
      );
      row.grossBonus = totalGrossBonus;
      row.taxOnBonus = totalTaxOnBonus;
      row.netBonus = totalNetBonus;

      // Dynamic deduction columns
      for (const label of deductionLabels) {
        const match = item.payrollDeductions.find((d) => d.label === label);
        row[`deduction_${label}`] = match ? Number(match.amount) : 0;
      }

      row.totalDeductions = Number(item.totalDeductions);
      row.taxAmount = Number(item.payrollTax?.taxAmount ?? 0);
      row.pensionEmployee = Number(item.payrollPension?.employeeContribution ?? 0);
      row.pensionEmployer = Number(item.payrollPension?.employerContribution ?? 0);
      row.netSalary = Number(item.netSalary);
      row.costToCompany = Number(item.costToCompany);

      // Bank info
      const primaryBank = emp.bankAccounts?.[0];
      row.bankName = primaryBank?.bank?.name ?? "—";
      row.accountName = primaryBank?.accountName ?? "—";
      row.accountNumber = primaryBank?.accountNumber ?? "—";

      sheet.addRow(row);

      // Accumulate totals
      for (const k of allKeys) {
        totals[k] = (totals[k] ?? 0) + Number(row[k] ?? 0);
      }
    }

    // ── Totals row ──
    const totalsRow: Record<string, any> = {
      employeeId: "",
      employeeName: "",
      firstName: "",
      lastName: "",
      department: "TOTALS",
      tinNumber: "",
      currency: "",
      isMidMonthHire: "",
    };
    for (const k of allKeys) {
      totalsRow[k] = totals[k] ?? 0;
    }
    totalsRow.bankName = "";
    totalsRow.accountName = "";
    totalsRow.accountNumber = "";

    const totalsExcelRow = sheet.addRow(totalsRow);
    totalsExcelRow.font = { bold: true };
    totalsExcelRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF0F0F0" },
      };
    });

    console.log(`[PaymentExport] Excel generated — ${items.length} rows`);
    const raw = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(raw);
    console.log(`[PaymentExport] Buffer size: ${buffer.length} bytes`);
    return buffer;
  }

  /**
   * Generates a money-only CSV for a payroll run.
   * Includes all monetary columns (salary, allowances, earnings, deductions,
   * overtime, bonuses, tax, pension, net) plus employee identifiers.
   * Non-monetary columns (work days, department, TIN) are excluded.
   */
  async exportCsv(runId: string): Promise<string> {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { payrollPeriod: true },
    });
    if (!run) throw new Error("Payroll run not found");

    const items = await this.fetchItems(runId);
    console.log(`[PaymentExport CSV] fetchItems returned ${items.length} items`);

    if (items.length === 0) {
      throw new Error("No payroll run items found for this run");
    }

    // ── Dynamic column sets ──
    const allowanceLabels = [
      ...new Set(items.flatMap((i) => i.payrollAllowances.map((a) => a.label))),
    ];
    const earningLabels = [
      ...new Set(items.flatMap((i) => i.payrollEarnings.map((e) => e.label))),
    ];
    const deductionLabels = [
      ...new Set(items.flatMap((i) => i.payrollDeductions.map((d) => d.label))),
    ];
    const otCategories = [
      ...new Set(items.flatMap((i) => i.payrollOvertime.map((o) => o.category))),
    ];

    // Only money-related columns + employee identifiers
    const csvKeys: { header: string; key: string }[] = [
      { header: "Employee ID", key: "employeeId" },
      { header: "Employee Name", key: "employeeName" },
      { header: "First Name", key: "firstName" },
      { header: "Last Name", key: "lastName" },
      { header: "Currency", key: "currency" },
      { header: "Mid-Month Hire", key: "isMidMonthHire" },
      { header: "Basic Salary", key: "basicSalary" },
      { header: "Prorated Salary", key: "proratedSalary" },
      { header: "Gross Taxable Income", key: "grossTaxableIncome" },
      { header: "Gross Salary", key: "grossSalary" },
      ...allowanceLabels.map((l) => ({ header: `Allowance: ${l}`, key: `allowance_${l}` })),
      ...earningLabels.map((l) => ({ header: `Earning: ${l}`, key: `earning_${l}` })),
      ...otCategories.map((c) => ({ header: `OT: ${c}`, key: `ot_${c}` })),
      { header: "Gross Bonus", key: "grossBonus" },
      { header: "Tax on Bonus", key: "taxOnBonus" },
      { header: "Net Bonus", key: "netBonus" },
      ...deductionLabels.map((l) => ({ header: `Deduction: ${l}`, key: `deduction_${l}` })),
      { header: "Total Deductions", key: "totalDeductions" },
      { header: "Tax Amount", key: "taxAmount" },
      { header: "Pension (Employee)", key: "pensionEmployee" },
      { header: "Pension (Employer)", key: "pensionEmployer" },
      { header: "Net Salary", key: "netSalary" },
      { header: "Cost to Company", key: "costToCompany" },
      { header: "Bank Name", key: "bankName" },
      { header: "Account Number", key: "accountNumber" },
    ];

    const moneyKeys = csvKeys
      .map((k) => k.key)
      .filter(
        (k) =>
          k !== "employeeId" &&
          k !== "employeeName" &&
          k !== "firstName" &&
          k !== "lastName" &&
          k !== "currency" &&
          k !== "isMidMonthHire" &&
          k !== "bankName" &&
          k !== "accountNumber",
      );

    const csvEscape = (val: any): string => {
      const s = String(val ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const headerRow = csvKeys.map((k) => csvEscape(k.header)).join(",");
    const dataRows: string[] = [headerRow];

    const totals: Record<string, number> = {};

    for (const item of items) {
      const emp = item.employee as any;
      const row: Record<string, any> = {
        employeeId: emp.externalId ?? emp.id,
        employeeName: `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim(),
        firstName: emp.firstName,
        lastName: emp.lastName,
        currency: item.currency,
        isMidMonthHire: item.isMidMonthHire ? "Yes" : "No",
        basicSalary: Number(item.basicSalary),
        proratedSalary: Number(item.proratedSalary),
        grossTaxableIncome: Number(item.grossTaxableIncome),
        grossSalary: Number(item.grossSalary),
      };

      for (const label of allowanceLabels) {
        const match = item.payrollAllowances.find((a) => a.label === label);
        row[`allowance_${label}`] = match ? Number(match.amount) : 0;
      }
      for (const label of earningLabels) {
        const match = item.payrollEarnings.find((e) => e.label === label);
        row[`earning_${label}`] = match ? Number(match.amount) : 0;
      }
      for (const cat of otCategories) {
        const match = item.payrollOvertime.find((o) => o.category === cat);
        row[`ot_${cat}`] = match ? Number(match.amount) : 0;
      }

      row.grossBonus = item.payrollBonuses.reduce(
        (s, b) => s + Number(b.grossBonus),
        0,
      );
      row.taxOnBonus = item.payrollBonuses.reduce(
        (s, b) => s + Number(b.taxOnBonus),
        0,
      );
      row.netBonus = item.payrollBonuses.reduce(
        (s, b) => s + Number(b.netBonus),
        0,
      );

      for (const label of deductionLabels) {
        const match = item.payrollDeductions.find((d) => d.label === label);
        row[`deduction_${label}`] = match ? Number(match.amount) : 0;
      }

      row.totalDeductions = Number(item.totalDeductions);
      row.taxAmount = Number(item.payrollTax?.taxAmount ?? 0);
      row.pensionEmployee = Number(item.payrollPension?.employeeContribution ?? 0);
      row.pensionEmployer = Number(item.payrollPension?.employerContribution ?? 0);
      row.netSalary = Number(item.netSalary);
      row.costToCompany = Number(item.costToCompany);

      const primaryBank = emp.bankAccounts?.[0];
      row.bankName = primaryBank?.bank?.name ?? "—";
      row.accountNumber = primaryBank?.accountNumber ?? "—";

      dataRows.push(csvKeys.map((k) => csvEscape(row[k.key] ?? 0)).join(","));

      for (const k of moneyKeys) {
        totals[k] = (totals[k] ?? 0) + Number(row[k] ?? 0);
      }
    }

    // ── Totals row ──
    const totalsRow: Record<string, any> = {
      employeeId: "",
      employeeName: "",
      firstName: "",
      lastName: "TOTALS",
      currency: "",
      isMidMonthHire: "",
    };
    for (const k of moneyKeys) {
      totalsRow[k] = totals[k] ?? 0;
    }
    totalsRow.bankName = "";
    totalsRow.accountNumber = "";
    dataRows.push(csvKeys.map((k) => csvEscape(totalsRow[k.key] ?? "")).join(","));

    console.log(`[PaymentExport CSV] Generated ${dataRows.length} rows (incl. header + totals)`);
    return dataRows.join("\n");
  }

  // ── Private helpers ──

  private async fetchItems(runId: string) {
    const includeClause = {
      employee: {
        select: {
          id: true,
          externalId: true,
          firstName: true,
          lastName: true,
          tinNumber: true,
          department: { select: { name: true } },
          bankAccounts: {
            where: { isPrimary: true },
            take: 1,
            include: { bank: true },
          },
        },
      },
      payrollAllowances: true,
      payrollEarnings: true,
      payrollDeductions: true,
      payrollTax: true,
      payrollPension: true,
      payrollOvertime: true,
      payrollBonuses: { include: { bonusRule: true } },
    } as const;

    // 1. Find the payroll period from the given run
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      select: { payrollPeriodId: true },
    });

    // 2. If we found the period, aggregate items from ALL runs in the period
    //    so the export includes every employee regardless of which batch/run
    //    the frontend sent.  Deduplicate by employeeId to handle edge cases
    //    where the same employee appears in multiple sibling runs.
    if (run?.payrollPeriodId) {
      const periodRuns = await prisma.payrollRun.findMany({
        where: { payrollPeriodId: run.payrollPeriodId },
        select: { id: true },
      });
      if (periodRuns.length > 0) {
        const allItems = await prisma.payrollRunItem.findMany({
          where: { payrollRunId: { in: periodRuns.map((r) => r.id) } },
          include: includeClause,
          orderBy: { createdAt: "asc" },
        });

        // Deduplicate by employeeId — keep the first occurrence (oldest run)
        const seen = new Set<string>();
        const deduped: typeof allItems = [];
        for (const item of allItems) {
          if (!seen.has(item.employeeId)) {
            seen.add(item.employeeId);
            deduped.push(item);
          }
        }

        console.log(
          `[PaymentExport fetchItems] ${allItems.length} raw -> ${deduped.length} unique employees across ${periodRuns.length} runs`,
        );
        return deduped;
      }
    }

    // 3. Fallback: just return items for the requested run
    const items = await prisma.payrollRunItem.findMany({
      where: { payrollRunId: runId },
      include: includeClause,
    });
    console.log(
      `[PaymentExport fetchItems] Fallback — ${items.length} items from direct run`,
    );
    return items;
  }

  /**
   * Aggregates payroll run totals (gross, net, tax, etc.) across ALL runs
   * in the same payroll period.  The summary sheet uses these so it reflects
   * every batch/department, not just the single run the frontend sent.
   */
  private async fetchPeriodTotals(runId: string) {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      select: { payrollPeriodId: true },
    });
    if (!run?.payrollPeriodId) {
      return { employeeCount: 0, totalGross: 0, totalTax: 0, totalPension: 0, totalOvertime: 0, totalDeductions: 0, totalNet: 0, totalCostToCompany: 0, processedAt: "—" };
    }

    const allRuns = await prisma.payrollRun.findMany({
      where: { payrollPeriodId: run.payrollPeriodId },
      select: {
        employeeCount: true,
        totalGross: true,
        totalTax: true,
        totalPension: true,
        totalOvertime: true,
        totalNet: true,
        totalCostToCompany: true,
        processedAt: true,
      },
    });

    const agg = {
      employeeCount: allRuns.reduce((s, r) => s + Number(r.employeeCount), 0),
      totalGross: allRuns.reduce((s, r) => s + Number(r.totalGross), 0),
      totalTax: allRuns.reduce((s, r) => s + Number(r.totalTax), 0),
      totalPension: allRuns.reduce((s, r) => s + Number(r.totalPension), 0),
      totalOvertime: allRuns.reduce((s, r) => s + Number(r.totalOvertime), 0),
      totalDeductions: allRuns.reduce((s, r) => s + Number(r.totalGross) - Number(r.totalNet), 0),
      totalNet: allRuns.reduce((s, r) => s + Number(r.totalNet), 0),
      totalCostToCompany: allRuns.reduce((s, r) => s + Number(r.totalCostToCompany), 0),
      processedAt: allRuns.some((r) => r.processedAt)
        ? new Date(Math.max(...allRuns.filter((r) => r.processedAt).map((r) => r.processedAt!.getTime()))).toLocaleString()
        : "—",
    };

    console.log("[PaymentExport] Period totals:", JSON.stringify(agg));
    return agg;
  }
}

export const paymentExportService = new PaymentExportService();
