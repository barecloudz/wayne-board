import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings, organizations } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Called by Vercel Cron — no session available; reads settings directly from DB
export async function GET() {
  try {
    // Get all orgs
    const allOrgs = await db.select({ id: organizations.id }).from(organizations);

    let sent = 0;
    for (const org of allOrgs) {
      const orgSettings = await db
        .select({ key: settings.key, value: settings.value })
        .from(settings)
        .where(eq(settings.organizationId, org.id));

      const settingMap = new Map(orgSettings.map((s) => [s.key, s.value]));
      const recipientsRaw = settingMap.get("payroll_email_recipients") ?? "";
      const sendDay = parseInt(settingMap.get("payroll_email_day") ?? "6", 10);
      const sendTime = settingMap.get("payroll_email_time") ?? "08:00";
      const payWeekStart = parseInt(settingMap.get("pay_week_start") ?? "6", 10);

      const recipientList = recipientsRaw
        .split(/[,\n]/)
        .map((e: string) => e.trim())
        .filter((e: string) => e.includes("@"));

      if (recipientList.length === 0) continue;

      const now = new Date();
      const dayOfWeek = now.getDay();
      if (dayOfWeek !== sendDay) continue;

      const [configHour] = sendTime.split(":").map(Number);
      if (now.getHours() !== configHour) continue;

      // Compute last completed pay week
      const payWeekEnd = (payWeekStart + 6) % 7;
      const daysToEnd = ((dayOfWeek - payWeekEnd + 7) % 7) || 7;
      const lastEndDay = new Date(now);
      lastEndDay.setDate(now.getDate() - daysToEnd);
      const weekEnd = lastEndDay.toISOString().slice(0, 10);
      const weekStartDate = new Date(lastEndDay);
      weekStartDate.setDate(lastEndDay.getDate() - 6);
      const weekStart = weekStartDate.toISOString().slice(0, 10);

      const payrollUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://mygroundops.com"}/dashboard/payroll`;

      await resend.emails.send({
        from: "MyGroundOps <payroll@mygroundops.com>",
        to: recipientList,
        subject: `Payroll Ready: ${weekStart} \u2013 ${weekEnd}`,
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
      sent++;
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error("Payroll email cron error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
