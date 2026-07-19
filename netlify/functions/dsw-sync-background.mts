/**
 * Netlify Background Function — manual DSW sync trigger from Wayne Board UI.
 * Returns 202 immediately, runs Puppeteer scrape in background (up to 15 min).
 * Called via POST /.netlify/functions/dsw-sync-background
 */

import type { BackgroundHandler } from "@netlify/functions";
import { syncDsw } from "../../lib/dsw-sync";

export const handler: BackgroundHandler = async (event) => {
  let date: string | undefined;
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    date = body.date;
  } catch {}

  console.log(`[dsw-sync-background] Starting DSW sync${date ? ` for ${date}` : " for yesterday"}`);

  try {
    const result = await syncDsw(date);
    console.log(`[dsw-sync-background] Done — ${result.rows} rows, ${result.matched} matched, date=${result.date}, success=${result.success}`);
    if (!result.success) console.error("[dsw-sync-background] Sync failed:", result.error);
  } catch (err: any) {
    console.error("[dsw-sync-background] Unhandled error:", err?.message ?? String(err));
  }
};
