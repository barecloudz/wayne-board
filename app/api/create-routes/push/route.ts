export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDroHeadersStrict } from "@/lib/dro-client";
import { recordTraineeWorkDays } from "@/lib/record-trainee-days";
import { getSession } from "@/lib/session";

const DRO_BASE   = "https://dro.routesmart.com";
const SA_ID      = process.env.DRO_SERVICE_AREA_ID || "3060743";
const STATION_ID = process.env.DRO_STATION_ID      || "259";

type PushRoute = {
  name: string;       // DRO work area name e.g. "742 ERKWOOD"
  stops: { waypointId: string }[];
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { routes, sortDate } = await req.json() as { routes: PushRoute[]; sortDate: string };

    if (!routes || routes.length === 0) {
      return NextResponse.json({ error: "No routes provided" }, { status: 400 });
    }

    // ── Step 1: Get session headers (cached — never runs Puppeteer) ──────────
    let headers: Record<string, string>;
    try {
      headers = await getDroHeadersStrict();
    } catch {
      return NextResponse.json({
        error: "DRO session expired. Go to Auto DRO → click Connect to DRO first, then try again.",
      }, { status: 401 });
    }

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
