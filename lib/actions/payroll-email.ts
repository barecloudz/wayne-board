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

  try {
    await resend.emails.send({
      from: "MyGroundOps <payroll@mygroundops.com>",
      to: recipientList,
      subject: `Payroll Ready: ${weekStart} – ${weekEnd}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
          <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 8px;">Payroll is ready</h2>
          <p style="font-size:14px;color:#64748b;margin:0 0 24px;">
            The pay week <strong>${weekStart}</strong> through <strong>${weekEnd}</strong> is ready for processing.
          </p>
          <a href="${payrollUrl}" style="display:inline-block;background:#0f172a;color:#fff;font-size:13px;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;">
            View Payroll Report &rarr;
          </a>
          <p style="font-size:11px;color:#94a3b8;margin-top:32px;">Sent by MyGroundOps &middot; <a href="${payrollUrl}" style="color:#94a3b8;">mygroundops.com</a></p>
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
