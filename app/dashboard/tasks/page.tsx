export const dynamic = "force-dynamic";

import AppShell from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getTasksForToday } from "@/lib/actions/tasks";
import TasksClient from "./tasks-client";

export default async function TasksPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  // Only admin roles see tasks
  if (!["owner", "co_owner", "bc", "developer"].includes(session.role)) redirect("/dashboard");

  const tasks = await getTasksForToday();
  return (
    <AppShell>
      <TasksClient tasks={tasks} currentUserId={session.driverId} currentUserRole={session.role} />
    </AppShell>
  );
}
