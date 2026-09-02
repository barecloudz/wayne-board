/**
 * Netlify Background Function — DRO Puppeteer login from Wayne Board UI.
 * Returns 202 immediately, runs Puppeteer login in background (up to 15 min).
 * Called via POST /.netlify/functions/dro-login-background
 *
 * After completion, the session cookie is stored in the settings table.
 * The UI should poll /api/auto-dro/status to detect when the session is ready.
 */

import type { BackgroundHandler } from "@netlify/functions";
import { getDroHeaders } from "../../lib/dro-client";
import { neon } from "@neondatabase/serverless";

export const handler: BackgroundHandler = async () => {
  console.log("[dro-login-background] Starting DRO Puppeteer login");
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  async function writeStatus(payload: object) {
    const val = JSON.stringify({ ...payload, completedAt: new Date().toISOString() });
    await sql`INSERT INTO settings (key, value) VALUES ('dro_login_result', ${val})
              ON CONFLICT (key) DO UPDATE SET value = ${val}`;
  }

  try {
    await getDroHeaders();
    console.log("[dro-login-background] DRO session established successfully");
    await writeStatus({ success: true });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("[dro-login-background] Login failed:", msg);
    await writeStatus({ success: false, error: msg });
  }
};
