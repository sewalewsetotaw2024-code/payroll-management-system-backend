import { baseTemplate, statusBadge } from "./base";

export function attendanceSubmittedTemplate(data: {
  recipientName: string;
  submitterName: string;
  importMonth?: string;
}): string {
  const content = `
    <div style="text-align:center;margin-bottom:32px;">
      ${statusBadge("Awaiting Review", "#f59e0b")}
    </div>
    <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;font-weight:700;">
      Attendance Submitted for Approval
    </h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
      Hi ${data.recipientName},
    </p>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
      <strong>${data.submitterName}</strong> has submitted an attendance record${data.importMonth ? ` for <strong>${data.importMonth}</strong>` : ""} that requires your review and approval.
    </p>
    <div style="background-color:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;">
        Please log in to the payroll system to review and approve the attendance submission.
      </p>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:12px;">
      You are receiving this because you have the HR CS Manager role.
    </p>
  `;
  return baseTemplate(content);
}
