import { baseTemplate, statusBadge } from "./base";

export function attendanceApprovedTemplate(data: {
  recipientName: string;
  importMonth?: string;
}): string {
  const content = `
    <div style="text-align:center;margin-bottom:32px;">
      ${statusBadge("Approved", "#059669")}
    </div>
    <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;font-weight:700;">
      Attendance Approved
    </h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
      Hi ${data.recipientName},
    </p>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
      Your attendance submission${data.importMonth ? ` for <strong>${data.importMonth}</strong>` : ""} has been <strong>approved</strong> by the HR CS Manager.
    </p>
    <div style="background-color:#f0fdf4;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #bbf7d0;">
      <p style="margin:0;color:#166534;font-size:13px;line-height:1.6;">
        The attendance records are now finalized and will be used in payroll processing.
      </p>
    </div>
  `;
  return baseTemplate(content);
}
