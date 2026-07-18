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

export const config: Config = {
  schedule: "0 10 * * *",
};

export default async function handler() {
  console.log("[cron-sync-dsw] Starting DSW sync for yesterday");

  try {
    const result = await syncDsw();
    console.log(`[cron-sync-dsw] Done — ${result.rows} rows, ${result.matched} matched drivers, date=${result.date}`);

    return new Response(
      JSON.stringify(result),
      { status: result.success ? 200 : 500 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron-sync-dsw] Unhandled error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500 }
    );
  }
}
