import { Queue } from "bullmq";
import config from "../config/env";
import logger from "../utils/logger";
import type { EmailJobData } from "../config/email";

// ── Queue Name ───────────────────────────────────────────────────────────────

export const EMAIL_QUEUE = "email-notifications";

// ── Queue Instance ───────────────────────────────────────────────────────────

let emailQueue: Queue | null = null;

export function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue(EMAIL_QUEUE, {
      connection: {
        url: config.redis.url,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000, // 5s, 10s, 20s
        },
        removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
        removeOnFail: { count: 50 },      // Keep last 50 failed jobs
      },
    });
    logger.info("[EmailQueue] BullMQ queue initialized");
  }
  return emailQueue;
}

// ── Enqueue Helper ───────────────────────────────────────────────────────────

/**
 * Add an email job to the queue.
 * This is called after an in-app notification is created.
 * The worker will pick it up and send the email via Resend.
 */
export async function enqueueEmail(jobData: EmailJobData): Promise<void> {
  try {
    const queue = getEmailQueue();
    await queue.add("send-email", jobData, {
      jobId: `email-${jobData.notificationType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    logger.info(
      { to: jobData.to, type: jobData.notificationType },
      "[EmailQueue] Job enqueued",
    );
  } catch (err) {
    // Non-blocking — email failure should not break the notification flow
    logger.error({ err, to: jobData.to }, "[EmailQueue] Failed to enqueue email");
  }
}

// ── Queue Health ─────────────────────────────────────────────────────────────

export async function getQueueStats() {
  try {
    const queue = getEmailQueue();
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
  } catch {
    return { waiting: 0, active: 0, completed: 0, failed: 0 };
  }
}
