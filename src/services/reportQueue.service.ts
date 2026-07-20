import { Queue, Worker, Job } from "bullmq";
import ExcelJS from "exceljs";
import cloudinary from "../config/cloudinary";
import { getClient } from "../config/redis";
import { generateTaxReport, generatePensionReport, generateBankReport } from "./reportExport.service";
import logger from "../utils/logger";

// ── Constants ──────────────────────────────────────────────────────────────

const QUEUE_NAME = "report-export";
const REDIS_PREFIX = "report:";
const REDIS_TTL = 86400 * 30; // 30 days

type ReportType = "tax" | "pension" | "bank";

interface ReportJobData {
  type: ReportType;
  payrollRunId: string;
  periodLabel: string;
  companyId: number;
}

interface ReportJobResult {
  cloudinaryUrl: string;
  type: ReportType;
  payrollRunId: string;
}

// ── Redis helpers ──────────────────────────────────────────────────────────

function redisKey(runId: string, type: ReportType): string {
  return `${REDIS_PREFIX}${runId}:${type}`;
}

export async function getReportUrl(runId: string, type: ReportType): Promise<string | null> {
  try {
    const redis = getClient();
    return await redis.get(redisKey(runId, type));
  } catch {
    return null;
  }
}

export async function reportFileExists(runId: string, type: ReportType): Promise<boolean> {
  const url = await getReportUrl(runId, type);
  return url !== null;
}

export async function setReportUrl(runId: string, type: ReportType, url: string): Promise<void> {
  try {
    const redis = getClient();
    await redis.set(redisKey(runId, type), url, "EX", REDIS_TTL);
  } catch (err) {
    logger.warn({ err }, "[ReportQueue] Failed to store report URL in Redis");
  }
}

// ── Queue ───────────────────────────────────────────────────────────────────

function createQueue(): Queue<ReportJobData> {
  return new Queue<ReportJobData>(QUEUE_NAME, {
    connection: getClient(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 86400 },
    },
  });
}

let queue: Queue<ReportJobData> | null = null;

export function getQueue(): Queue<ReportJobData> {
  if (!queue) queue = createQueue();
  return queue;
}

// ── Worker ──────────────────────────────────────────────────────────────────

let worker: Worker<ReportJobData, ReportJobResult> | null = null;

async function processJob(job: Job<ReportJobData>): Promise<ReportJobResult> {
  const { type, payrollRunId, periodLabel, companyId } = job.data;

  logger.info({ jobId: job.id, type, payrollRunId }, "[ReportQueue] Generating report");

  // 1. Generate report into workbook
  const workbook = new ExcelJS.Workbook();
  const getReportFn =
    type === "tax" ? generateTaxReport
    : type === "pension" ? generatePensionReport
    : generateBankReport;

  await getReportFn({ companyId, payrollRunId, periodLabel }, workbook);

  // 2. Write to buffer and upload to Cloudinary
  const raw = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(raw);
  const base64 = buffer.toString("base64");
  const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const dataUri = `data:${mime};base64,${base64}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: `company_${companyId}/reports`,
    resource_type: "raw",
    public_id: `${payrollRunId}-${type}`,
    overwrite: true,
  });

  // 3. Store Cloudinary URL in Redis for fast lookup
  await setReportUrl(payrollRunId, type, result.secure_url);

  logger.info({ jobId: job.id, url: result.secure_url }, "[ReportQueue] Report uploaded to Cloudinary");

  return { cloudinaryUrl: result.secure_url, type, payrollRunId };
}

export function startWorker(): void {
  if (worker) return;

  worker = new Worker<ReportJobData, ReportJobResult>(QUEUE_NAME, processJob, {
    connection: getClient(),
    concurrency: 3,
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "[ReportQueue] Job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "[ReportQueue] Job failed");
  });
}

export async function shutdownQueue(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}
