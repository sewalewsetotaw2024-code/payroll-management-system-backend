import { baseTemplate, statusBadge } from "./base";

export function payrollSubmittedTemplate(data: {
  recipientName: string;
  submitterName: string;
  periodName?: string;
}): string {
  const content = `
    <div style="text-align:center;margin-bottom:32px;">
      ${statusBadge("Finance Review Needed", "#f59e0b")}
    </div>
    <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;font-weight:700;">
      Payroll Ready for Finance Review
    </h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
      Hi ${data.recipientName},
    </p>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
      <strong>${data.submitterName}</strong> has completed HR approval for the payroll${data.periodName ? ` (<strong>${data.periodName}</strong>)` : ""}. Your finance review and approval is now required to proceed with payment processing.
    </p>
    <div style="background-color:#fffbeb;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #fde68a;">
      <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">
        Please log in to review the payroll calculations and approve for payment.
      </p>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:12px;">
      You are receiving this because you have a Finance role.
    </p>
  `;
  return baseTemplate(content);
}
