import { baseTemplate, statusBadge } from "./base";

export function payrollApprovedTemplate(data: {
  recipientName: string;
  periodName?: string;
}): string {
  const content = `
    <div style="text-align:center;margin-bottom:32px;">
      ${statusBadge("Approved", "#059669")}
    </div>
    <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;font-weight:700;">
      Payroll Approved — Ready for Payment
    </h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
      Hi ${data.recipientName},
    </p>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
      All required approvals for the payroll${data.periodName ? ` (<strong>${data.periodName}</strong>)` : ""} have been completed. The payroll is now cleared for payment processing.
    </p>
    <div style="background-color:#f0fdf4;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #bbf7d0;">
      <p style="margin:0;color:#166534;font-size:13px;line-height:1.6;">
        Employee payslips will be generated and made available once payment is finalized.
      </p>
    </div>
  `;
  return baseTemplate(content);
}
