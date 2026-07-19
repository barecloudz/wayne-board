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

export const handler: BackgroundHandler = async () => {
  console.log("[dro-login-background] Starting DRO Puppeteer login");

  try {
    await getDroHeaders();
    console.log("[dro-login-background] DRO session established successfully");
  } catch (err: any) {
    console.error("[dro-login-background] Login failed:", err?.message ?? String(err));
  }
};
