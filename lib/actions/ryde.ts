"use server";

import { db } from "@/lib/db";
import { rydeScores, rydeReviews, drivers } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";

export async function getRydeDrivers() {
  return db
    .select({ id: drivers.id, driverId: drivers.driverId, name: drivers.name })
    .from(drivers)
    .where(eq(drivers.active, true))
    .orderBy(drivers.name);
}

export async function getRydeScores() {
  return db
    .select()
    .from(rydeScores)
    .orderBy(desc(rydeScores.createdAt));
}

export async function getRydeReviews() {
  return db
    .select()
    .from(rydeReviews)
    .orderBy(desc(rydeReviews.createdAt));
}

export async function addRydeScore(data: {
  driverId: string;
  score: number;
  week: string;
  deliveries: number;
  positiveReviews: number;
}) {
  await db.insert(rydeScores).values(data);
}

export async function addRydeReview(data: {
  driverId: string;
  type: string;
  category: string | null;
  content: string;
  week: string | null;
  improvement: string | null;
}) {
  await db.insert(rydeReviews).values(data);
}

export async function deleteRydeScore(id: number) {
  await db.delete(rydeScores).where(eq(rydeScores.id, id));
}

export async function deleteRydeReview(id: number) {
  await db.delete(rydeReviews).where(eq(rydeReviews.id, id));
}
