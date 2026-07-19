/**
 * Netlify Background Function — manual DRO sync trigger from Wayne Board UI.
 * Returns 202 immediately. Runs fresh Puppeteer login + full DRO data fetch in background.
 * Writes result to settings(dro_last_sync_result) so the UI can poll for it.
 * Called via POST /.netlify/functions/dro-sync-background
 */

import type { BackgroundHandler } from "@netlify/functions";
import { syncDro } from "../../lib/dro-sync";
import { neon } from "@neondatabase/serverless";

export const handler: BackgroundHandler = async () => {
  console.log("[dro-sync-background] Starting DRO sync (fresh login each time)");

  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  async function writeResult(payload: object) {
    const val = JSON.stringify({ ...payload, completedAt: new Date().toISOString() });
    await sql`INSERT INTO settings (key, value) VALUES ('dro_last_sync_result', ${val})
              ON CONFLICT (key) DO UPDATE SET value = ${val}`;
  }

  try {
    const result = await syncDro();
    console.log(`[dro-sync-background] Done — routes=${result.routes} stops=${result.stops} success=${result.success}`);
    await writeResult(result);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("[dro-sync-background] Unhandled error:", msg);
    await writeResult({ success: false, error: msg, routes: 0, stops: 0, sortDate: "" });
  }
};
