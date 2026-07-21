import { Worker, Job } from "bullmq";
import config from "../config/env";
import logger from "../utils/logger";
import { emailService } from "../services/email.service";
import { EMAIL_QUEUE } from "../queues/email.queue";
import type { EmailJobData } from "../config/email";

// ── Subject Line Mapping ─────────────────────────────────────────────────────

const subjectMap: Record<string, (data: Record<string, any>) => string> = {
  ATTENDANCE_SUBMITTED: () => "Attendance Submitted for Approval",
  ATTENDANCE_APPROVED: () => "Attendance Approved",
  ATTENDANCE_REJECTED: () => "Attendance Rejected",
  PAYROLL_SUBMITTED: () => "Payroll Ready for Finance Review",
  PAYROLL_APPROVED: () => "Payroll Approved — Ready for Payment",
  PAYROLL_REJECTED: () => "Payroll Approval Rejected",
  PAYSLIP_READY: (d) => `Your Payslip is Ready — ${d.periodName || ""}`,
};

// ── Worker ───────────────────────────────────────────────────────────────────

let emailWorker: Worker | null = null;

export function startEmailWorker(): Worker {
  if (emailWorker) {
    logger.warn("[EmailWorker] Worker already running");
    return emailWorker;
  }

  emailWorker = new Worker(
    EMAIL_QUEUE,
    async (job: Job<EmailJobData>) => {
      const { to, recipientName, notificationType, templateData } = job.data;

      // Skip if no recipient email
      if (!to) {
        logger.warn({ jobId: job.id }, "[EmailWorker] No recipient email, skipping");
        return { skipped: true, reason: "no-email" };
      }

      // Get subject line
      const subjectFn = subjectMap[notificationType];
      const subject = subjectFn
        ? subjectFn(templateData)
        : `Notification: ${notificationType}`;

      // Send email via Resend
      const result = await emailService.send({
        to,
        recipientName,
        subject,
        templateType: notificationType as any,
        templateData,
      });

      if (!result.success) {
        throw new Error(result.error || "Email send failed");
      }

      logger.info(
        { jobId: job.id, to, type: notificationType, messageId: result.messageId },
        "[EmailWorker] Email sent successfully",
      );

      return { success: true, messageId: result.messageId };
    },
    {
      connection: {
        url: config.redis.url,
      },
      concurrency: 5, // Process 5 emails at a time
      limiter: {
        max: 10,
        duration: 1000, // Max 10 emails per second (Resend free tier limit)
      },
    },
  );

  // ── Event Handlers ───────────────────────────────────────────────────────

  emailWorker.on("completed", (job) => {
    logger.debug(
      { jobId: job.id, type: job.data.notificationType },
      "[EmailWorker] Job completed",
    );
  });

  emailWorker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message, type: job?.data.notificationType },
      "[EmailWorker] Job failed",
    );
  });

  emailWorker.on("error", (err) => {
    logger.error({ err }, "[EmailWorker] Worker error");
  });

  logger.info("[EmailWorker] Email worker started (concurrency: 5)");
  return emailWorker;
}

/**
 * Stop the email worker gracefully.
 */
export async function stopEmailWorker(): Promise<void> {
  if (emailWorker) {
    await emailWorker.close();
    emailWorker = null;
    logger.info("[EmailWorker] Email worker stopped");
  }
}
