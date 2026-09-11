"use server";

import { db } from "@/lib/db";
import { taskTemplates, taskCompletions } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export type TaskTemplate = {
  id: number;
  title: string;
  description: string | null;
  daysOfWeek: number[];
  dueTime: string;
  assignedRoles: string[];
  createdByRole: string;
  createdById: string;
  active: boolean;
  sortOrder: number;
};

export type TaskWithCompletion = TaskTemplate & {
  completedByIds: string[];
  completedByNames: string[];
};

// Parse helpers
function parseDays(s: string): number[] {
  return s.split(",").map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
}
function parseRoles(s: string): string[] {
  return s.split(",").map(r => r.trim()).filter(Boolean);
}

export async function getTasksForToday(): Promise<TaskWithCompletion[]> {
  const session = await requireOrg();
  const orgId = session.organizationId;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const dayOfWeek = today.getDay();

  const templates = await db
    .select()
    .from(taskTemplates)
    .where(and(eq(taskTemplates.organizationId, orgId), eq(taskTemplates.active, true)));

  const completions = await db
    .select()
    .from(taskCompletions)
    .where(and(eq(taskCompletions.organizationId, orgId), eq(taskCompletions.date, todayStr)));

  const completionMap = new Map<number, { ids: string[]; names: string[] }>();
  for (const c of completions) {
    if (!completionMap.has(c.taskId)) completionMap.set(c.taskId, { ids: [], names: [] });
    completionMap.get(c.taskId)!.ids.push(c.completedById);
    completionMap.get(c.taskId)!.names.push(c.completedByName);
  }

  // Filter to tasks scheduled for today and assigned to this user's role
  const result: TaskWithCompletion[] = [];
  for (const t of templates) {
    const days = parseDays(t.daysOfWeek);
    const roles = parseRoles(t.assignedRoles);
    if (!days.includes(dayOfWeek)) continue;
    if (!roles.includes(session.role)) continue;
    const comp = completionMap.get(t.id) ?? { ids: [], names: [] };
    result.push({
      id: t.id,
      title: t.title,
      description: t.description,
      daysOfWeek: days,
      dueTime: t.dueTime,
      assignedRoles: roles,
      createdByRole: t.createdByRole,
      createdById: t.createdById,
      active: t.active,
      sortOrder: t.sortOrder,
      completedByIds: comp.ids,
      completedByNames: comp.names,
    });
  }

  result.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  return result;
}

export async function getAllTaskTemplates(): Promise<TaskTemplate[]> {
  const session = await requireOrg();
  const orgId = session.organizationId;
  const rows = await db
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.organizationId, orgId));
  return rows.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description,
    daysOfWeek: parseDays(t.daysOfWeek),
    dueTime: t.dueTime,
    assignedRoles: parseRoles(t.assignedRoles),
    createdByRole: t.createdByRole,
    createdById: t.createdById,
    active: t.active,
    sortOrder: t.sortOrder,
  }));
}

export async function completeTask(taskId: number): Promise<void> {
  const session = await requireOrg();
  const today = new Date().toISOString().slice(0, 10);
  await db
    .insert(taskCompletions)
    .values({
      organizationId: session.organizationId,
      taskId,
      completedById: session.driverId,
      completedByName: session.name,
      date: today,
    })
    .onConflictDoNothing();
  revalidatePath("/dashboard/tasks");
}

export async function uncompleteTask(taskId: number): Promise<void> {
  const session = await requireOrg();
  const today = new Date().toISOString().slice(0, 10);
  await db
    .delete(taskCompletions)
    .where(
      and(
        eq(taskCompletions.organizationId, session.organizationId),
        eq(taskCompletions.taskId, taskId),
        eq(taskCompletions.date, today),
        eq(taskCompletions.completedById, session.driverId),
      )
    );
  revalidatePath("/dashboard/tasks");
}

export async function createTaskTemplate(data: {
  title: string;
  description?: string;
  daysOfWeek: number[];
  dueTime: string;
  assignedRoles: string[];
}): Promise<void> {
  const session = await requireOrg();
  await db.insert(taskTemplates).values({
    organizationId: session.organizationId,
    title: data.title,
    description: data.description ?? null,
    daysOfWeek: data.daysOfWeek.join(","),
    dueTime: data.dueTime,
    assignedRoles: data.assignedRoles.join(","),
    createdByRole: session.role,
    createdById: session.driverId,
    active: true,
    sortOrder: 0,
  });
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/settings");
}

export async function updateTaskTemplate(id: number, data: {
  title?: string;
  description?: string;
  daysOfWeek?: number[];
  dueTime?: string;
  assignedRoles?: string[];
  active?: boolean;
}): Promise<void> {
  const session = await requireOrg();
  // Verify belongs to org
  const [existing] = await db
    .select({ organizationId: taskTemplates.organizationId, createdByRole: taskTemplates.createdByRole })
    .from(taskTemplates)
    .where(eq(taskTemplates.id, id))
    .limit(1);
  if (!existing || existing.organizationId !== session.organizationId) throw new Error("Not found");

  await db.update(taskTemplates).set({
    ...(data.title !== undefined && { title: data.title }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.daysOfWeek !== undefined && { daysOfWeek: data.daysOfWeek.join(",") }),
    ...(data.dueTime !== undefined && { dueTime: data.dueTime }),
    ...(data.assignedRoles !== undefined && { assignedRoles: data.assignedRoles.join(",") }),
    ...(data.active !== undefined && { active: data.active }),
  }).where(eq(taskTemplates.id, id));
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/settings");
}

export async function deleteTaskTemplate(id: number): Promise<{ success: boolean; error?: string }> {
  const session = await requireOrg();
  const [existing] = await db
    .select({ organizationId: taskTemplates.organizationId, createdByRole: taskTemplates.createdByRole })
    .from(taskTemplates)
    .where(eq(taskTemplates.id, id))
    .limit(1);
  if (!existing || existing.organizationId !== session.organizationId) return { success: false, error: "Not found" };
  // BC cannot delete tasks created by owner
  if (session.role === "bc" && existing.createdByRole === "owner") {
    return { success: false, error: "Tasks created by the owner can only be deleted by the owner." };
  }
  await db.delete(taskTemplates).where(eq(taskTemplates.id, id));
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/settings");
  return { success: true };
}
