import { baseTemplate, statusBadge } from "./base";

export function attendanceRejectedTemplate(data: {
  recipientName: string;
  importMonth?: string;
  reason?: string;
}): string {
  const content = `
    <div style="text-align:center;margin-bottom:32px;">
      ${statusBadge("Rejected", "#dc2626")}
    </div>
    <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;font-weight:700;">
      Attendance Rejected
    </h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
      Hi ${data.recipientName},
    </p>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
      Your attendance submission${data.importMonth ? ` for <strong>${data.importMonth}</strong>` : ""} has been <strong>rejected</strong>.
    </p>
    ${data.reason ? `
    <div style="background-color:#fef2f2;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #fecaca;">
      <p style="margin:0 0 8px;color:#991b1b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Reason</p>
      <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.6;">${data.reason}</p>
    </div>
    ` : `
    <div style="background-color:#fef2f2;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #fecaca;">
      <p style="margin:0;color:#991b1b;font-size:13px;line-height:1.6;">
        Please review the feedback and resubmit with the necessary corrections.
      </p>
    </div>
    `}
  `;
  return baseTemplate(content);
}
