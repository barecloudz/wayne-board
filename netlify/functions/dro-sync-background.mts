/**
 * Netlify Background Function — manual DRO sync trigger from Wayne Board UI.
 * Returns 202 immediately. Runs fresh Puppeteer login + full DRO data fetch in background.
 * Called via POST /.netlify/functions/dro-sync-background
 */

import type { BackgroundHandler } from "@netlify/functions";
import { syncDro } from "../../lib/dro-sync";

export const handler: BackgroundHandler = async () => {
  console.log("[dro-sync-background] Starting DRO sync (fresh login each time)");

  try {
    const result = await syncDro();
    console.log(`[dro-sync-background] Done — routes=${result.routes} stops=${result.stops} success=${result.success}`);
    if (!result.success) console.error("[dro-sync-background] Sync failed:", result.error);
  } catch (err: any) {
    console.error("[dro-sync-background] Unhandled error:", err?.message ?? String(err));
  }
};
