"use server";

import { db } from "@/lib/db";
import { workAreas, dailyWorkAreaAssignments, drivers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getWorkAreas() {
  return db.select().from(workAreas).orderBy(workAreas.name);
}

export async function createWorkArea(name: string, shape: string, color: string) {
  await db.insert(workAreas).values({ name: name.trim(), shape, color });
  revalidatePath("/wayne-board");
  revalidatePath("/wayne-board/scheduling");
}

export async function deleteWorkArea(id: number) {
  await db.delete(workAreas).where(eq(workAreas.id, id));
  revalidatePath("/wayne-board");
  revalidatePath("/wayne-board/scheduling");
}

export async function setDriverDefaultWorkArea(driverId: string, workAreaId: number | null) {
  await db.update(drivers).set({ defaultWorkAreaId: workAreaId }).where(eq(drivers.driverId, driverId));
  revalidatePath("/wayne-board/scheduling");
}

export async function setDailyWorkArea(driverId: string, date: string, workAreaId: number | null) {
  await db.delete(dailyWorkAreaAssignments)
    .where(and(eq(dailyWorkAreaAssignments.driverId, driverId), eq(dailyWorkAreaAssignments.date, date)));
  if (workAreaId !== null) {
    await db.insert(dailyWorkAreaAssignments).values({ driverId, date, workAreaId });
  }
  revalidatePath("/wayne-board/scheduling");
}

export async function getAllDailyAssignments() {
  return db.select().from(dailyWorkAreaAssignments);
}
