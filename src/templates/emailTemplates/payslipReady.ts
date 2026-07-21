import { baseTemplate, statusBadge, infoRow } from "./base";

export function payslipReadyTemplate(data: {
  recipientName: string;
  periodName: string;
  netSalary: number;
  currency?: string;
  paymentDate?: string;
}): string {
  const content = `
    <div style="text-align:center;margin-bottom:32px;">
      ${statusBadge("Ready", "#059669")}
    </div>
    <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;font-weight:700;">
      Your Payslip is Ready!
    </h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
      Hi ${data.recipientName},
    </p>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
      Great news! Your payslip for <strong>${data.periodName}</strong> has been processed and is now available for viewing and download.
    </p>
    <div style="background-color:#f0fdf4;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #bbf7d0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${infoRow("Period", data.periodName)}
        ${infoRow("Net Salary", `${data.currency || "ETB"} ${data.netSalary.toLocaleString()}`)}
        ${data.paymentDate ? infoRow("Payment Date", new Date(data.paymentDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })) : ""}
      </table>
    </div>
    <div style="text-align:center;margin-bottom:24px;">
      <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6;">
        Log in to the payroll system to view your detailed payslip and download the PDF.
      </p>
    </div>
  `;
  return baseTemplate(content);
}
