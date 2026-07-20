import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import Handlebars from "handlebars";
import puppeteer from "puppeteer-core";
import cloudinary from "../config/cloudinary";
import config from "../config/env";
import prisma from "../config/database";
import CustomError from "../utils/customError";
import httpStatus from "http-status";
import logger from "../utils/logger";
import { numberToWords } from "../utils/numberToWords";
import { ConcurrencyController } from "../utils/concurrencyController";
import { monitoring } from "../utils/monitoring";

// ── Scoped Handlebars instance with helpers ─────────────────────────────────

const hbs = Handlebars.create();

/**
 * Formats a number with Ethiopian-style grouping (last 3 digits, then 2-digit groups).
 * E.g., 159500.00 → "1,59,500.00"
 */
hbs.registerHelper("formatCurrency", (n: number) => {
  if (n == null || isNaN(n)) return "0.00";
  const [intPart, decPart] = Math.abs(n).toFixed(2).split(".");
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${n < 0 ? "-" : ""}${grouped}.${decPart}`;
});

/**
 * Masks all but the last 4 digits of an account number.
 */
hbs.registerHelper("maskAccount", (acc: string) => {
  if (!acc || acc.length <= 4) return acc || "";
  return "**** **** **** " + acc.slice(-4);
});

// ── Interfaces ──────────────────────────────────────────────────────────────

interface GeneratePayslipInput {
  companyId: number;
  runItemId: string;
  templateId?: string;
}

interface GeneratePayslipResult {
  pdfUrl: string;
  payslipId: string;
  employeeName: string;
}

interface BatchGenerateInput {
  companyId: number;
  payrollRunId: string;
  templateId?: string;
}

interface BatchGenerateResult {
  total: number;
  succeeded: number;
  failed: number;
  pdfs: Array<{ employeeName: string; pdfUrl: string; error?: string }>;
}

// ── Service ─────────────────────────────────────────────────────────────────

export class PayslipRenderService {
  /**
   * Generates a PDF payslip for a single PayrollRunItem.
   * Steps:
   *   1. Fetch run item with all related data
   *   2. Resolve and compile template
   *   3. Prepare payload data
   *   4. Render HTML with Handlebars
   *   5. Convert to PDF via Puppeteer
   *   6. Upload to Cloudinary
   *   7. Save URL on Payslip record
   */
  async generatePayslipPdf(input: GeneratePayslipInput): Promise<GeneratePayslipResult> {
    const { companyId, runItemId, templateId } = input;

    if (!runItemId || typeof runItemId !== "string") {
      throw new CustomError(httpStatus.BAD_REQUEST, "runItemId is required");
    }

    try {
      // 1. Fetch payroll run item with all relations
      const runItem = await this.fetchRunItem(companyId, runItemId);

      // 2. Resolve template HTML
      const templateHtml = await this.resolveTemplateHtml(companyId, templateId);

      // 3. Build payload from run item data
      const payload = this.buildPayload(runItem);

      // 4. Compile with Handlebars and render HTML
      const compiled = hbs.compile(templateHtml);
      const html = compiled(payload);

      // 5. Convert to PDF
      const pdfBuffer = await this.htmlToPdf(html);

      // 6. Upload to Cloudinary and save record
      const pdfUrl = await this.uploadPdf(companyId, runItemId, pdfBuffer);
      const payslip = await this.savePayslipRecord(runItemId, pdfUrl);

      monitoring.recordPdfGenerationSuccess();
      logger.info({ runItemId, pdfUrl }, "Payslip PDF generated");

      return { pdfUrl, payslipId: payslip.id, employeeName: payload.employeeName };
    } catch (err) {
      // Mark the Payslip record as FAILED
      await prisma.payslip.upsert({
        where: { payrollRunItemId: runItemId },
        update: {
          generationStatus: "FAILED",
          errorMessage: err instanceof Error ? err.message.slice(0, 500) : "Unknown error",
        },
        create: {
          payrollRunItemId: runItemId,
          generationStatus: "FAILED",
          errorMessage: err instanceof Error ? err.message.slice(0, 500) : "Unknown error",
        },
      });
      throw err;
    }
  }

  /**
   * Batch-generates PDF payslips for all employees in a payroll run.
   * Uses concurrent workers (default 5) with per-job timeout and error isolation.
   * Pre-creates Payslip records in GENERATING status so the frontend can show
   * real-time progress before any single PDF is complete.
   */
  async batchGeneratePayslipPdfs(input: BatchGenerateInput): Promise<BatchGenerateResult> {
    const { companyId, payrollRunId, templateId } = input;

    if (!payrollRunId || typeof payrollRunId !== "string") {
      throw new CustomError(httpStatus.BAD_REQUEST, "payrollRunId is required");
    }

    const runItems = await prisma.payrollRunItem.findMany({
      where: { payrollRunId, payrollRun: { payrollPeriod: { companyId } } },
      select: { id: true, employee: { select: { firstName: true, lastName: true } } },
    });

    // Pre-create Payslip records in GENERATING status for every run item
    // so the frontend can see "Generating..." before any PDF is done
    for (const item of runItems) {
      await prisma.payslip.upsert({
        where: { payrollRunItemId: item.id },
        update: { generationStatus: "GENERATING" },
        create: {
          payrollRunItemId: item.id,
          generationStatus: "GENERATING",
        },
      });
    }

    // Create job factories — one per employee
    const jobs = runItems.map((item) => async () => {
      return this.generatePayslipPdf({ companyId, runItemId: item.id, templateId });
    });

    // Execute with concurrency control
    const controller = new ConcurrencyController({ concurrency: 5, timeoutMs: 120_000 });
    const { results, failed, errors } = await controller.run(jobs);

    // Log any errors
    for (const err of errors) {
      logger.error({ err }, "[Payslip] Batch generation error");
    }

    return {
      total: runItems.length,
      succeeded: results.length,
      failed,
      pdfs: results.map((r) => ({
        employeeName: r.employeeName,
        pdfUrl: r.pdfUrl,
      })),
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────

  /**
   * Fetches a PayrollRunItem scoped to company with all relations needed for payslip rendering.
   */
  private async fetchRunItem(companyId: number, runItemId: string) {
    const runItem = await prisma.payrollRunItem.findFirst({
      where: { id: runItemId, payrollRun: { payrollPeriod: { companyId } } },
      include: {
        payrollEarnings: true,
        payrollDeductions: true,
        payrollTax: true,
        payrollPension: true,
        payrollOvertime: true,
        payrollAllowances: true,
        payslip: true,
        employee: {
          include: {
            compensation: true,
            department: { select: { name: true } },
            company: { select: { name: true } },
            bankAccounts: {
              where: { isPrimary: true },
              include: { bank: true },
            },
          },
        },
        payrollRun: {
          include: { payrollPeriod: true },
        },
      },
    });

    if (!runItem) {
      throw new CustomError(httpStatus.NOT_FOUND, "Payroll run item not found");
    }

    return runItem;
  }

  /**
   * Builds the Handlebars payload from a PayrollRunItem with all related data.
   */
  private buildPayload(runItem: NonNullable<Awaited<ReturnType<typeof this.fetchRunItem>>>) {
    const emp = runItem.employee;
    const period = runItem.payrollRun.payrollPeriod;
    const primaryBank = emp.bankAccounts?.[0];

    const formatDate = (d: Date) => {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };

    const earnings: { label: string; amount: number }[] = [];
    const deductions: { label: string; amount: number }[] = [];

    // Collect earnings from payroll run item
    for (const e of runItem.payrollEarnings ?? []) {
      const amt = Number(e.amount);
      if (amt > 0) earnings.push({ label: e.label || e.earningType, amount: amt });
    }

    // Collect allowances as earnings
    for (const al of runItem.payrollAllowances ?? []) {
      const amt = Number(al.amount);
      if (amt > 0) earnings.push({ label: al.label, amount: amt });
    }

    // Collect overtime as earnings
    for (const ot of runItem.payrollOvertime ?? []) {
      const amt = Number(ot.amount);
      if (amt > 0) earnings.push({ label: `Overtime (${ot.category})`, amount: amt });
    }

    // Collect deductions
    for (const d of runItem.payrollDeductions ?? []) {
      const amt = Number(d.amount);
      if (amt > 0) deductions.push({ label: d.label || d.deductionType, amount: amt });
    }

    // Add pension employee contribution
    if (runItem.payrollPension) {
      const penAmt = Number(runItem.payrollPension.employeeContribution);
      if (penAmt > 0) deductions.push({ label: "Pension (Employee)", amount: penAmt });
    }

    const totalEarnings = earnings.reduce((s, e) => s + e.amount, 0);
    const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
    const netPay = totalEarnings - totalDeductions;

    return {
      logoUrl: "",
      companyName: "ADIU",
      employeeName: `${emp.firstName} ${emp.lastName}`,
      employeeId: emp.externalId || emp.id.slice(0, 8),
      designation: emp.jobPosition || "\u2014",
      department: emp.department?.name || "\u2014",
      dateOfJoining: emp.hireDate ? formatDate(emp.hireDate) : "\u2014",
      payPeriod: period.name || "",
      payPeriodStart: formatDate(period.startDate),
      payPeriodEnd: formatDate(period.endDate),
      payDate: runItem.payrollRun.processedAt ? formatDate(runItem.payrollRun.processedAt) : formatDate(new Date()),
      bankName: primaryBank?.bank?.name || "\u2014",
      accountNo: primaryBank?.accountNumber || "\u2014",
      tin: emp.tinNumber || "\u2014",
      earnings,
      deductions,
      totalEarnings,
      totalDeductions,
      netPay,
      amountInWords: numberToWords(Math.max(0, netPay)),
    };
  }

  /**
   * Uploads a PDF buffer to Cloudinary with retry logic.
   * Retries up to `maxRetries` times with exponential backoff (1s, 3s).
   * Never retries 4xx errors (bad request, auth failure, etc.).
   */
  private async uploadPdf(
    companyId: number,
    runItemId: string,
    pdfBuffer: Buffer,
    maxRetries = 2,
  ): Promise<string> {
    const base64 = pdfBuffer.toString("base64");
    const dataUri = `data:application/pdf;base64,${base64}`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await cloudinary.uploader.upload(
          dataUri,
          {
            folder: `company_${companyId}/payslips`,
            resource_type: "raw",
            public_id: `payslip-${runItemId}-${randomUUID()}`,
            overwrite: false,
          },
        );
        return result.secure_url;
      } catch (err: any) {
        // Don't retry 4xx errors (bad request, auth failure, etc.)
        if (err?.http_code && err.http_code >= 400 && err.http_code < 500) {
          throw err;
        }

        if (attempt < maxRetries) {
          const delay = attempt === 1 ? 1_000 : 3_000;
          logger.warn(
            { attempt, maxRetries, delay, err },
            "[Cloudinary] Upload failed, retrying",
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Cloudinary upload failed after all retries");
  }

  /**
   * Upserts a Payslip record with the generated PDF URL.
   * Sets generationStatus to COMPLETED and clears any previous error.
   */
  private async savePayslipRecord(runItemId: string, pdfUrl: string) {
    return prisma.payslip.upsert({
      where: { payrollRunItemId: runItemId },
      update: {
        pdfPath: pdfUrl,
        generatedAt: new Date(),
        generationStatus: "COMPLETED",
        errorMessage: null,
        retryCount: 0,
      },
      create: {
        payrollRunItemId: runItemId,
        pdfPath: pdfUrl,
        generationStatus: "COMPLETED",
      },
    });
  }

  // ── Private: Template resolution ──────────────────────────────────────

  /**
   * Resolves the Handlebars template HTML using a 3-tier fallback:
   * 1. Explicit template by ID (fetched from Cloudinary)
   * 2. Company default template (fetched from Cloudinary)
   * 3. Bundled payslip-default.hbs on disk
   */
  private async resolveTemplateHtml(companyId: number, templateId?: string): Promise<string> {
    // 1. Try explicit template ID
    if (templateId) {
      const template = await prisma.payslipTemplate.findFirst({
        where: { id: templateId, companyId },
      });
      if (template?.templateUrl) {
        const html = await this.fetchTemplateFromUrl(template.templateUrl);
        if (html) return html;
      }
    }

    // 2. Try company default template
    const defaultTemplate = await prisma.payslipTemplate.findFirst({
      where: { companyId, isDefault: true },
    });
    if (defaultTemplate?.templateUrl) {
      const html = await this.fetchTemplateFromUrl(defaultTemplate.templateUrl);
      if (html) return html;
    }

    // 3. Fall back to bundled default template
    const defaultPath = path.resolve(process.cwd(), "templates", "payslip-default.hbs");
    try {
      return fs.readFileSync(defaultPath, "utf-8");
    } catch {
      throw new CustomError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Default payslip template not found on server",
      );
    }
  }

  /**
   * Fetches template HTML from a Cloudinary URL with error handling.
   * Returns null if the fetch fails or returns non-2xx status.
   */
  private async fetchTemplateFromUrl(url: string): Promise<string | null> {
    const maxTemplateSizeBytes = 250_000;
    const timeoutMs = 8_000;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "text/html, text/plain" },
      });

      if (!response.ok) {
        logger.warn({ url, status: response.status }, "Template fetch returned non-2xx status");
        return null;
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength && Number(contentLength) > maxTemplateSizeBytes) {
        logger.warn({ url, contentLength }, "Template exceeds allowed size");
        return null;
      }

      const text = await response.text();
      const sizeBytes = Buffer.byteLength(text, "utf8");
      if (sizeBytes > maxTemplateSizeBytes) {
        logger.warn({ url, sizeBytes }, "Template exceeds allowed size after download");
        return null;
      }

      return text;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        logger.warn({ url, timeoutMs }, "Template fetch timed out");
      } else {
        logger.error({ url, err }, "Failed to fetch template from URL");
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Private: HTML → PDF via Puppeteer ─────────────────────────────────

  private browserInstance: import("puppeteer-core").Browser | null = null;

  private async getBrowser(): Promise<import("puppeteer-core").Browser> {
    if (!this.browserInstance || !this.browserInstance.connected) {
      if (this.browserInstance) {
        logger.warn("[Puppeteer] Browser disconnected, re-launching");
        await this.browserInstance.close().catch(() => {});
      }
      const executablePath = config.puppeteer.executablePath;
      logger.info({ executablePath }, "Launching Puppeteer browser");
      this.browserInstance = await puppeteer.launch({
        executablePath,
        headless: true,
        protocolTimeout: 60_000,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      });
    }
    return this.browserInstance;
  }

  /**
   * Renders an HTML string to a PDF buffer using a fresh page per call.
   * Each call creates its own page, sets content with a 15s timeout,
   * generates the PDF, and closes the page in `finally`.
   * This pattern is safe for concurrent use (no shared page state).
   */
  private async htmlToPdf(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    // Set page-level timeouts
    page.setDefaultNavigationTimeout(15_000);

    // Log page crashes but don't crash the batch
    page.on("crash", () => {
      logger.error("[Puppeteer] Page crashed during PDF render");
    });

    try {
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const pdfBuffer = await page.pdf({
        format: "A4",
        margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
        printBackground: true,
      });
      return Buffer.from(pdfBuffer);
    } catch (err) {
      // If the browser disconnected, ensure re-launch on next call
      if (!browser.connected) {
        logger.warn("[Puppeteer] Browser disconnected during PDF render — will re-launch");
      }
      throw err;
    } finally {
      // ALWAYS close the page to free memory
      await page.close().catch(() => {});
    }
  }

  /**
   * Clean up browser resources. Call during server shutdown.
   */
  async shutdown(): Promise<void> {
    if (this.browserInstance) {
      await this.browserInstance.close();
      this.browserInstance = null;
    }
  }
}

export const payslipRenderService = new PayslipRenderService();
