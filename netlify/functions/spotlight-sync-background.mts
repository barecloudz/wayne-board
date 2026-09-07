/**
 * Netlify Background Function — manual Spotlight RYDE sync.
 * Returns 202 immediately. Runs full Puppeteer login → MFA → Power BI query in background.
 * Polls settings.spotlight_otp (written by Resend inbound webhook) for the EMAIL OTP.
 * Writes result to settings.spotlight_last_sync_result so UI can poll for it.
 *
 * Called via POST /.netlify/functions/spotlight-sync-background
 */

import type { BackgroundHandler } from "@netlify/functions";
import { syncSpotlight } from "../../lib/spotlight-sync";
import { neon } from "@neondatabase/serverless";

export const handler: BackgroundHandler = async () => {
  console.log("[spotlight-sync-background] Starting Spotlight RYDE sync...");

  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  async function writeResult(payload: object) {
    const val = JSON.stringify({ ...payload, completedAt: new Date().toISOString() });
    const orgRows = await sql`SELECT organization_id FROM settings WHERE key = 'spotlight_username' LIMIT 1`;
    const orgId = (orgRows[0]?.organization_id as number) ?? 1;
    await sql`
      INSERT INTO settings (organization_id, key, value) VALUES (${orgId}, 'spotlight_last_sync_result', ${val})
      ON CONFLICT (organization_id, key) DO UPDATE SET value = ${val}
    `;
    await sql`
      INSERT INTO settings (organization_id, key, value) VALUES (${orgId}, 'spotlight_sync_status', 'idle')
      ON CONFLICT (organization_id, key) DO UPDATE SET value = 'idle'
    `;
  }

  try {
    const result = await syncSpotlight();
    console.log(`[spotlight-sync-background] Done — drivers=${result.drivers} weeks=${result.weeks} reviews=${result.reviews}`);
    await writeResult(result);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("[spotlight-sync-background] Error:", msg);
    await writeResult({ success: false, error: msg });
  }
};
