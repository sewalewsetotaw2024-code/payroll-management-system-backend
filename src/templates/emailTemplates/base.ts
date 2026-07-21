// ── Base Email Template ──────────────────────────────────────────────────────
// Wraps all email content in a consistent branded layout.

export function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payroll Management System</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#059669 0%,#047857 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">
                ADIU Payroll
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:12px;text-transform:uppercase;letter-spacing:2px;">
                Notification
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:11px;">
                This is an automated notification from the ADIU Payroll Management System.
              </p>
              <p style="margin:8px 0 0;color:#94a3b8;font-size:11px;">
                Do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Helper: Status Badge ─────────────────────────────────────────────────────

export function statusBadge(label: string, color: string): string {
  return `<span style="display:inline-block;padding:6px 16px;border-radius:8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${color};background-color:${color}15;border:1px solid ${color}30;">${label}</span>`;
}

// ── Helper: Info Row ─────────────────────────────────────────────────────────

export function infoRow(label: string, value: string | number): string {
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
        <span style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">${label}</span>
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;text-align:right;">
        <span style="color:#1e293b;font-size:14px;font-weight:600;">${value}</span>
      </td>
    </tr>`;
}
