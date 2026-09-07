/**
 * Netlify scheduled function — runs nightly at 6 AM Eastern (after routes complete).
 * Scrapes Daily Service Worksheet from MyBizAccount for yesterday's driver metrics.
 *
 * Schedule: 0 10 * * *  (10:00 UTC = 6:00 AM Eastern)
 *
 * This must run as a cron — the full Puppeteer login + scrape takes 2-3 minutes,
 * which exceeds Netlify's 26-second limit for on-demand functions.
 */

import type { Config } from "@netlify/functions";
import { syncDsw } from "../../lib/dsw-sync";
import { neon } from "@neondatabase/serverless";

export const config: Config = {
  schedule: "0 10 * * *", // 10:00 UTC = 6:00 AM Eastern daily
};

export default async function handler() {
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  // Resolve org (cron has no session — use first org)
  const orgRows = await sql`SELECT id FROM organizations LIMIT 1`;
  const orgId = orgRows[0]?.id as number | undefined;
  if (!orgId) {
    console.log("[cron-sync-dsw] No organization found — skipping");
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  // Respect the auto-sync toggle set in the UI
  const enabledRows = await sql`SELECT value FROM settings WHERE organization_id = ${orgId} AND key = 'dsw_auto_sync_enabled'`;
  const enabled = (enabledRows[0]?.value as string) === "true";
  if (!enabled) {
    console.log("[cron-sync-dsw] Auto-sync disabled — skipping");
    return new Response(JSON.stringify({ skipped: true, reason: "disabled" }), { status: 200 });
  }

  console.log("[cron-sync-dsw] Starting DSW sync for yesterday");

  async function writeResult(payload: object) {
    const val = JSON.stringify({ ...payload, completedAt: new Date().toISOString() });
    await sql`INSERT INTO settings (organization_id, key, value) VALUES (${orgId}, 'dsw_last_sync_result', ${val})
              ON CONFLICT (organization_id, key) DO UPDATE SET value = ${val}`;
  }

  try {
    const result = await syncDsw(undefined, orgId);
    console.log(`[cron-sync-dsw] Done — ${result.rows} rows, ${result.matched} matched drivers, date=${result.date}`);
    await writeResult(result);
    return new Response(JSON.stringify(result), { status: result.success ? 200 : 500 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron-sync-dsw] Unhandled error:", msg);
    await writeResult({ success: false, error: msg, rows: 0, matched: 0, date: "" });
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500 });
  }
}
