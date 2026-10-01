/**
 * Weekly & monthly badge award computation.
 * No "use server" — safe to call from server components, API routes, and Netlify cron.
 * Callers that need cache invalidation should call revalidatePath themselves.
 */

import { db } from "@/lib/db";
import {
  badgeTypes, driverBadges, dswRouteDays, rydeReviews, drivers,
} from "@/lib/schema";
import { eq, and, gte, lte, isNotNull, isNull, inArray } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AwardResult = {
  week: string;
  ilsGold: string | null;
  ilsSilver: string | null;
  ilsBronze: string | null;
  topRated: string | null;
  monthlyPerformer: string[] | null;
  badgesInserted: number;
  skipped: number;
};

export type WeeklyStanding = {
  driverId: string;
  driverName: string;
  ilsRank: number | null;
  avgIls: number | null;
  rydeRank: number | null;
  bayesianAvg: number | null;
  reviewCount: number;
};

export type MonthlyBadgeCount = {
  driverId: string;
  driverName: string;
  badgeCount: number;
  gold: number;
  silver: number;
  bronze: number;
};

// ── Date Helpers ──────────────────────────────────────────────────────────────

export function getPreviousMonday(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diff - 7);
  return mon.toISOString().slice(0, 10);
}

export function getCurrentMonday(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Derives ISO week string (e.g. "2026-W40") from a Monday date. */
function toIsoWeek(mondayStr: string): string {
  const d = new Date(mondayStr + "T12:00:00Z");
  // Thursday of that week determines ISO year + week number
  const thursday = new Date(d);
  thursday.setDate(d.getDate() + 3);
  const year = thursday.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const weekOneMonday = new Date(jan4);
  weekOneMonday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const weekNum =
    Math.floor((thursday.getTime() - weekOneMonday.getTime()) / (7 * 86400000)) + 1;
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

// ── Badge Type Seeding ────────────────────────────────────────────────────────

async function ensureIlsBadgeType(orgId: number, rank: 1 | 2 | 3): Promise<number> {
  const names: Record<number, string> = { 1: "ILS Gold", 2: "ILS Silver", 3: "ILS Bronze" };
  const [existing] = await db
    .select({ id: badgeTypes.id })
    .from(badgeTypes)
    .where(and(eq(badgeTypes.organizationId, orgId), eq(badgeTypes.rank, rank)))
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(badgeTypes)
    .values({ organizationId: orgId, rank, name: names[rank], shine: rank === 1, category: "weekly" })
    .onConflictDoNothing()
    .returning({ id: badgeTypes.id });
  if (row) return row.id;
  const [retry] = await db
    .select({ id: badgeTypes.id })
    .from(badgeTypes)
    .where(and(eq(badgeTypes.organizationId, orgId), eq(badgeTypes.rank, rank)))
    .limit(1);
  return retry!.id;
}

async function ensureUnrankedBadgeType(
  orgId: number,
  category: string,
  name: string,
  shine: boolean,
): Promise<number> {
  const [existing] = await db
    .select({ id: badgeTypes.id })
    .from(badgeTypes)
    .where(
      and(
        eq(badgeTypes.organizationId, orgId),
        eq(badgeTypes.category, category),
        isNull(badgeTypes.rank),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(badgeTypes)
    .values({ organizationId: orgId, rank: null, name, shine, category })
    .returning({ id: badgeTypes.id });
  if (row) return row.id;
  const [retry] = await db
    .select({ id: badgeTypes.id })
    .from(badgeTypes)
    .where(
      and(
        eq(badgeTypes.organizationId, orgId),
        eq(badgeTypes.category, category),
        isNull(badgeTypes.rank),
      ),
    )
    .limit(1);
  return retry!.id;
}

async function insertBadge(
  orgId: number,
  driverId: string,
  badgeTypeId: number,
  weekStart: string,
): Promise<boolean> {
  const result = await db
    .insert(driverBadges)
    .values({ organizationId: orgId, driverId, badgeTypeId, weekStart })
    .onConflictDoNothing()
    .returning({ id: driverBadges.id });
  return result.length > 0;
}

// ── Award Computation ─────────────────────────────────────────────────────────

export async function computeAndAwardWeeklyBadges(
  weekStart: string,
  orgId: number,
): Promise<AwardResult> {
  const weekEnd = addDays(weekStart, 6);
  const isoWeek = toIsoWeek(weekStart);

  let badgesInserted = 0;
  let skipped = 0;

  // ── ILS badges (Gold / Silver / Bronze) ────────────────────────────────────
  const dswRows = await db
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
        isNotNull(dswRouteDays.ilsPct),
      ),
    );

  const ilsMap = new Map<string, { driverName: string; total: number; days: number }>();
  for (const row of dswRows) {
    if (!row.driverId) continue;
    const ils = Number(row.ilsPct);
    const prev = ilsMap.get(row.driverId);
    if (prev) { prev.total += ils; prev.days += 1; }
    else ilsMap.set(row.driverId, { driverName: row.driverName, total: ils, days: 1 });
  }

  // Sort: ascending avgIls (lower = better), break ties by descending dayCount
  const ilsRanked = Array.from(ilsMap.entries())
    .map(([driverId, v]) => ({ driverId, driverName: v.driverName, avgIls: v.total / v.days, days: v.days }))
    .sort((a, b) => a.avgIls !== b.avgIls ? a.avgIls - b.avgIls : b.days - a.days);

  let ilsGold: string | null   = null;
  let ilsSilver: string | null = null;
  let ilsBronze: string | null = null;

  if (ilsRanked[0]) {
    const id = await ensureIlsBadgeType(orgId, 1);
    ilsGold = ilsRanked[0].driverName;
    (await insertBadge(orgId, ilsRanked[0].driverId, id, weekStart)) ? badgesInserted++ : skipped++;
  }
  if (ilsRanked[1]) {
    const id = await ensureIlsBadgeType(orgId, 2);
    ilsSilver = ilsRanked[1].driverName;
    (await insertBadge(orgId, ilsRanked[1].driverId, id, weekStart)) ? badgesInserted++ : skipped++;
  }
  if (ilsRanked[2]) {
    const id = await ensureIlsBadgeType(orgId, 3);
    ilsBronze = ilsRanked[2].driverName;
    (await insertBadge(orgId, ilsRanked[2].driverId, id, weekStart)) ? badgesInserted++ : skipped++;
  }

  // ── Top Rated (Ryde) badge ─────────────────────────────────────────────────
  const weekReviews = await db
    .select({ driverId: rydeReviews.driverId, stars: rydeReviews.stars })
    .from(rydeReviews)
    .where(
      and(
        eq(rydeReviews.organizationId, orgId),
        eq(rydeReviews.week, isoWeek),
        isNotNull(rydeReviews.stars),
      ),
    );

  const allStars = await db
    .select({ stars: rydeReviews.stars })
    .from(rydeReviews)
    .where(and(eq(rydeReviews.organizationId, orgId), isNotNull(rydeReviews.stars)));

  const globalMean =
    allStars.length > 0
      ? allStars.reduce((s, r) => s + (r.stars ?? 0), 0) / allStars.length
      : 5;

  const PRIOR = 5;
  const rydeMap = new Map<string, { sum: number; count: number }>();
  for (const r of weekReviews) {
    if (!r.driverId) continue;
    const prev = rydeMap.get(r.driverId);
    if (prev) { prev.sum += r.stars!; prev.count += 1; }
    else rydeMap.set(r.driverId, { sum: r.stars!, count: 1 });
  }

  const rydeRanked = Array.from(rydeMap.entries())
    .map(([driverId, v]) => ({
      driverId,
      bayesianAvg: (v.sum + PRIOR * globalMean) / (v.count + PRIOR),
    }))
    .sort((a, b) => b.bayesianAvg - a.bayesianAvg);

  let topRated: string | null = null;
  if (rydeRanked[0]) {
    const topRatedId = await ensureUnrankedBadgeType(orgId, "weekly_ryde", "Top Rated", true);
    const [driverRow] = await db
      .select({ name: drivers.name })
      .from(drivers)
      .where(and(eq(drivers.driverId, rydeRanked[0].driverId), eq(drivers.organizationId, orgId)))
      .limit(1);
    topRated = driverRow?.name ?? rydeRanked[0].driverId;
    (await insertBadge(orgId, rydeRanked[0].driverId, topRatedId, weekStart))
      ? badgesInserted++
      : skipped++;
  }

  return {
    week: weekStart,
    ilsGold,
    ilsSilver,
    ilsBronze,
    topRated,
    monthlyPerformer: null,
    badgesInserted,
    skipped,
  };
}

export async function computeAndAwardMonthlyPerformer(
  monthFirstDay: string, // YYYY-MM-DD — first day of the month to award for
  orgId: number,
): Promise<{ performers: string[]; inserted: number; skipped: number }> {
  const d        = new Date(monthFirstDay + "T00:00:00");
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);

  const badgeRows = await db
    .select({ driverId: driverBadges.driverId, category: badgeTypes.category })
    .from(driverBadges)
    .innerJoin(
      badgeTypes,
      and(eq(badgeTypes.id, driverBadges.badgeTypeId), eq(badgeTypes.organizationId, orgId)),
    )
    .where(
      and(
        eq(driverBadges.organizationId, orgId),
        gte(driverBadges.weekStart, monthFirstDay),
        lte(driverBadges.weekStart, monthEnd),
        inArray(badgeTypes.category, ["weekly", "weekly_ryde"]),
      ),
    );

  const countMap = new Map<string, number>();
  for (const row of badgeRows) {
    countMap.set(row.driverId, (countMap.get(row.driverId) ?? 0) + 1);
  }

  if (countMap.size === 0) return { performers: [], inserted: 0, skipped: 0 };

  const maxCount  = Math.max(...Array.from(countMap.values()));
  const winnerIds = Array.from(countMap.entries())
    .filter(([, c]) => c === maxCount)
    .map(([id]) => id);

  const monthlyId = await ensureUnrankedBadgeType(orgId, "monthly", "Monthly Performer", true);

  let inserted = 0, skipped = 0;
  const names: string[] = [];

  for (const driverId of winnerIds) {
    const [driverRow] = await db
      .select({ name: drivers.name })
      .from(drivers)
      .where(and(eq(drivers.driverId, driverId), eq(drivers.organizationId, orgId)))
      .limit(1);
    names.push(driverRow?.name ?? driverId);
    (await insertBadge(orgId, driverId, monthlyId, monthFirstDay)) ? inserted++ : skipped++;
  }

  return { performers: names, inserted, skipped };
}

// ── Live Weekly Standings ─────────────────────────────────────────────────────

export async function getWeeklyStandings(orgId: number): Promise<WeeklyStanding[]> {
  const weekStart = getCurrentMonday();
  const today     = new Date().toISOString().slice(0, 10);
  const isoWeek   = toIsoWeek(weekStart);

  const dswRows = await db
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
        lte(dswRouteDays.date, today),
        isNotNull(dswRouteDays.driverId),
        isNotNull(dswRouteDays.ilsPct),
      ),
    );

  const ilsMap = new Map<string, { driverName: string; total: number; days: number }>();
  for (const row of dswRows) {
    if (!row.driverId) continue;
    const ils = Number(row.ilsPct);
    const prev = ilsMap.get(row.driverId);
    if (prev) { prev.total += ils; prev.days += 1; }
    else ilsMap.set(row.driverId, { driverName: row.driverName, total: ils, days: 1 });
  }

  const ilsRanked = Array.from(ilsMap.entries())
    .map(([driverId, v]) => ({ driverId, driverName: v.driverName, avgIls: v.total / v.days }))
    .sort((a, b) => a.avgIls - b.avgIls);

  const weekReviews = await db
    .select({ driverId: rydeReviews.driverId, stars: rydeReviews.stars })
    .from(rydeReviews)
    .where(
      and(
        eq(rydeReviews.organizationId, orgId),
        eq(rydeReviews.week, isoWeek),
        isNotNull(rydeReviews.stars),
      ),
    );

  const allStars = await db
    .select({ stars: rydeReviews.stars })
    .from(rydeReviews)
    .where(and(eq(rydeReviews.organizationId, orgId), isNotNull(rydeReviews.stars)));

  const globalMean =
    allStars.length > 0
      ? allStars.reduce((s, r) => s + (r.stars ?? 0), 0) / allStars.length
      : 5;

  const PRIOR = 5;
  const rydeMap = new Map<string, { sum: number; count: number }>();
  for (const r of weekReviews) {
    if (!r.driverId) continue;
    const prev = rydeMap.get(r.driverId);
    if (prev) { prev.sum += r.stars!; prev.count += 1; }
    else rydeMap.set(r.driverId, { sum: r.stars!, count: 1 });
  }

  const rydeRanked = Array.from(rydeMap.entries())
    .map(([driverId, v]) => ({
      driverId,
      bayesianAvg: (v.sum + PRIOR * globalMean) / (v.count + PRIOR),
      count: v.count,
    }))
    .sort((a, b) => b.bayesianAvg - a.bayesianAvg);

  const allDriverIds = new Set([
    ...ilsRanked.map((r) => r.driverId),
    ...rydeRanked.map((r) => r.driverId),
  ]);

  const standings: WeeklyStanding[] = [];

  for (const driverId of allDriverIds) {
    const ilsEntry  = ilsRanked.find((r) => r.driverId === driverId);
    const rydeEntry = rydeRanked.find((r) => r.driverId === driverId);
    const ilsIdx    = ilsEntry ? ilsRanked.indexOf(ilsEntry) : -1;
    const rydeIdx   = rydeEntry ? rydeRanked.indexOf(rydeEntry) : -1;

    let driverName = ilsEntry?.driverName ?? "";
    if (!driverName) {
      const [d] = await db
        .select({ name: drivers.name })
        .from(drivers)
        .where(and(eq(drivers.driverId, driverId), eq(drivers.organizationId, orgId)))
        .limit(1);
      driverName = d?.name ?? driverId;
    }

    standings.push({
      driverId,
      driverName,
      ilsRank:     ilsIdx >= 0 ? ilsIdx + 1 : null,
      avgIls:      ilsEntry ? parseFloat(ilsEntry.avgIls.toFixed(2)) : null,
      rydeRank:    rydeIdx >= 0 ? rydeIdx + 1 : null,
      bayesianAvg: rydeEntry ? parseFloat(rydeEntry.bayesianAvg.toFixed(2)) : null,
      reviewCount: rydeEntry?.count ?? 0,
    });
  }

  return standings.sort((a, b) => {
    if (a.ilsRank === null && b.ilsRank !== null) return 1;
    if (a.ilsRank !== null && b.ilsRank === null) return -1;
    if (a.ilsRank !== null && b.ilsRank !== null) return a.ilsRank - b.ilsRank;
    return 0;
  });
}

// ── Monthly Badge Counts ──────────────────────────────────────────────────────

export async function getMonthlyBadgeCounts(
  orgId: number,
  monthFirstDay?: string,
): Promise<MonthlyBadgeCount[]> {
  const today    = new Date();
  const firstDay = monthFirstDay
    ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay  = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const rows = await db
    .select({
      driverId:   driverBadges.driverId,
      driverName: drivers.name,
      category:   badgeTypes.category,
      rank:       badgeTypes.rank,
    })
    .from(driverBadges)
    .innerJoin(
      badgeTypes,
      and(eq(badgeTypes.id, driverBadges.badgeTypeId), eq(badgeTypes.organizationId, orgId)),
    )
    .innerJoin(
      drivers,
      and(eq(drivers.driverId, driverBadges.driverId), eq(drivers.organizationId, orgId)),
    )
    .where(
      and(
        eq(driverBadges.organizationId, orgId),
        gte(driverBadges.weekStart, firstDay),
        lte(driverBadges.weekStart, lastDay),
        inArray(badgeTypes.category, ["weekly", "weekly_ryde"]),
      ),
    );

  const map = new Map<
    string,
    { driverName: string; total: number; gold: number; silver: number; bronze: number }
  >();
  for (const row of rows) {
    const prev = map.get(row.driverId) ?? {
      driverName: row.driverName,
      total: 0, gold: 0, silver: 0, bronze: 0,
    };
    prev.total++;
    if (row.rank === 1) prev.gold++;
    else if (row.rank === 2) prev.silver++;
    else if (row.rank === 3) prev.bronze++;
    map.set(row.driverId, prev);
  }

  return Array.from(map.entries())
    .map(([driverId, v]) => ({
      driverId,
      driverName: v.driverName,
      badgeCount: v.total,
      gold:       v.gold,
      silver:     v.silver,
      bronze:     v.bronze,
    }))
    .sort((a, b) => b.badgeCount - a.badgeCount);
}
