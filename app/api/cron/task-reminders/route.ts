import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskTemplates, taskCompletions, organizations, settings } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const dayOfWeek = now.getDay();

    const allOrgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
    let notified = 0;

    for (const org of allOrgs) {
      // Get settings
      const orgSettings = await db.select({ key: settings.key, value: settings.value })
        .from(settings).where(eq(settings.organizationId, org.id));
      const settingMap = new Map(orgSettings.map(s => [s.key, s.value]));

      const recipientsRaw = settingMap.get("task_reminder_recipients") ?? "";
      const recipientList = recipientsRaw.split(/[,\n]/).map(e => e.trim()).filter(e => e.includes("@"));
      if (recipientList.length === 0) continue;

      // Get active tasks for today
      const templates = await db.select().from(taskTemplates)
        .where(and(eq(taskTemplates.organizationId, org.id), eq(taskTemplates.active, true)));

      const todayTasks = templates.filter(t => {
        const days = t.daysOfWeek.split(",").map(Number);
        return days.includes(dayOfWeek);
      });

      if (todayTasks.length === 0) continue;

      // Check which tasks are past due and incomplete
      const completions = await db.select({ taskId: taskCompletions.taskId })
        .from(taskCompletions)
        .where(and(eq(taskCompletions.organizationId, org.id), eq(taskCompletions.date, todayStr)));
      const completedIds = new Set(completions.map(c => c.taskId));

      const overdueTasks = todayTasks.filter(t => {
        const [dueH, dueM] = t.dueTime.split(":").map(Number);
        const isPastDue = currentHour > dueH || (currentHour === dueH && currentMinute >= dueM);
        return isPastDue && !completedIds.has(t.id);
      });

      if (overdueTasks.length === 0) continue;

      // Only send once — check if already sent this hour by checking a flag
      // Simple approach: only notify when the hour exactly matches the due hour
      // (cron runs every hour, so this fires once per task per day)
      const freshOverdue = overdueTasks.filter(t => {
        const [dueH] = t.dueTime.split(":").map(Number);
        return currentHour === dueH;
      });

      if (freshOverdue.length === 0) continue;

      const taskList = freshOverdue.map(t => `<li style="margin:4px 0;">${t.title} (due ${t.dueTime})</li>`).join("");
      const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://mygroundops.com"}/dashboard/tasks`;

      await resend.emails.send({
        from: "MyGroundOps <tasks@mygroundops.com>",
        to: recipientList,
        subject: `${freshOverdue.length} task${freshOverdue.length > 1 ? "s" : ""} overdue — ${org.name}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
            <h2 style="font-size:18px;font-weight:800;color:#0f172a;margin:0 0 8px;">Tasks not completed</h2>
            <p style="font-size:14px;color:#64748b;margin:0 0 16px;">${freshOverdue.length} task${freshOverdue.length > 1 ? "s" : ""} passed their due time without being checked off:</p>
            <ul style="font-size:14px;color:#0f172a;padding-left:20px;margin:0 0 24px;">${taskList}</ul>
            <a href="${dashboardUrl}" style="display:inline-block;background:#0f172a;color:#fff;font-size:13px;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;">Open Task List →</a>
            <p style="font-size:11px;color:#94a3b8;margin-top:32px;">Sent by MyGroundOps · ${org.name}</p>
          </div>
        `,
      });
      notified++;
    }

    return NextResponse.json({ ok: true, notified });
  } catch (err) {
    console.error("Task reminder cron error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
