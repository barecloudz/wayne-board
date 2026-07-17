export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { db } from "@/lib/db";
import { settings } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { recordTraineeWorkDays } from "@/lib/record-trainee-days";

const CHROMIUM_PACK = "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";
const DRO_BASE      = "https://dro.routesmart.com";
const SA_ID         = process.env.DRO_SERVICE_AREA_ID || "3060743";
const STATION_ID    = process.env.DRO_STATION_ID      || "259";

type PushRoute = {
  name: string;       // DRO work area name e.g. "742 ERKWOOD"
  stops: { waypointId: string }[];
};

async function getDroSession(): Promise<string> {
  const credsRows = await db.select().from(settings)
    .where(eq(settings.key, "dro_username"))
    .then(async (r) => {
      const pw = await db.select().from(settings).where(eq(settings.key, "dro_password"));
      return { username: r[0]?.value, password: pw[0]?.value };
    });

  const { username, password } = credsRows;
  if (!username || !password) throw new Error("DRO credentials not set in settings");

  const isDev = process.env.NODE_ENV === "development";
  const browser = await puppeteer.launch({
    executablePath: isDev
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : await chromium.executablePath(CHROMIUM_PACK),
    headless: true,
    args: isDev ? ["--no-sandbox", "--disable-setuid-sandbox"] : [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    page.on("dialog", async (d) => { try { await d.dismiss(); } catch {} });
    await page.goto(DRO_BASE, { waitUntil: "networkidle2" });

    const popupPromise = new Promise<any>(resolve =>
      browser.once("targetcreated", (t: any) => resolve(t.page()))
    );
    await page.click('button::-p-text(Service Provider)');
    const popup = await popupPromise;
    await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
    popup.on("dialog", async (d: any) => { try { await d.dismiss(); } catch {} });

    try {
      await popup.waitForSelector('button::-p-text(Block)', { timeout: 4000 });
      await popup.click('button::-p-text(Block)');
    } catch {}

    await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
    await popup.type('input[name="identifier"]', username);
    await popup.click('input[type="submit"]');
    await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
    await popup.type('input[type="password"]', password);
    const pwSubmit = await popup.$('input[type="submit"], button[type="submit"]');
    if (pwSubmit) await pwSubmit.click();
    else await popup.keyboard.press("Enter");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    // Select station
    await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
    const stations = await page.$$('[class*="station" i]');
    if (stations.length > 0) await stations[0].click();
    await new Promise(r => setTimeout(r, 3000));

    const cookies = await page.cookies();
    return cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
  } finally {
    await browser.close();
  }
}

export async function POST(req: NextRequest) {
  try {
    const { routes, sortDate } = await req.json() as { routes: PushRoute[]; sortDate: string };

    if (!routes || routes.length === 0) {
      return NextResponse.json({ error: "No routes provided" }, { status: 400 });
    }

    // ── Step 1: Login and get session cookies ────────────────────────────────
    let cookieHeader: string;
    try {
      cookieHeader = await getDroSession();
    } catch (e: any) {
      return NextResponse.json({ error: `DRO login failed: ${e?.message}` }, { status: 500 });
    }

    const headers = {
      Cookie:         cookieHeader,
      "Content-Type": "application/json",
    };

    // ── Step 2: Get active route plan ────────────────────────────────────────
    const planRes  = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers });
    const plan     = await planRes.json() as any;
    const routePlanId = plan.planId as number;

    if (!routePlanId) {
      return NextResponse.json({ error: "Could not get active route plan from DRO" }, { status: 500 });
    }

    // ── Step 3: Transfer each route's stops ──────────────────────────────────
    const transferResults: { route: string; stops: number; ok: boolean; msg: string }[] = [];

    for (const route of routes) {
      if (route.stops.length === 0) continue;

      const waypointIds = route.stops.map(s => s.waypointId);

      const res = await fetch(
        `${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints/transferRoute?`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            route:       route.name,
            waypointIds,
            sort_date:   sortDate,
          }),
        }
      );

      const body = await res.json().catch(() => ({})) as any;
      transferResults.push({
        route:  route.name,
        stops:  waypointIds.length,
        ok:     res.ok,
        msg:    body?.message ?? "",
      });
    }

    const failedTransfers = transferResults.filter(r => !r.ok);
    if (failedTransfers.length > 0) {
      return NextResponse.json({
        error:   `${failedTransfers.length} route transfers failed`,
        details: transferResults,
      }, { status: 500 });
    }

    // ── Step 4: Get wave ID and trigger solve ────────────────────────────────
    const waveRes = await fetch(
      `${DRO_BASE}/api/api/stations/${STATION_ID}/dispatch-settings`,
      { headers }
    );
    const waveData = await waveRes.json() as any;
    const waveId   = waveData?.waves?.[0]?.waveId ?? 84167; // fallback to known wave

    const solveRes = await fetch(
      `${DRO_BASE}/api/api/service-areas/${SA_ID}/create_solution_by_wave`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          alternateSolver:          false,
          createInformedOptimal:    false,
          submittedByStationUser:   false,
          waves: [{ waveId, routePlanId, wave: 1 }],
        }),
      }
    );

    const solveBody = await solveRes.json().catch(() => ({})) as any;

    if (!solveRes.ok) {
      return NextResponse.json({
        error:    `DRO solve trigger failed: ${JSON.stringify(solveBody)}`,
        transfers: transferResults,
      }, { status: 500 });
    }

    // Record trainee work days for today (fire-and-forget — non-fatal)
    const traineeDate = sortDate ?? new Date().toISOString().slice(0, 10);
    const traineeCount = await recordTraineeWorkDays(traineeDate).catch(() => 0);

    return NextResponse.json({
      success:       true,
      jobId:         solveBody.id,
      sortDate:      solveBody.sortDate,
      routePlanId,
      transferCount: transferResults.length,
      transfers:     transferResults,
      traineeDaysRecorded: traineeCount,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
