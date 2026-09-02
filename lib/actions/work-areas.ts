"use server";

import { db } from "@/lib/db";
import { workAreas, dailyWorkAreaAssignments, drivers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export async function getWorkAreas() {
  const orgId = await requireOrg();
  return db.select().from(workAreas).where(eq(workAreas.organizationId, orgId)).orderBy(workAreas.name);
}

export async function createWorkArea(name: string, shape: string, color: string) {
  const orgId = await requireOrg();
  await db.insert(workAreas).values({ organizationId: orgId, name: name.trim(), shape, color });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/scheduling");
}

export async function deleteWorkArea(id: number) {
  const orgId = await requireOrg();
  await db.delete(workAreas).where(and(eq(workAreas.id, id), eq(workAreas.organizationId, orgId)));
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/scheduling");
}

export async function setDriverDefaultWorkArea(driverId: string, workAreaId: number | null) {
  const orgId = await requireOrg();
  await db.update(drivers).set({ defaultWorkAreaId: workAreaId }).where(and(eq(drivers.organizationId, orgId), eq(drivers.driverId, driverId)));
  revalidatePath("/dashboard/scheduling");
}

export async function setDailyWorkArea(driverId: string, date: string, workAreaId: number | null) {
  await db.delete(dailyWorkAreaAssignments)
    .where(and(eq(dailyWorkAreaAssignments.driverId, driverId), eq(dailyWorkAreaAssignments.date, date)));
  if (workAreaId !== null) {
    await db.insert(dailyWorkAreaAssignments).values({ driverId, date, workAreaId });
  }
  revalidatePath("/dashboard/scheduling");
}

export async function getAllDailyAssignments() {
  return db.select().from(dailyWorkAreaAssignments);
}
