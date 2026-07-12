import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";

const dbUrl = new URL(process.env.DATABASE_URL!);

const pool = new Pool({
  host: dbUrl.hostname,
  port: Number(dbUrl.port || 5432),
  database: dbUrl.pathname.slice(1),
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  connectionTimeoutMillis: 10000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── Helpers ─────────────────────────────────────────────────────────────

function parseSalary(val: string | undefined | null): number | null {
  if (!val || val.trim() === "") return null;
  return parseFloat(val.replace(/,/g, ""));
}

function parseDate(val: string | undefined | null): Date | null {
  if (!val || val.trim() === "") return null;
  // Handle "1-Jun-22" format
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const m = val.match(/^(\d+)-([A-Za-z]{3})-(\d{2})$/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = months[m[2].toLowerCase()] || "01";
    const year = parseInt(m[3]) + 2000;
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  }
  // Try ISO
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  // 3+ parts: first name = first word, last name = rest
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

// ── Main ────────────────────────────────────────────────────────────────

const DEFAULT_DEDUCTION_TYPES = [
  { deductionType: "EMPLOYMENT_INCOME_TAX", label: "Employment Income Tax", currency: "ETB", isStatutory: true, isMandatory: true },
  { deductionType: "PENSION_EMPLOYEE", label: "Pension (Employee)", currency: "ETB", isStatutory: true, isMandatory: true },
  { deductionType: "LOAN_REPAYMENT", label: "Staff Loan Repayment", currency: "ETB" },
  { deductionType: "ADVANCE_RECOVERY", label: "Salary Advance Recovery", currency: "ETB" },
  { deductionType: "COST_SHARING", label: "Cost Sharing", currency: "ETB" },
  { deductionType: "UNION_DUES", label: "Union Dues", currency: "ETB" },
  { deductionType: "COURT_ORDER", label: "Court Order Deduction", currency: "ETB" },
  { deductionType: "UNPAID_LEAVE", label: "Unpaid Leave Deduction", currency: "ETB" },
  { deductionType: "LATENESS", label: "Lateness Deduction", currency: "ETB" },
  { deductionType: "SAVINGS_AND_CREDIT", label: "Savings & Credit Cooperative", currency: "ETB" },
  { deductionType: "HEALTH_INSURANCE", label: "Health Insurance Premium", currency: "ETB" },
  { deductionType: "LIFE_INSURANCE", label: "Life Insurance Premium", currency: "ETB" },
  { deductionType: "FINE_PENALTY", label: "Fine / Penalty", currency: "ETB" },
  { deductionType: "OVERPAYMENT_RECOVERY", label: "Overpayment Recovery", currency: "ETB" },
  { deductionType: "CHILD_SUPPORT", label: "Child Support", currency: "ETB" },
  { deductionType: "GARNISHMENT", label: "Wage Garnishment", currency: "ETB" },
  { deductionType: "OTHER", label: "Other Deduction", currency: "ETB" },
];

const TAX_BRACKETS_1395_2025 = [
  { lowerBound: 0, upperBound: 2000, rate: 0, deductionAmount: 0 },
  { lowerBound: 2001, upperBound: 4000, rate: 0.15, deductionAmount: 300 },
  { lowerBound: 4001, upperBound: 7000, rate: 0.20, deductionAmount: 500 },
  { lowerBound: 7001, upperBound: 10000, rate: 0.25, deductionAmount: 850 },
  { lowerBound: 10001, upperBound: 14000, rate: 0.30, deductionAmount: 1350 },
  { lowerBound: 14001, upperBound: null, rate: 0.35, deductionAmount: 2050 },
];

async function main() {
  // IMPORTANT: Company ID must match the employee management system's company ID.
  // Employee DB: SELECT id FROM company WHERE company_code = 'KACHA' → id = 2
  const companyId = 2;

  console.log("=== Step 1: Company ===");
  let company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        id: companyId,
        name: "Kacha Digital Financial Service S.C.",
        code: "KACHA",
        isActive: true,
      },
    });
    console.log(`  Created company: ${company.name} (id: ${company.id})`);
  } else {
    console.log(`  Company already exists: ${company.name}`);
  }

  // ── Departments from JSON ─────────────────────────────────────────
  console.log("\n=== Step 2: Departments ===");
  const jsonPath = path.resolve(process.cwd(), "..", "employee-management-system", "backend", "company-data", "employees_all.json");
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Record<string, any>[];

  const uniqueDepts = [...new Set(raw.map((e: any) => e.department).filter(Boolean))];
  const deptMap: Record<string, number> = {};
  let deptId = 1;
  for (const deptName of uniqueDepts) {
    let dept = await prisma.department.findFirst({
      where: { companyId, name: deptName },
    });
    if (!dept) {
      dept = await prisma.department.create({
        data: { id: deptId++, companyId, name: deptName },
      });
      console.log(`  Created department: ${deptName}`);
    }
    deptMap[deptName] = dept.id;
  }

  // ── Default Salary Structure ──────────────────────────────────────
  console.log("\n=== Step 3: Default Salary Structure ===");
  let structure = await prisma.salaryStructure.findFirst({
    where: { companyId, isActive: true },
  });
  if (!structure) {
    structure = await prisma.salaryStructure.create({
      data: { companyId, name: "Default", description: "Auto-created default salary structure" },
    });
    console.log(`  Created salary structure (id: ${structure.id})`);
  }

  // ── Deduction Types ───────────────────────────────────────────────
  console.log("\n=== Step 4: Deduction Types ===");
  let deductionCount = 0;
  for (const dt of DEFAULT_DEDUCTION_TYPES) {
    const existing = await prisma.deductionItem.findFirst({
      where: {
        deductionType: dt.deductionType as any,
        salaryStructureId: structure!.id,
        isActive: true,
      },
    });
    if (!existing) {
      await prisma.deductionItem.create({
        data: {
          salaryStructureId: structure!.id,
          deductionType: dt.deductionType as any,
          label: dt.label,
          currency: dt.currency as any,
          isMandatory: (dt as any).isMandatory ?? false,
          isStatutory: (dt as any).isStatutory ?? false,
        },
      });
      deductionCount++;
    }
  }
  console.log(`  Created ${deductionCount} deduction types`);

  // ── Tax Brackets ──────────────────────────────────────────────────
  console.log("\n=== Step 5: Tax Brackets ===");
  const effectiveDate = new Date("2025-07-01T00:00:00.000Z");
  const existingBrackets = await prisma.taxBracket.findFirst({
    where: { companyId, isActive: true },
  });
  if (!existingBrackets) {
    for (const b of TAX_BRACKETS_1395_2025) {
      await prisma.taxBracket.create({
        data: { companyId, lowerBound: b.lowerBound, upperBound: b.upperBound, rate: b.rate, deductionAmount: b.deductionAmount, effectiveDate },
      });
    }
    console.log(`  Created ${TAX_BRACKETS_1395_2025.length} tax brackets`);
  } else {
    console.log("  Tax brackets already exist — skipping");
  }

  // ── Employees from JSON ───────────────────────────────────────────
  console.log("\n=== Step 6: Employees ===");
  let employeeCount = 0;
  for (const emp of raw) {
    const tin = (emp.tin_number || "").trim();
    const externalId = tin || slugify(emp.full_name);

    // Check if employee already exists by tinNumber or externalId
    const existing = await prisma.employee.findFirst({
      where: { OR: [{ tinNumber: tin || "__none__" }, { externalId }] },
    });
    if (existing) {
      console.log(`  Skipping (exists): ${emp.full_name}`);
      continue;
    }

    const { firstName, lastName } = splitName(emp.full_name);
    const hireDate = parseDate(emp.employment_date);
    const basicSalary = parseSalary(emp.basic_salary);
    const grossSalary = parseSalary(emp.gross_salary);

    const employee = await prisma.employee.create({
      data: {
        id: externalId,
        externalId,
        companyId,
        firstName,
        lastName,
        tinNumber: tin || null,
        hireDate,
        status: "ACTIVE",
        currency: "ETB",
        departmentId: deptMap[emp.department] || null,
        syncedAt: new Date(),
      },
    });

    // Create compensation record
    await prisma.employeeCompensation.create({
      data: {
        employeeId: employee.id,
        basicSalary: basicSalary,
        grossSalary: grossSalary,
        pensionNo: (emp.pension_number || "").trim() || null,
        pensionElig: true,
        taxExempt: false,
      },
    });

    employeeCount++;
    console.log(`  Created: ${firstName} ${lastName} (${tin || "no TIN"})`);
  }
  console.log(`\n  Total employees created: ${employeeCount}`);

  console.log("\nData migration complete!");
}

main()
  .catch((e) => {
    console.error(" Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
