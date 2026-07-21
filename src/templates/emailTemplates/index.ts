import { attendanceSubmittedTemplate } from "./attendanceSubmitted";
import { attendanceApprovedTemplate } from "./attendanceApproved";
import { attendanceRejectedTemplate } from "./attendanceRejected";
import { payrollSubmittedTemplate } from "./payrollSubmitted";
import { payrollApprovedTemplate } from "./payrollApproved";
import { payrollRejectedTemplate } from "./payrollRejected";
import { payslipReadyTemplate } from "./payslipReady";

// ── Template Types ───────────────────────────────────────────────────────────

export type EmailTemplateType =
  | "ATTENDANCE_SUBMITTED"
  | "ATTENDANCE_APPROVED"
  | "ATTENDANCE_REJECTED"
  | "PAYROLL_SUBMITTED"
  | "PAYROLL_APPROVED"
  | "PAYROLL_REJECTED"
  | "PAYSLIP_READY";

// ── Template Registry ────────────────────────────────────────────────────────

const templates: Record<EmailTemplateType, (data: Record<string, any>) => string> = {
  ATTENDANCE_SUBMITTED: (d) =>
    attendanceSubmittedTemplate({
      recipientName: d.recipientName,
      submitterName: d.submitterName || "A user",
      importMonth: d.importMonth,
    }),
  ATTENDANCE_APPROVED: (d) =>
    attendanceApprovedTemplate({
      recipientName: d.recipientName,
      importMonth: d.importMonth,
    }),
  ATTENDANCE_REJECTED: (d) =>
    attendanceRejectedTemplate({
      recipientName: d.recipientName,
      importMonth: d.importMonth,
      reason: d.reason,
    }),
  PAYROLL_SUBMITTED: (d) =>
    payrollSubmittedTemplate({
      recipientName: d.recipientName,
      submitterName: d.submitterName || "A user",
      periodName: d.periodName,
    }),
  PAYROLL_APPROVED: (d) =>
    payrollApprovedTemplate({
      recipientName: d.recipientName,
      periodName: d.periodName,
    }),
  PAYROLL_REJECTED: (d) =>
    payrollRejectedTemplate({
      recipientName: d.recipientName,
      periodName: d.periodName,
      reason: d.reason,
    }),
  PAYSLIP_READY: (d) =>
    payslipReadyTemplate({
      recipientName: d.recipientName,
      periodName: d.periodName || "N/A",
      netSalary: d.netSalary || 0,
      currency: d.currency,
      paymentDate: d.paymentDate,
    }),
};

// ── Renderer ─────────────────────────────────────────────────────────────────

/**
 * Render an email template with the given data.
 * Falls back to a generic template if the type is unknown.
 */
export function renderEmailTemplate(
  type: string,
  data: Record<string, any>,
): string {
  const templateFn = templates[type as EmailTemplateType];
  if (!templateFn) {
    // Fallback for unknown types
    return `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;padding:40px;">
  <h2>${data.title || "Notification"}</h2>
  <p>${data.message || "You have a new notification."}</p>
</body>
</html>`;
  }
  return templateFn(data);
}

// Re-export individual templates for direct use if needed
export { attendanceSubmittedTemplate } from "./attendanceSubmitted";
export { attendanceApprovedTemplate } from "./attendanceApproved";
export { attendanceRejectedTemplate } from "./attendanceRejected";
export { payrollSubmittedTemplate } from "./payrollSubmitted";
export { payrollApprovedTemplate } from "./payrollApproved";
export { payrollRejectedTemplate } from "./payrollRejected";
export { payslipReadyTemplate } from "./payslipReady";
