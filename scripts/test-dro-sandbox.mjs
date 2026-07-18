/**
 * DRO Sandbox Test — Experiment & Document
 * ─────────────────────────────────────────
 * 1. Login to DRO
 * 2. Copy the AUTO plan → "WAYNE TEST [date]"
 * 3. Explore what APIs work on the copy vs. active plan
 * 4. Try template-based routing (workAreaNumber → route_label) against the copy
 * 5. Attempt solve on the copy
 * 6. Print DRO link, wait for Enter to confirm
 * 7. Delete the copy
 * 8. Write findings to scripts/dro-sandbox-findings.md
 *
 * Usage: node scripts/test-dro-sandbox.mjs [--no-delete]
 *   --no-delete  skip deleting the test copy so you can keep inspecting it
 */

import { readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";

const SKIP_DELETE = process.argv.includes("--no-delete");
const CHROME      = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DRO_BASE    = "https://dro.routesmart.com";
const SA_ID       = "3060743";
const STATION_ID  = "259";
const AUTO_PLAN_ID = 2352850;   // "AUTO — 13 drivers"
const AUTO_TEMPLATE_NAME = "AUTO — 13 drivers";

const env         = readFileSync(".env.local", "utf8");
const getEnv      = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const DATABASE_URL = getEnv("DATABASE_URL_POOLER") || getEnv("DATABASE_URL");
const sql         = neon(DATABASE_URL);
const username    = getEnv("DRO_USERNAME");
const password    = getEnv("DRO_PASSWORD");

const findings = [];
const log = (...args) => { console.log(...args); };
const note = (heading, detail) => {
  log(`\n📝 [FINDING] ${heading}`);
  if (detail) log("   ", JSON.stringify(detail, null, 2).split("\n").join("\n    "));
  findings.push({ heading, detail });
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function waitForEnter(prompt) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

async function apiFetch(label, url, options = {}) {
  const method = options.method || "GET";
  log(`\n→ ${method} ${url.replace(DRO_BASE, "")}`);
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    log(`  ← ${res.status} ${res.statusText}  (${text.length} bytes)`);
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    log(`  ✗ Error: ${err.message}`);
    return { ok: false, status: 0, body: null, error: err.message };
  }
}

// ── DRO Login ────────────────────────────────────────────────────────────────
async function droLogin() {
  log("Logging into DRO...");
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  page.on("dialog", async d => { try { await d.dismiss(); } catch {} });
  await page.goto(DRO_BASE, { waitUntil: "networkidle2" });
  const popupPromise = new Promise(resolve => browser.once("targetcreated", t => resolve(t.page())));
  await page.click("button::-p-text(Service Provider)");
  const popup = await popupPromise;
  await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  popup.on("dialog", async d => { try { await d.dismiss(); } catch {} });
  try { await popup.waitForSelector("button::-p-text(Block)", { timeout: 4000 }); await popup.click("button::-p-text(Block)"); } catch {}
  await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
  await popup.type('input[name="identifier"]', username);
  await popup.click('input[type="submit"]');
  await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
  await popup.type('input[type="password"]', password);
  const btn = await popup.$('input[type="submit"], button[type="submit"]');
  if (btn) await btn.click(); else await popup.keyboard.press("Enter");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));
  await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
  const stations = await page.$$('[class*="station" i]');
  if (stations.length) await stations[0].click();
  await new Promise(r => setTimeout(r, 3000));
  const cookies = await page.cookies();
  await browser.close();
  log("Logged in ✓");
  return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}

// ════════════════════════════════════════════════════════════════════════════
const cookieHeader = await droLogin();
const headers = { Cookie: cookieHeader, "Content-Type": "application/json" };
const today = new Date().toISOString().slice(0, 10);

// ── 1. Explore existing plans ────────────────────────────────────────────────
log("\n══ Phase 1: Explore existing plans ══");

const plansRes = await apiFetch("List route plans",
  `${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans`, { headers });
if (plansRes.ok && Array.isArray(plansRes.body)) {
  const plans = plansRes.body;
  note("Route plans API shape", {
    count: plans.length,
    fields: Object.keys(plans[0] ?? {}),
    sample: plans.slice(0, 3).map(p => ({ id: p.planId ?? p.id, name: p.name, isActive: p.isActive })),
  });
}

const activeRes = await apiFetch("Active route plan",
  `${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers });
if (activeRes.ok) {
  note("Active plan response shape", {
    fields: Object.keys(activeRes.body ?? {}),
    planId: activeRes.body?.planId,
    name: activeRes.body?.name,
  });
}

// ── 2. Copy AUTO plan ────────────────────────────────────────────────────────
log("\n══ Phase 2: Copy AUTO plan ══");
const testPlanName = `WAYNE TEST ${today}`;

// Try multiple possible copy endpoints
let testPlanId = null;
const copyAttempts = [
  {
    label: "POST CopyRoutePlan/{id}",
    url: `${DRO_BASE}/api/api/service-areas/${SA_ID}/CopyRoutePlan/${AUTO_PLAN_ID}`,
    body: { RoutePlanId: AUTO_PLAN_ID, NewName: testPlanName },
  },
  {
    label: "POST route-plans/copy",
    url: `${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans/copy`,
    body: { planId: AUTO_PLAN_ID, name: testPlanName },
  },
  {
    label: "POST route-plans/{id}/copy",
    url: `${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN_ID}/copy`,
    body: { name: testPlanName },
  },
];

for (const attempt of copyAttempts) {
  const res = await apiFetch(attempt.label, attempt.url, {
    method: "POST", headers,
    body: JSON.stringify(attempt.body),
  });
  note(`Copy attempt: ${attempt.label}`, { status: res.status, ok: res.ok, body: res.body });
  if (res.ok && res.body) {
    testPlanId = res.body?.planId ?? res.body?.id ?? res.body?.RoutePlanId ?? null;
    if (testPlanId) { log(`  ✓ Copied to plan ID: ${testPlanId}`); break; }
  }
}

// Verify by listing plans again to find the new one
const plansAfterCopy = await apiFetch("Plans after copy",
  `${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans`, { headers });
if (plansAfterCopy.ok && Array.isArray(plansAfterCopy.body)) {
  const found = plansAfterCopy.body.find(p =>
    (p.name ?? "").toLowerCase().includes("wayne test") ||
    (p.name ?? "").toLowerCase().includes(today)
  );
  if (found) {
    testPlanId = testPlanId ?? (found.planId ?? found.id);
    note("Test copy found in plan list", { id: testPlanId, name: found.name, isActive: found.isActive, fields: Object.keys(found) });
  } else {
    note("Test copy NOT found in plan list — copy may have failed", {
      planCount: plansAfterCopy.body.length,
      names: plansAfterCopy.body.map(p => p.name),
    });
  }
}

// ── 3. Explore copy plan — what data does it have? ───────────────────────────
if (testPlanId) {
  log(`\n══ Phase 3: Explore copy plan (id=${testPlanId}) ══`);

  const copyWp = await apiFetch("Waypoints on copy",
    `${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints?solutionType=actual&routePlanId=${testPlanId}`, { headers });
  note("Waypoints on copied plan", {
    count: Array.isArray(copyWp.body) ? copyWp.body.length : "N/A",
    status: copyWp.status,
    sampleFields: Array.isArray(copyWp.body) ? Object.keys(copyWp.body[0] ?? {}) : null,
    sample: Array.isArray(copyWp.body) ? copyWp.body.slice(0, 2) : copyWp.body,
  });

  const copyVehicles = await apiFetch("Vehicle set on copy",
    `${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans/${testPlanId}/advanced-vehicle-set-with-routes`, { headers });
  note("Vehicle set on copied plan", {
    status: copyVehicles.status,
    count: Array.isArray(copyVehicles.body?.advancedVehicleSet) ? copyVehicles.body.advancedVehicleSet.length : "N/A",
    vehicles: Array.isArray(copyVehicles.body?.advancedVehicleSet)
      ? copyVehicles.body.advancedVehicleSet.map(v => v.vehicleName)
      : null,
  });

  const copySummary = await apiFetch("Route summary on copy",
    `${DRO_BASE}/api/api/service-areas/${SA_ID}/route-summary?stationId=${STATION_ID}&solutionType=actual&routePlanId=${testPlanId}`, { headers });
  note("Route summary on copy (with routePlanId param)", {
    status: copySummary.status,
    count: Array.isArray(copySummary.body) ? copySummary.body.length : "N/A",
    sample: Array.isArray(copySummary.body) ? copySummary.body.slice(0, 2) : copySummary.body,
  });
}

// ── 4. Get sort date + load template ─────────────────────────────────────────
log("\n══ Phase 4: Load sort date + template ══");

const sdText = (await (await fetch(`${DRO_BASE}/api/api/stations/${STATION_ID}/sortDate`, { headers })).text()).trim().replace(/^"|"$/g, "");
const sortDate = /^\d{4}-\d{2}-\d{2}$/.test(sdText) ? sdText : new Date().toISOString().slice(0, 10);
log(`Sort date: ${sortDate}`);

// Load template from DB
const templateRows = await sql`
  SELECT rta.anchor_area_name, rta.work_area_number, rta.route_label, rta.route_slot
  FROM route_template_areas rta
  JOIN route_templates rt ON rt.id = rta.template_id
  WHERE rt.name = ${AUTO_TEMPLATE_NAME}
  ORDER BY rta.route_slot, rta.anchor_area_name
`;
log(`Template areas loaded: ${templateRows.length} rows`);
note("Template data from DB", {
  rowCount: templateRows.length,
  sample: templateRows.slice(0, 5),
  uniqueRoutes: [...new Set(templateRows.map(r => r.route_label))],
});

// Build workAreaNumber → route_label map
const wanToRoute = {};
for (const row of templateRows) {
  if (row.work_area_number) wanToRoute[row.work_area_number] = row.route_label;
}
log(`workAreaNumber → route map: ${Object.keys(wanToRoute).length} entries`);

// ── 5. Get live waypoints from ACTIVE plan ────────────────────────────────────
log("\n══ Phase 5: Load live waypoints ══");

const activeWpRes = await apiFetch("Waypoints from active plan",
  `${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints?solutionType=actual&routePlanId=${AUTO_PLAN_ID}`, { headers });

const waypoints = Array.isArray(activeWpRes.body) ? activeWpRes.body : [];
log(`Waypoints: ${waypoints.length}`);

// Map waypoints to routes via template
const routeBuckets = {};
let unmatched = 0;
for (const wp of waypoints) {
  const wan = wp.workAreaNumber?.trim();
  const routeLabel = wan ? wanToRoute[wan] : null;
  if (routeLabel) {
    if (!routeBuckets[routeLabel]) routeBuckets[routeLabel] = [];
    routeBuckets[routeLabel].push(wp.waypointId);
  } else {
    unmatched++;
  }
}

note("Template-based waypoint assignment", {
  totalWaypoints: waypoints.length,
  matched: waypoints.length - unmatched,
  unmatched,
  routeCounts: Object.fromEntries(
    Object.entries(routeBuckets).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, v.length])
  ),
});

// ── 6. Test transferRoute — does it accept a routePlanId? ────────────────────
if (testPlanId && Object.keys(routeBuckets).length > 0) {
  log("\n══ Phase 6: Test transferRoute on copy plan ══");

  // Try first route only to test the API
  const [testRoute, testIds] = Object.entries(routeBuckets)[0];
  log(`Testing transferRoute on: ${testRoute} (${testIds.length} stops)`);

  // Attempt 1: include routePlanId in body
  const tr1 = await apiFetch("transferRoute WITH routePlanId in body",
    `${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints/transferRoute?`, {
      method: "POST", headers,
      body: JSON.stringify({ route: testRoute, waypointIds: testIds.slice(0, 5), sort_date: sortDate, routePlanId: testPlanId }),
    });
  note("transferRoute with routePlanId in body", { status: tr1.status, ok: tr1.ok, body: tr1.body });

  // Attempt 2: include planId as query param
  const tr2 = await apiFetch("transferRoute with planId as query param",
    `${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints/transferRoute?planId=${testPlanId}`, {
      method: "POST", headers,
      body: JSON.stringify({ route: testRoute, waypointIds: testIds.slice(0, 5), sort_date: sortDate }),
    });
  note("transferRoute with planId as query param", { status: tr2.status, ok: tr2.ok, body: tr2.body });

  // Attempt 3: no planId (baseline — this moves stops in ACTIVE plan)
  // We do this AFTER copy tests to keep production clean; use only 1 stop as canary
  const tr3 = await apiFetch("transferRoute with NO planId (affects ACTIVE plan — canary 1 stop)",
    `${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints/transferRoute?`, {
      method: "POST", headers,
      body: JSON.stringify({ route: testRoute, waypointIds: testIds.slice(0, 1), sort_date: sortDate }),
    });
  note("transferRoute without planId (baseline)", { status: tr3.status, ok: tr3.ok, body: tr3.body });
}

// ── 7. Try activating the copy plan ──────────────────────────────────────────
if (testPlanId) {
  log("\n══ Phase 7: Try activating copy plan ══");

  const activateAttempts = [
    {
      label: "PATCH route-plans/{id} with isActive:true",
      url: `${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans/${testPlanId}`,
      method: "PATCH",
      body: { isActive: true },
    },
    {
      label: "POST activate-route-plan",
      url: `${DRO_BASE}/api/api/service-areas/${SA_ID}/activate-route-plan`,
      method: "POST",
      body: { planId: testPlanId },
    },
    {
      label: "PUT active-route-plan",
      url: `${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`,
      method: "PUT",
      body: { planId: testPlanId },
    },
  ];

  for (const attempt of activateAttempts) {
    const res = await apiFetch(attempt.label, attempt.url, {
      method: attempt.method, headers,
      body: JSON.stringify(attempt.body),
    });
    note(`Activate plan: ${attempt.label}`, { status: res.status, ok: res.ok, body: res.body });
    if (res.ok) { log("  ✓ Activate succeeded!"); break; }
  }

  // Check if it became active
  const checkActive = await apiFetch("Active plan after activate attempt",
    `${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers });
  note("Active plan after activate attempts", { planId: checkActive.body?.planId, name: checkActive.body?.name });
}

// ── 8. Try solve on copy ──────────────────────────────────────────────────────
if (testPlanId) {
  log("\n══ Phase 8: Try solve on copy plan ══");

  const waveRes = await fetch(`${DRO_BASE}/api/api/stations/${STATION_ID}/dispatch-settings`, { headers });
  const waveData = await waveRes.json().catch(() => ({}));
  const waveId = waveData?.waves?.[0]?.waveId ?? 84167;

  const solveAttempts = [
    {
      label: "create_solution_by_wave with test planId",
      body: { alternateSolver: false, createInformedOptimal: false, submittedByStationUser: false,
              waves: [{ waveId, routePlanId: testPlanId, wave: 1 }] },
    },
    {
      label: "create_solution_by_wave with original planId (control)",
      body: { alternateSolver: false, createInformedOptimal: false, submittedByStationUser: false,
              waves: [{ waveId, routePlanId: AUTO_PLAN_ID, wave: 1 }] },
    },
  ];

  for (const attempt of solveAttempts) {
    const res = await apiFetch(`Solve: ${attempt.label}`,
      `${DRO_BASE}/api/api/service-areas/${SA_ID}/create_solution_by_wave`, {
        method: "POST", headers, body: JSON.stringify(attempt.body),
      });
    note(`Solve attempt: ${attempt.label}`, { status: res.status, ok: res.ok, body: res.body });
    if (res.ok) break;  // stop after first success
  }
}

// ── 9. Explore other route plan APIs ─────────────────────────────────────────
if (testPlanId) {
  log("\n══ Phase 9: Explore misc plan APIs ══");

  const toExplore = [
    `${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans/${testPlanId}`,
    `${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans/${testPlanId}/routes`,
    `${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans/${testPlanId}/solution`,
    `${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans/${testPlanId}/summary`,
  ];

  for (const url of toExplore) {
    const res = await apiFetch("GET " + url.split(SA_ID)[1], url, { headers });
    note(`GET ${url.split(SA_ID)[1]}`, {
      status: res.status,
      bodyType: Array.isArray(res.body) ? `array[${res.body.length}]` : typeof res.body,
      fields: typeof res.body === "object" && res.body ? Object.keys(res.body) : null,
      sample: typeof res.body === "object" ? JSON.stringify(res.body).slice(0, 300) : res.body?.slice?.(0, 300),
    });
  }
}

// ── Pause for inspection ──────────────────────────────────────────────────────
log(`\n${"═".repeat(60)}`);
log(`Open DRO and inspect the test copy plan:`);
log(`  ${DRO_BASE}`);
if (testPlanId) log(`  Plan ID: ${testPlanId}  Name: ${testPlanName}`);
log(`${"═".repeat(60)}\n`);
await waitForEnter("Press Enter when done inspecting (will then delete test copy)... ");

// ── 10. Delete test copy ──────────────────────────────────────────────────────
if (testPlanId && !SKIP_DELETE) {
  log(`\n══ Phase 10: Delete test copy (id=${testPlanId}) ══`);

  const deleteAttempts = [
    {
      label: "DELETE route-plans/{id}",
      url: `${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans/${testPlanId}`,
      method: "DELETE",
      body: null,
    },
    {
      label: "DELETE route-plans with body",
      url: `${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans/`,
      method: "DELETE",
      body: { planId: testPlanId },
    },
  ];

  for (const attempt of deleteAttempts) {
    const options = { method: attempt.method, headers };
    if (attempt.body) options.body = JSON.stringify(attempt.body);
    const res = await apiFetch(`Delete: ${attempt.label}`, attempt.url, options);
    note(`Delete plan: ${attempt.label}`, { status: res.status, ok: res.ok, body: res.body });
    if (res.ok) { log("  ✓ Deleted."); break; }
  }

  // Verify deletion
  const plansAfterDelete = await apiFetch("Plans after delete",
    `${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans`, { headers });
  if (plansAfterDelete.ok && Array.isArray(plansAfterDelete.body)) {
    const stillExists = plansAfterDelete.body.find(p => (p.planId ?? p.id) === testPlanId);
    note("Plan still exists after delete?", { exists: !!stillExists });
  }
} else if (SKIP_DELETE) {
  log("\n⚠  --no-delete flag set — test copy NOT deleted. Remove it manually in DRO.");
}

// ── Write findings ────────────────────────────────────────────────────────────
log("\n══ Writing findings ══");

const md = [
  `# DRO Sandbox Test Findings`,
  `**Run date:** ${new Date().toISOString()}`,
  `**Sort date tested:** ${sortDate}`,
  `**Test plan name:** ${testPlanName}`,
  `**Test plan ID:** ${testPlanId ?? "failed to create"}`,
  ``,
  `---`,
  ``,
  ...findings.map(({ heading, detail }) => [
    `## ${heading}`,
    detail ? "```json\n" + JSON.stringify(detail, null, 2) + "\n```" : "",
    "",
  ].join("\n")),
].join("\n");

writeFileSync("scripts/dro-sandbox-findings.md", md, "utf8");
log("Findings written to scripts/dro-sandbox-findings.md");
log("\nDone.");
