"use server";

import { Resend } from "resend";
import { getSetting, setSetting } from "@/lib/actions/settings";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function getPayrollEmailSettings() {
  const [recipients, day, time] = await Promise.all([
    getSetting("payroll_email_recipients", ""),
    getSetting("payroll_email_day", "6"), // 6=Sat default
    getSetting("payroll_email_time", "08:00"),
  ]);
  return { recipients, day: parseInt(day, 10), time };
}

export async function savePayrollEmailSettings(recipients: string, day: number, time: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  await Promise.all([
    setSetting("payroll_email_recipients", recipients),
    setSetting("payroll_email_day", String(day)),
    setSetting("payroll_email_time", time),
  ]);
  revalidatePath("/dashboard/settings");
}

export async function sendPayrollEmail(weekStart: string, weekEnd: string): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const recipientsRaw = await getSetting("payroll_email_recipients", "");
  const recipientList = recipientsRaw
    .split(/[,\n]/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));

  if (recipientList.length === 0) {
    return { success: false, error: "No recipients configured" };
  }

  const payrollUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://mygroundops.com"}/dashboard/payroll`;

  const accent  = "#10b981";
  const sentAt  = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mygroundops.com";

  try {
    await resend.emails.send({
      from: "MyGroundOps <payroll@mygroundops.com>",
      to: recipientList,
      subject: `💰 Ready to pay your drivers? Payroll is complete — ${weekStart}–${weekEnd}`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Payroll Ready</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Wordmark -->
        <tr><td style="padding:0 0 20px;">
          <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#475569;">MyGroundOps &middot; Apparo Group</p>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#ffffff;border-radius:16px;overflow:hidden;">

          <!-- Top accent line -->
          <div style="height:5px;background:${accent};"></div>

          <!-- Dark header -->
          <div style="background:#111827;padding:28px 32px 24px;">
            <div style="display:inline-block;background:${accent}22;border:1px solid ${accent}55;border-radius:20px;padding:5px 14px;margin-bottom:14px;">
              <span style="font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:${accent};">💰&nbsp;&nbsp;Payroll Report</span>
            </div>
            <h1 style="margin:0 0 8px;font-size:21px;font-weight:800;color:#f8fafc;line-height:1.25;letter-spacing:-0.01em;">Payroll is ready to process</h1>
            <p style="margin:0;font-size:12px;color:#475569;">${sentAt}</p>
          </div>

          <!-- Body -->
          <div style="padding:32px;">
            <p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#0f172a;">Hi there,</p>
            <div style="background:#f8fafc;border-left:4px solid ${accent};border-radius:0 10px 10px 0;padding:16px 20px;margin:0 0 28px;">
              <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.65;">
                The pay week <strong>${weekStart}</strong> through <strong>${weekEnd}</strong> has been compiled and is ready for your review. Open the report to verify hours, approve deductions, and finalize driver pay.
              </p>
            </div>
            <table cellpadding="0" cellspacing="0"><tr><td>
              <a href="${payrollUrl}" style="display:inline-block;background:${accent};color:#ffffff;font-size:13px;font-weight:800;padding:14px 30px;border-radius:10px;text-decoration:none;letter-spacing:0.02em;">Open Payroll Report &rarr;</a>
            </td></tr></table>
          </div>

          <!-- Footer -->
          <div style="border-top:1px solid #e2e8f0;padding:18px 32px;background:#f8fafc;">
            <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.7;">
              Sent by <strong style="color:#64748b;">MyGroundOps</strong> &middot; Apparo Group INC<br/>
              <a href="${baseUrl}" style="color:#94a3b8;text-decoration:none;">mygroundops.com</a>
              &nbsp;&middot;&nbsp;You&apos;re receiving this because you manage payroll for your organization.
            </p>
          </div>

        </td></tr>
        <tr><td style="height:32px;"></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
