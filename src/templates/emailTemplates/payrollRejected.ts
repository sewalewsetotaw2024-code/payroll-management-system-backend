import { baseTemplate, statusBadge } from "./base";

export function payrollRejectedTemplate(data: {
  recipientName: string;
  periodName?: string;
  reason?: string;
}): string {
  const content = `
    <div style="text-align:center;margin-bottom:32px;">
      ${statusBadge("Rejected", "#dc2626")}
    </div>
    <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;font-weight:700;">
      Payroll Approval Rejected
    </h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
      Hi ${data.recipientName},
    </p>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
      Your payroll submission${data.periodName ? ` for <strong>${data.periodName}</strong>` : ""} has been <strong>rejected</strong>.
    </p>
    ${data.reason ? `
    <div style="background-color:#fef2f2;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #fecaca;">
      <p style="margin:0 0 8px;color:#991b1b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Reason</p>
      <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.6;">${data.reason}</p>
    </div>
    ` : `
    <div style="background-color:#fef2f2;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #fecaca;">
      <p style="margin:0;color:#991b1b;font-size:13px;line-height:1.6;">
        Please review the feedback, correct any issues, and resubmit for approval.
      </p>
    </div>
    `}
  `;
  return baseTemplate(content);
}
