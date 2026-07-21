import { getResendClient, emailConfig } from "../config/email";
import logger from "../utils/logger";
import { renderEmailTemplate, type EmailTemplateType } from "../templates/emailTemplates";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SendEmailParams {
  to: string;
  recipientName: string;
  subject: string;
  templateType: EmailTemplateType;
  templateData: Record<string, string | number>;
}

// ── Service ──────────────────────────────────────────────────────────────────

class EmailService {
  /**
   * Send a single email using Resend.
   * Returns { success, messageId, error }
   */
  async send(params: SendEmailParams): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    try {
      const resend = getResendClient();
      const html = renderEmailTemplate(params.templateType, {
        recipientName: params.recipientName,
        ...params.templateData,
      });

      const result = await resend.emails.send({
        from: emailConfig.from,
        to: [params.to],
        subject: params.subject,
        html,
      });

      if (result.error) {
        logger.error(
          { error: result.error, to: params.to, template: params.templateType },
          "[Email] Resend API error",
        );
        return { success: false, error: result.error.message };
      }

      logger.info(
        { messageId: result.data?.id, to: params.to, template: params.templateType },
        "[Email] Sent successfully",
      );

      return { success: true, messageId: result.data?.id };
    } catch (err: any) {
      const message = err?.message || "Unknown email error";
      logger.error(
        { error: message, to: params.to, template: params.templateType },
        "[Email] Failed to send",
      );
      return { success: false, error: message };
    }
  }
}

export const emailService = new EmailService();
