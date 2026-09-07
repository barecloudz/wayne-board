/**
 * Netlify Background Function — manual DSW sync trigger from Wayne Board UI.
 * Returns 202 immediately, runs Puppeteer scrape in background (up to 15 min).
 * Writes result to settings(dsw_last_sync_result) so the UI can poll for it.
 * Called via POST /.netlify/functions/dsw-sync-background
 */

import type { BackgroundHandler } from "@netlify/functions";
import { syncDsw } from "../../lib/dsw-sync";
import { neon } from "@neondatabase/serverless";

export const handler: BackgroundHandler = async (event) => {
  let date: string | undefined;
  let orgId: number | undefined;
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    date = body.date;
    orgId = body.orgId ? Number(body.orgId) : undefined;
  } catch {}

  console.log(`[dsw-sync-background] Starting DSW sync${date ? ` for ${date}` : " for yesterday"} org=${orgId ?? "LIMIT1"}`);

  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  // Resolve org for result writing (mirrors syncDsw fallback when orgId not passed)
  let resolvedOrgId = orgId;
  if (!resolvedOrgId) {
    const orgRows = await sql`SELECT id FROM organizations LIMIT 1`;
    resolvedOrgId = (orgRows[0]?.id as number) ?? 1;
  }

  async function writeResult(payload: object) {
    const val = JSON.stringify({ ...payload, completedAt: new Date().toISOString() });
    await sql`INSERT INTO settings (organization_id, key, value) VALUES (${resolvedOrgId}, 'dsw_last_sync_result', ${val})
              ON CONFLICT (organization_id, key) DO UPDATE SET value = ${val}`;
  }

  try {
    const result = await syncDsw(date, orgId);
    console.log(`[dsw-sync-background] Done — rows=${result.rows} matched=${result.matched} success=${result.success}`);
    await writeResult(result);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("[dsw-sync-background] Unhandled error:", msg);
    await writeResult({ success: false, error: msg, rows: 0, matched: 0, date: "" });
  }
};
