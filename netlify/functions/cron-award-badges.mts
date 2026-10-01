/**
 * Netlify scheduled function — runs every Monday at 6:00 AM Eastern.
 * Awards weekly ILS + Ryde badges for the previous week for every active org.
 * Also awards Monthly Performer on the first Monday of each month (first 7 days).
 *
 * Schedule: 0 11 * * 1  (11:00 UTC = 6:00 AM Eastern, every Monday)
 */

import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import {
  computeAndAwardWeeklyBadges,
  computeAndAwardMonthlyPerformer,
  getPreviousMonday,
} from "../../lib/weekly-awards";

export const config: Config = {
  schedule: "0 11 * * 1", // 11:00 UTC = 6:00 AM Eastern, every Monday
};

export default async function handler() {
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  const orgRows = await sql`SELECT id FROM organizations ORDER BY id`;
  if (orgRows.length === 0) {
    console.log("[cron-award-badges] No organizations found — skipping");
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const weekStart = getPreviousMonday();
  const today = new Date();
  const isFirstWeekOfMonth = today.getDate() <= 7;

  // Prior month first day (for Monthly Performer)
  const priorMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const monthFirstDay = priorMonth.toISOString().slice(0, 10);

  const results = [];

  for (const org of orgRows) {
    const orgId = org.id as number;
    try {
      const weekly = await computeAndAwardWeeklyBadges(weekStart, orgId);
      console.log(
        `[cron-award-badges] org=${orgId} week=${weekStart} ` +
        `gold=${weekly.ilsGold} silver=${weekly.ilsSilver} bronze=${weekly.ilsBronze} ` +
        `topRated=${weekly.topRated} inserted=${weekly.badgesInserted} skipped=${weekly.skipped}`,
      );

      let monthly = null;
      if (isFirstWeekOfMonth) {
        monthly = await computeAndAwardMonthlyPerformer(monthFirstDay, orgId);
        console.log(
          `[cron-award-badges] org=${orgId} monthly performers=${monthly.performers.join(", ")} ` +
          `inserted=${monthly.inserted}`,
        );
      }

      results.push({ orgId, weekly, monthly });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron-award-badges] org=${orgId} error: ${msg}`);
      results.push({ orgId, error: msg });
    }
  }

  return new Response(JSON.stringify({ weekStart, results }), { status: 200 });
}
