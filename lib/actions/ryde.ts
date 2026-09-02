"use server";

import { db } from "@/lib/db";
import { rydeScores, rydeReviews, drivers, settings } from "@/lib/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export async function getRydeDrivers() {
  const orgId = await requireOrg();
  return db
    .select({ id: drivers.id, driverId: drivers.driverId, name: drivers.name })
    .from(drivers)
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.active, true)))
    .orderBy(drivers.name);
}

export async function getRydeScores() {
  const orgId = await requireOrg();
  return db
    .select()
    .from(rydeScores)
    .where(eq(rydeScores.organizationId, orgId))
    .orderBy(desc(rydeScores.createdAt));
}

export async function getRydeReviews() {
  const orgId = await requireOrg();
  return db
    .select()
    .from(rydeReviews)
    .where(eq(rydeReviews.organizationId, orgId))
    .orderBy(desc(rydeReviews.createdAt));
}

export async function addRydeScore(data: {
  driverId: string;
  score: number;
  week: string;
  deliveries: number;
  positiveReviews: number;
}) {
  const orgId = await requireOrg();
  await db.insert(rydeScores).values({ ...data, organizationId: orgId });
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
  const orgId = await requireOrg();
  await db.insert(rydeReviews).values({ ...data, organizationId: orgId, atFault: data.atFault ?? false });
}

export async function deleteRydeScore(id: number) {
  const orgId = await requireOrg();
  await db.delete(rydeScores).where(and(eq(rydeScores.id, id), eq(rydeScores.organizationId, orgId)));
}

export async function deleteRydeReview(id: number) {
  const orgId = await requireOrg();
  await db.delete(rydeReviews).where(and(eq(rydeReviews.id, id), eq(rydeReviews.organizationId, orgId)));
}

// Leaderboard: computed from review star averages (not rydeScores table)
export async function getLeaderboard() {
  const orgId = await requireOrg();
  const rows = await db
    .select({
      driverId: rydeReviews.driverId,
      stars:    rydeReviews.stars,
      name:     drivers.name,
    })
    .from(rydeReviews)
    .innerJoin(drivers, eq(rydeReviews.driverId, drivers.driverId))
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.active, true)));

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
  const orgId = await requireOrg();
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.organizationId, orgId), eq(settings.key, "company_ryde_rating")))
    .limit(1);
  if (rows.length === 0 || !rows[0].value) return null;
  const n = parseFloat(rows[0].value);
  return isNaN(n) ? null : n;
}

export async function setCompanyRating(rating: number) {
  const orgId = await requireOrg();
  await db
    .insert(settings)
    .values({ organizationId: orgId, key: "company_ryde_rating", value: String(rating) })
    .onConflictDoUpdate({ target: [settings.organizationId, settings.key], set: { value: String(rating) } });
}

export async function getRydeGoalMessage(): Promise<string> {
  const orgId = await requireOrg();
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.organizationId, orgId), eq(settings.key, "ryde_goal_message")))
    .limit(1);
  return rows[0]?.value ?? "";
}

export async function setRydeGoalMessage(message: string) {
  const orgId = await requireOrg();
  await db
    .insert(settings)
    .values({ organizationId: orgId, key: "ryde_goal_message", value: message })
    .onConflictDoUpdate({ target: [settings.organizationId, settings.key], set: { value: message } });
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
  const orgId = await requireOrg();
  await db.update(rydeReviews).set(data).where(and(eq(rydeReviews.id, id), eq(rydeReviews.organizationId, orgId)));
}
