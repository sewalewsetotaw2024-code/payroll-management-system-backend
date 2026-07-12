import { PrismaClient } from "../src/generated/prisma";
import "dotenv/config";

const prisma = new PrismaClient();

const DEFAULT_DEDUCTION_TYPES = [
  { deductionType: "EMPLOYMENT_INCOME_TAX", label: "Employment Income Tax", isStatutory: true, isMandatory: true },
  { deductionType: "PENSION_EMPLOYEE", label: "Pension (Employee)", isStatutory: true, isMandatory: true },
  { deductionType: "LOAN_REPAYMENT", label: "Staff Loan Repayment" },
  { deductionType: "ADVANCE_RECOVERY", label: "Salary Advance Recovery" },
  { deductionType: "COST_SHARING", label: "Cost Sharing" },
  { deductionType: "UNION_DUES", label: "Union Dues" },
  { deductionType: "COURT_ORDER", label: "Court Order Deduction" },
  { deductionType: "UNPAID_LEAVE", label: "Unpaid Leave Deduction" },
  { deductionType: "LATENESS", label: "Lateness Deduction" },
  { deductionType: "SAVINGS_AND_CREDIT", label: "Savings & Credit Cooperative" },
  { deductionType: "HEALTH_INSURANCE", label: "Health Insurance Premium" },
  { deductionType: "LIFE_INSURANCE", label: "Life Insurance Premium" },
  { deductionType: "FINE_PENALTY", label: "Fine / Penalty" },
  { deductionType: "OVERPAYMENT_RECOVERY", label: "Overpayment Recovery" },
  { deductionType: "CHILD_SUPPORT", label: "Child Support" },
  { deductionType: "GARNISHMENT", label: "Wage Garnishment" },
  { deductionType: "OTHER", label: "Other Deduction" },
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
  const requestedCompanyId = Number(process.env.DEFAULT_COMPANY_ID ?? 3);

  let company = await prisma.company.findUnique({ where: { id: requestedCompanyId } });
  if (!company) {
    const matchingCompany = await prisma.company.findFirst({
      where: {
        OR: [
          { code: { equals: process.env.COMPANY_CODE ?? "ADIU", mode: "insensitive" } },
          { name: { contains: "ADIU", mode: "insensitive" } },
        ],
      },
    });

    if (matchingCompany) {
      company = matchingCompany;
      console.log(`Using existing matching company: ${company.name} (id: ${company.id})`);
    } else {
      company = await prisma.company.create({
        data: {
          id: requestedCompanyId,
          name: process.env.COMPANY_NAME ?? "ADIU Communication Service PLC",
          code: process.env.COMPANY_CODE ?? "ADIU",
          isActive: true,
        },
      });
      console.log(`Created company: ${company.name} (id: ${company.id})`);
    }
  } else {
    console.log(`Using configured company: ${company.name} (id: ${company.id})`);
  }

  const companyId = company.id;
  const effectiveDate = new Date("2025-07-01T00:00:00.000Z");

  // ── Default Salary Structure ─────────────────────────────────────
  let structure = await prisma.salaryStructure.findFirst({
    where: { companyId, isActive: true },
  });

  if (!structure) {
    structure = await prisma.salaryStructure.create({
      data: { companyId, name: "Default", description: "Auto-created default salary structure" },
    });
    console.log(`Created default salary structure (id: ${structure.id})`);
  }

  // ── Deduction Types ──────────────────────────────────────────────
  for (const dt of DEFAULT_DEDUCTION_TYPES) {
    const existing = await prisma.deductionItem.findFirst({
      where: {
        deductionType: dt.deductionType as any,
        salaryStructureId: structure.id,
        isActive: true,
      },
    });
    if (!existing) {
      await prisma.deductionItem.create({
        data: {
          salaryStructureId: structure.id,
          deductionType: dt.deductionType as any,
          label: dt.label,
          isMandatory: (dt as any).isMandatory ?? false,
          isStatutory: (dt as any).isStatutory ?? false,
        },
      });
      console.log(`Seeded deduction type: ${dt.label}`);
    }
  }

  // ── Tax Brackets (Proclamation 1395/2025, effective July 2025) ───
    const existingBrackets = await prisma.taxBracket.findFirst({
        where: { companyId, isActive: true },
    });

  if (!existingBrackets) {
    for (const b of TAX_BRACKETS_1395_2025) {
      await prisma.taxBracket.create({
        data: {
          companyId,
          lowerBound: b.lowerBound,
          upperBound: b.upperBound,
          rate: b.rate,
          deductionAmount: b.deductionAmount,
          effectiveDate,
        },
      });
    }
    console.log(`Seeded ${TAX_BRACKETS_1395_2025.length} tax brackets (Proclamation 1395/2025)`);
  } else {
    console.log("Tax brackets already exist — skipping seed");
  }

  // ── Pension Rules (Ethiopian statutory: 7% employee, 11% employer) ──
  const existingPension = await prisma.pensionRule.findFirst({
    where: { companyId, isActive: true },
  });

  if (!existingPension) {
    await prisma.pensionRule.create({
      data: {
        companyId,
        employeeRate: 0.07,
        employerRate: 0.11,
        basis: "BASIC",
        effectiveDate,
      },
    });
    console.log("Seeded pension rule: 7% employee / 11% employer on BASIC salary");
  } else {
    console.log("Pension rule already exists — skipping seed");
  }

  // ── Workdays Configuration ───────────────────────────────────────
  const workdaysConfig = [
    { key: "DEFAULT_MONTHLY_WORKDAYS", value: "30" },
    { key: "WEEKLY_WORKING_DAYS", value: "6" },
    { key: "DAILY_WORKING_HOURS", value: "8" },
  ];

  for (const cfg of workdaysConfig) {
    const existing = await prisma.configuration.findFirst({
      where: { companyId, key: cfg.key },
    });
    if (!existing) {
      await prisma.configuration.create({
        data: { companyId, key: cfg.key, value: cfg.value },
      });
      console.log(`Seeded workdays config: ${cfg.key} = ${cfg.value}`);
    }
  }

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
