import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskTemplates, taskCompletions, organizations } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";

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

      // Only notify once — fire when the current hour matches the task's due hour
      // (cron runs every hour, so this fires once per task per day)
      const freshOverdue = overdueTasks.filter(t => {
        const [dueH] = t.dueTime.split(":").map(Number);
        return currentHour === dueH;
      });

      if (freshOverdue.length === 0) continue;

      const taskNames = freshOverdue.map(t => `${t.title} (due ${t.dueTime})`).join(", ");

      await createNotification({
        organizationId: org.id,
        type: NOTIFICATION_TYPES.TASK_OVERDUE,
        title: `${freshOverdue.length} task${freshOverdue.length > 1 ? "s" : ""} overdue`,
        body: `The following task${freshOverdue.length > 1 ? "s are" : " is"} past due: ${taskNames}.`,
        linkTo: "/dashboard/tasks",
        metadata: {
          taskIds: freshOverdue.map(t => t.id),
          orgName: org.name,
        },
      });
      notified++;
    }

    return NextResponse.json({ ok: true, notified });
  } catch (err) {
    console.error("Task reminder cron error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
