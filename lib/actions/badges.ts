"use server";

import { db } from "@/lib/db";
import { badgeTypes, driverBadges, drivers, dswRouteDays } from "@/lib/schema";
import { eq, and, gte, lte, isNotNull, isNull, inArray, sql, desc, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function requireOrg(): Promise<number> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type BadgeTypeRow = {
  id: number;
  rank: number | null;
  name: string;
  iconUrl: string | null;
  shine: boolean;
  category: string;
};

export type TopDriverRow = {
  driverId: string;
  driverName: string;
  avgIls: number;
  dayCount: number;
  unmappedCount: number;
};

export type BadgeHistoryRow = {
  id: number;
  weekStart: string;
  driverName: string;
  driverId: string;
  avatarUrl: string | null;
  badgeName: string;
  iconUrl: string | null;
  shine: boolean;
  awardedAt: Date;
};

export type DriverBadgeRow = {
  id: number;
  weekStart: string;
  badgeName: string;
  iconUrl: string | null;
  shine: boolean;
  category: string;
  awardedAt: Date;
};

// ── Badge Type CRUD ──────────────────────────────────────────────────────────

export async function getBadgeTypes(): Promise<BadgeTypeRow[]> {
  const orgId = await requireOrg();
  return db
    .select({
      id:       badgeTypes.id,
      rank:     badgeTypes.rank,
      name:     badgeTypes.name,
      iconUrl:  badgeTypes.iconUrl,
      shine:    badgeTypes.shine,
      category: badgeTypes.category,
    })
    .from(badgeTypes)
    .where(eq(badgeTypes.organizationId, orgId))
    .orderBy(badgeTypes.category, badgeTypes.rank);
}

export async function upsertBadgeType(data: {
  id?: number;
  rank?: number | null;
  name: string;
  iconUrl?: string | null;
  shine: boolean;
  category: string;
}): Promise<{ id: number }> {
  const orgId = await requireOrg();
  if (data.id) {
    await db
      .update(badgeTypes)
      .set({ name: data.name, iconUrl: data.iconUrl ?? null, shine: data.shine })
      .where(and(eq(badgeTypes.id, data.id), eq(badgeTypes.organizationId, orgId)));
    revalidatePath("/dashboard/leaderboard");
    return { id: data.id };
  }
  try {
    const [row] = await db.insert(badgeTypes).values({
      organizationId: orgId,
      rank:           data.rank ?? null,
      name:           data.name,
      iconUrl:        data.iconUrl ?? null,
      shine:          data.shine,
      category:       data.category,
    }).returning({ id: badgeTypes.id });
    revalidatePath("/dashboard/leaderboard");
    return { id: row.id };
  } catch (e: unknown) {
    // Unique constraint on (organizationId, rank) — row already exists, return its id
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("duplicate key") && data.rank) {
      const [existing] = await db
        .select({ id: badgeTypes.id })
        .from(badgeTypes)
        .where(and(eq(badgeTypes.organizationId, orgId), eq(badgeTypes.rank, data.rank)))
        .limit(1);
      if (existing) { revalidatePath("/dashboard/leaderboard"); return { id: existing.id }; }
    }
    throw e;
  }
}

export async function clearBadgeIcon(badgeTypeId: number): Promise<void> {
  const orgId = await requireOrg();
  await db
    .update(badgeTypes)
    .set({ iconUrl: null })
    .where(and(eq(badgeTypes.id, badgeTypeId), eq(badgeTypes.organizationId, orgId)));
  revalidatePath("/dashboard/leaderboard");
}

export async function revokeBadge(driverBadgeId: number): Promise<void> {
  const orgId = await requireOrg();
  await db
    .delete(driverBadges)
    .where(and(eq(driverBadges.id, driverBadgeId), eq(driverBadges.organizationId, orgId)));
  revalidatePath("/dashboard/leaderboard");
}

export async function deleteBadgeType(id: number): Promise<void> {
  const orgId = await requireOrg();
  const [row] = await db
    .select({ category: badgeTypes.category })
    .from(badgeTypes)
    .where(and(eq(badgeTypes.id, id), eq(badgeTypes.organizationId, orgId)))
    .limit(1);
  if (!row) throw new Error("Badge type not found.");
  if (row.category !== "special") throw new Error("Weekly rank badge types cannot be deleted.");
  await db
    .delete(badgeTypes)
    .where(and(eq(badgeTypes.id, id), eq(badgeTypes.organizationId, orgId)));
  revalidatePath("/dashboard/leaderboard");
}

// ── Leaderboard Computation ──────────────────────────────────────────────────

export async function computeTopDrivers(
  weekStart: string,
  weekEnd: string,
): Promise<TopDriverRow[]> {
  const orgId = await requireOrg();

  // Fetch all mapped rows (driverId IS NOT NULL) for this week
  // dswRouteDays.date is the column (not routeDate), ilsPct is the column (not ilsPercent)
  const rows = await db
    .select({
      driverId:   dswRouteDays.driverId,
      driverName: drivers.name,
      ilsPct:     dswRouteDays.ilsPct,
    })
    .from(dswRouteDays)
    .innerJoin(
      drivers,
      and(
        eq(drivers.driverId, dswRouteDays.driverId!),
        eq(drivers.organizationId, orgId),
      ),
    )
    .where(
      and(
        eq(dswRouteDays.organizationId, orgId),
        gte(dswRouteDays.date, weekStart),
        lte(dswRouteDays.date, weekEnd),
        isNotNull(dswRouteDays.driverId),
      ),
    );

  // Count unmapped rows for the same period
  const [{ unmapped }] = await db
    .select({ unmapped: count() })
    .from(dswRouteDays)
    .where(
      and(
        eq(dswRouteDays.organizationId, orgId),
        gte(dswRouteDays.date, weekStart),
        lte(dswRouteDays.date, weekEnd),
        sql`${dswRouteDays.driverId} IS NULL`,
      ),
    );

  // Aggregate by driverId (skip rows where ilsPct is null)
  const map = new Map<string, { driverName: string; total: number; days: number }>();
  for (const row of rows) {
    if (!row.driverId) continue;
    const ils = row.ilsPct != null ? Number(row.ilsPct) : null;
    if (ils === null) continue;
    const prev = map.get(row.driverId);
    if (prev) {
      prev.total += ils;
      prev.days  += 1;
    } else {
      map.set(row.driverId, { driverName: row.driverName, total: ils, days: 1 });
    }
  }

  const unmappedCount = Number(unmapped);

  return Array.from(map.entries())
    .map(([driverId, v]) => ({
      driverId,
      driverName:    v.driverName,
      avgIls:        parseFloat((v.total / v.days).toFixed(2)),
      dayCount:      v.days,
      unmappedCount,
    }))
    .sort((a, b) => b.avgIls - a.avgIls)
    .slice(0, 3);
}

// ── Award Logic ──────────────────────────────────────────────────────────────

export async function isWeekAwarded(weekStart: string): Promise<boolean> {
  const orgId = await requireOrg();
  const rows = await db
    .select({ id: driverBadges.id })
    .from(driverBadges)
    .where(
      and(
        eq(driverBadges.organizationId, orgId),
        eq(driverBadges.weekStart, weekStart),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function awardBadgesForWeek(
  weekStart: string,
  awards: Array<{ driverId: string; badgeTypeId: number }>,
): Promise<{ inserted: number; skipped: number }> {
  const orgId = await requireOrg();
  let inserted = 0;
  let skipped  = 0;
  for (const { driverId, badgeTypeId } of awards) {
    const result = await db
      .insert(driverBadges)
      .values({ organizationId: orgId, driverId, badgeTypeId, weekStart })
      .onConflictDoNothing()
      .returning({ id: driverBadges.id });
    if (result.length > 0) inserted++;
    else skipped++;
  }
  revalidatePath("/dashboard/leaderboard");
  revalidatePath("/driver");
  return { inserted, skipped };
}

export async function awardSpecialBadge(
  driverId: string,
  badgeTypeId: number,
  weekStart: string,
): Promise<void> {
  const orgId = await requireOrg();
  await db
    .insert(driverBadges)
    .values({ organizationId: orgId, driverId, badgeTypeId, weekStart })
    .onConflictDoNothing();
  revalidatePath("/dashboard/leaderboard");
  revalidatePath("/driver");
}

// ── Query Functions ──────────────────────────────────────────────────────────

export async function getBadgeHistory(limit = 50): Promise<BadgeHistoryRow[]> {
  const orgId = await requireOrg();
  const rows = await db
    .select({
      id:         driverBadges.id,
      weekStart:  driverBadges.weekStart,
      driverName: drivers.name,
      driverId:   driverBadges.driverId,
      avatarUrl:  drivers.avatarUrl,
      badgeName:  badgeTypes.name,
      iconUrl:    badgeTypes.iconUrl,
      shine:      badgeTypes.shine,
      awardedAt:  driverBadges.awardedAt,
    })
    .from(driverBadges)
    .innerJoin(
      drivers,
      and(
        eq(drivers.driverId, driverBadges.driverId),
        eq(drivers.organizationId, orgId),
      ),
    )
    .innerJoin(
      badgeTypes,
      and(
        eq(badgeTypes.id, driverBadges.badgeTypeId),
        eq(badgeTypes.organizationId, orgId),
      ),
    )
    .where(eq(driverBadges.organizationId, orgId))
    .orderBy(desc(driverBadges.awardedAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    weekStart: String(r.weekStart).slice(0, 10),
  }));
}

export async function getDriverBadges(driverId: string): Promise<DriverBadgeRow[]> {
  const orgId = await requireOrg();
  const rows = await db
    .select({
      id:        driverBadges.id,
      weekStart: driverBadges.weekStart,
      badgeName: badgeTypes.name,
      iconUrl:   badgeTypes.iconUrl,
      shine:     badgeTypes.shine,
      category:  badgeTypes.category,
      awardedAt: driverBadges.awardedAt,
    })
    .from(driverBadges)
    .innerJoin(
      badgeTypes,
      and(
        eq(badgeTypes.id, driverBadges.badgeTypeId),
        eq(badgeTypes.organizationId, orgId),
      ),
    )
    .where(
      and(
        eq(driverBadges.organizationId, orgId),
        eq(driverBadges.driverId, driverId),
      ),
    )
    .orderBy(desc(driverBadges.awardedAt));
  return rows.map((r) => ({
    ...r,
    weekStart: String(r.weekStart).slice(0, 10),
  }));
}

export async function getDriverBadgeCounts(): Promise<
  Array<{ driverId: string; badgeCount: number }>
> {
  const orgId = await requireOrg();
  const rows = await db
    .select({
      driverId:   driverBadges.driverId,
      badgeCount: count(),
    })
    .from(driverBadges)
    .where(eq(driverBadges.organizationId, orgId))
    .groupBy(driverBadges.driverId);
  return rows.map((r) => ({
    driverId:   r.driverId,
    badgeCount: Number(r.badgeCount),
  }));
}

export async function getUnseenBadges(driverId: string): Promise<DriverBadgeRow[]> {
  const orgId = await requireOrg();
  const rows = await db
    .select({
      id:        driverBadges.id,
      weekStart: driverBadges.weekStart,
      badgeName: badgeTypes.name,
      iconUrl:   badgeTypes.iconUrl,
      shine:     badgeTypes.shine,
      category:  badgeTypes.category,
      awardedAt: driverBadges.awardedAt,
    })
    .from(driverBadges)
    .innerJoin(badgeTypes, and(eq(badgeTypes.id, driverBadges.badgeTypeId), eq(badgeTypes.organizationId, orgId)))
    .where(
      and(
        eq(driverBadges.organizationId, orgId),
        eq(driverBadges.driverId, driverId),
        isNull(driverBadges.seenAt),
      )
    )
    .orderBy(desc(driverBadges.awardedAt));
  return rows.map(r => ({ ...r, weekStart: String(r.weekStart).slice(0, 10) }));
}

export async function markBadgesSeen(badgeIds: number[]): Promise<void> {
  if (badgeIds.length === 0) return;
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  await db
    .update(driverBadges)
    .set({ seenAt: new Date() })
    .where(
      and(
        eq(driverBadges.organizationId, session.organizationId),
        eq(driverBadges.driverId, session.driverId),
        inArray(driverBadges.id, badgeIds),
      )
    );
  revalidatePath("/driver");
}
