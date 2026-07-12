import { PrismaClient } from "../src/generated/prisma";
import "dotenv/config";

const prisma = new PrismaClient();

// ── Realistic Ethiopian salary ranges by job position ──────────────────
const SALARY_RANGES: Record<string, { basic: number; allowances: { type: string; amount: number }[] }> = {
  "CEO":             { basic: 85000, allowances: [{ type: "HOUSING", amount: 15000 }, { type: "TELEPHONE", amount: 3000 }, { type: "REPRESENTATION", amount: 10000 }] },
  "General Manager": { basic: 70000, allowances: [{ type: "HOUSING", amount: 12000 }, { type: "TELEPHONE", amount: 2500 }, { type: "REPRESENTATION", amount: 8000 }] },
  "Director":        { basic: 55000, allowances: [{ type: "HOUSING", amount: 10000 }, { type: "TELEPHONE", amount: 2000 }] },
  "Manager":         { basic: 35000, allowances: [{ type: "HOUSING", amount: 7000 }, { type: "TELEPHONE", amount: 1500 }] },
  "Senior":          { basic: 22000, allowances: [{ type: "HOUSING", amount: 5000 }, { type: "TELEPHONE", amount: 1000 }] },
  "Officer":         { basic: 18000, allowances: [{ type: "HOUSING", amount: 4000 }, { type: "TELEPHONE", amount: 800 }] },
  "Accountant":      { basic: 20000, allowances: [{ type: "HOUSING", amount: 4500 }, { type: "TELEPHONE", amount: 800 }] },
  "Engineer":        { basic: 25000, allowances: [{ type: "HOUSING", amount: 5500 }, { type: "TELEPHONE", amount: 1200 }] },
  "Assistant":       { basic: 12000, allowances: [{ type: "HOUSING", amount: 3000 }, { type: "TELEPHONE", amount: 500 }] },
  "Intern":          { basic: 6000,  allowances: [] },
  "Trainee":         { basic: 8000,  allowances: [] },
  "Driver":          { basic: 10000, allowances: [{ type: "HOUSING", amount: 2500 }] },
  "Guard":           { basic: 8000,  allowances: [{ type: "HOUSING", amount: 2000 }] },
  "Cleaner":         { basic: 6500,  allowances: [] },
  "DEFAULT":         { basic: 15000, allowances: [{ type: "HOUSING", amount: 3500 }, { type: "TELEPHONE", amount: 600 }] },
};

const TRANSPORT_ALLOWANCE = 3000;

async function main() {
  console.log("Seeding employee compensation data...\n");

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    include: {
      compensation: true,
      position: { select: { title: true } },
    },
  });

  console.log(`Found ${employees.length} active employees\n`);

  let created = 0;
  let skipped = 0;

  for (const emp of employees) {
    if (emp.compensation) {
      console.log(`  SKIP  ${emp.firstName} ${emp.lastName} — already has compensation`);
      skipped++;
      continue;
    }

    const positionTitle = emp.position?.title ?? "";
    const matchedKey = Object.keys(SALARY_RANGES).find(
      (key) => key !== "DEFAULT" && positionTitle.toLowerCase().includes(key.toLowerCase()),
    );
    const range = SALARY_RANGES[matchedKey ?? "DEFAULT"];

    const variance = 0.9 + Math.random() * 0.2;
    const basicSalary = Math.round(range.basic * variance / 100) * 100;
    const totalAllowances = range.allowances.reduce((s, a) => s + a.amount, 0) + TRANSPORT_ALLOWANCE;
    const grossSalary = basicSalary + totalAllowances;

    await prisma.employeeCompensation.create({
      data: {
        employeeId: emp.id,
        basicSalary,
        grossSalary,
        pensionElig: true,
        taxExempt: false,
      },
    });

    const allowanceData = [
      ...range.allowances.map((a) => ({
        employeeId: emp.id,
        allowanceType: a.type as any,
        amount: a.amount,
      })),
      {
        employeeId: emp.id,
        allowanceType: "TRANSPORTATION" as any,
        amount: TRANSPORT_ALLOWANCE,
      },
    ];

    await prisma.employeeAllowance.createMany({
      data: allowanceData,
    });

    console.log(`  OK    ${emp.firstName} ${emp.lastName} (${positionTitle || 'No Position'})`);
    console.log(`          Basic: ETB ${basicSalary.toLocaleString()} | Allowances: ETB ${totalAllowances.toLocaleString()} | Gross: ETB ${grossSalary.toLocaleString()}`);
    created++;
  }

  console.log(`\nDone: ${created} employees seeded, ${skipped} skipped`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
