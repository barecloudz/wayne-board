export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST /api/auto-dro/connect
 * Runs the Puppeteer/Okta login once and caches session cookies for 23 hours.
 * After this, /api/auto-dro/sync skips the browser and is fast.
 */

import { NextResponse } from "next/server";
import { getDroHeaders } from "@/lib/dro-client";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // getDroHeaders() will run Puppeteer login if no valid session exists,
    // then cache the cookies in the DB. Subsequent calls skip the browser.
    await getDroHeaders();
    return NextResponse.json({ success: true, message: "DRO session established" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
