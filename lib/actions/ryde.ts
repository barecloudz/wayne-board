"use server";

import { db } from "@/lib/db";
import { rydeScores, rydeReviews, drivers, settings } from "@/lib/schema";
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
  stars?: number | null;
  category: string | null;
  content: string;
  week: string | null;
  improvement: string | null;
  atFault?: boolean;
  customerInitials?: string | null;
}) {
  await db.insert(rydeReviews).values({ ...data, atFault: data.atFault ?? false });
}

export async function deleteRydeScore(id: number) {
  await db.delete(rydeScores).where(eq(rydeScores.id, id));
}

export async function deleteRydeReview(id: number) {
  await db.delete(rydeReviews).where(eq(rydeReviews.id, id));
}

// Leaderboard: computed from review star averages (not rydeScores table)
export async function getLeaderboard() {
  const rows = await db
    .select({
      driverId: rydeReviews.driverId,
      stars:    rydeReviews.stars,
      name:     drivers.name,
    })
    .from(rydeReviews)
    .innerJoin(drivers, eq(rydeReviews.driverId, drivers.driverId))
    .where(eq(drivers.active, true));

  // Only count reviews that have a star rating
  const ratedRows = rows.filter((r) => r.stars != null);

  const map = new Map<string, { name: string; stars: number[] }>();
  for (const r of ratedRows) {
    if (!map.has(r.driverId)) map.set(r.driverId, { name: r.name, stars: [] });
    map.get(r.driverId)!.stars.push(r.stars!);
  }

  return Array.from(map.entries())
    .map(([driverId, { name, stars }]) => ({
      driverId,
      initials: name.split(" ").filter(Boolean).map((w) => w[0].toUpperCase()).slice(0, 2).join(".") + ".",
      avgScore: stars.reduce((a, b) => a + b, 0) / stars.length,
      weeks:    stars.length,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 10);
}

// Manually set company Ryde rating (read from settings table)
export async function getCompanyRating(): Promise<number | null> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "company_ryde_rating"))
    .limit(1);
  if (rows.length === 0 || !rows[0].value) return null;
  const n = parseFloat(rows[0].value);
  return isNaN(n) ? null : n;
}

export async function setCompanyRating(rating: number) {
  await db
    .insert(settings)
    .values({ key: "company_ryde_rating", value: String(rating) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(rating) } });
}

export async function getRydeGoalMessage(): Promise<string> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "ryde_goal_message"))
    .limit(1);
  return rows[0]?.value ?? "";
}

export async function setRydeGoalMessage(message: string) {
  await db
    .insert(settings)
    .values({ key: "ryde_goal_message", value: message })
    .onConflictDoUpdate({ target: settings.key, set: { value: message } });
}

export async function updateRydeReview(id: number, data: {
  type: string;
  stars?: number | null;
  category: string | null;
  content: string;
  week: string | null;
  improvement: string | null;
  atFault: boolean;
  customerInitials?: string | null;
}) {
  await db.update(rydeReviews).set(data).where(eq(rydeReviews.id, id));
}
