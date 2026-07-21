import { Resend } from "resend";
import config from "./env";
import logger from "../utils/logger";

// ── Resend Client ────────────────────────────────────────────────────────────

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      logger.warn("[Email] RESEND_API_KEY not set — emails will not be sent");
      // Return a dummy client that won't crash but won't send
      return new Resend("re_placeholder");
    }
    resendClient = new Resend(apiKey);
    logger.info("[Email] Resend client initialized");
  }
  return resendClient;
}

// ── Email Config ─────────────────────────────────────────────────────────────

export const emailConfig = {
  from: process.env.EMAIL_FROM || "norepayroll@adiu.com",
  replyTo: process.env.EMAIL_REPLY_TO || undefined,
  /** Max retry attempts for failed emails */
  maxRetries: 3,
  /** Delay between retries in ms (exponential backoff) */
  retryDelay: 5000,
};

// ── Email Job Data ───────────────────────────────────────────────────────────

export interface EmailJobData {
  /** Recipient email address */
  to: string;
  /** Recipient full name */
  recipientName: string;
  /** Email subject line */
  subject: string;
  /** Notification type (maps to template) */
  notificationType: string;
  /** Template variables */
  templateData: Record<string, string | number>;
}
