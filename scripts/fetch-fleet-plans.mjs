import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";

const DRO_BASE = "https://dro.routesmart.com";
const CHROME   = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SA_ID    = "3060743";
const WAIT     = ms => new Promise(r => setTimeout(r, ms));

const env      = readFileSync(".env.local", "utf8");
const getEnv   = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const username = getEnv("DRO_USERNAME");
const password = getEnv("DRO_PASSWORD");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page    = await browser.newPage();
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
await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 }).catch(() => {});
await WAIT(3000);
(await page.$$('[class*="station" i]'))[0]?.click();
await WAIT(3000);
console.log("✓ Logged in");

const cookies = await page.cookies();
const h = { Cookie: cookies.map(c => `${c.name}=${c.value}`).join("; "), "Content-Type": "application/json" };

async function get(path) {
  const res = await fetch(DRO_BASE + path, { headers: h });
  try { return { status: res.status, data: await res.json() }; }
  catch { return { status: res.status, data: null }; }
}

async function put(path, body) {
  const res = await fetch(DRO_BASE + path, { method: "PUT", headers: h, body: JSON.stringify(body) });
  try { return { status: res.status, data: await res.json() }; }
  catch { return { status: res.status, data: null }; }
}

async function post(path, body) {
  const res = await fetch(DRO_BASE + path, { method: "POST", headers: h, body: JSON.stringify(body) });
  try { return { status: res.status, data: await res.json() }; }
  catch { return { status: res.status, data: null }; }
}

// ── All route plans ───────────────────────────────────────────────────────────
const plans = await get(`/api/api/service-areas/${SA_ID}/route-plans`);
console.log("\n=== All Route Plans ===");
plans.data?.forEach(p => console.log(`  planId:${p.planId}  name:"${p.name}"  routes:${p.totalRoutes}  active?:${p.isActive ?? "?"}`));

const activePlan = await get(`/api/api/service-areas/${SA_ID}/active-route-plan`);
const activePlanId = activePlan.data?.planId;
console.log(`\nActive plan: "${activePlan.data?.name}" (${activePlanId})`);

// Find AUTO plan
const autoPlan = plans.data?.find(p => p.name?.toLowerCase().includes("auto"));
console.log(`AUTO plan: "${autoPlan?.name}" (${autoPlan?.planId})`);

// ── Fleet (all vehicles) ──────────────────────────────────────────────────────
const fleet = await get(`/api/api/service-areas/${SA_ID}/fleet`);
console.log(`\n=== Fleet (${fleet.data?.length} vehicles) ===`);
fleet.data?.slice(0, 5).forEach(v => console.log("  ", JSON.stringify(v)));
if (fleet.data?.length > 5) console.log(`  ... and ${fleet.data.length - 5} more`);

// ── Advanced vehicle set for ACTIVE plan ──────────────────────────────────────
const avs = await get(`/api/api/service-areas/${SA_ID}/route-plans/${activePlanId}/advanced-vehicle-set-with-routes`);
console.log(`\n=== Advanced Vehicle Set for Blake 13 (${activePlanId}) ===`);
console.log("  top-level keys:", Object.keys(avs.data ?? {}));
if (avs.data?.advancedVehicleSet) {
  console.log("  advancedVehicleSet keys:", Object.keys(avs.data.advancedVehicleSet));
  console.log("  full advancedVehicleSet:", JSON.stringify(avs.data.advancedVehicleSet).slice(0, 1000));
}
if (avs.data?.routeTypes) {
  console.log("  routeTypes:", JSON.stringify(avs.data.routeTypes).slice(0, 500));
}

// ── Advanced vehicle set for AUTO plan ───────────────────────────────────────
if (autoPlan) {
  const avsAuto = await get(`/api/api/service-areas/${SA_ID}/route-plans/${autoPlan.planId}/advanced-vehicle-set-with-routes`);
  console.log(`\n=== Advanced Vehicle Set for AUTO (${autoPlan.planId}) ===`);
  console.log("  full:", JSON.stringify(avsAuto.data).slice(0, 1000));

  // ── Route plan detail for AUTO ─────────────────────────────────────────────
  const autoDetail = await get(`/api/api/service-areas/${SA_ID}/route-plans/${autoPlan.planId}`);
  console.log(`\n=== AUTO plan detail ===`);
  console.log("  ", JSON.stringify(autoDetail.data).slice(0, 500));

  // ── Routes inside AUTO ─────────────────────────────────────────────────────
  const autoRoutes = await get(`/api/api/service-areas/${SA_ID}/routes?solutionType=actual&routePlanId=${autoPlan.planId}`);
  console.log(`\n=== Routes in AUTO plan (${autoRoutes.data?.length}) ===`);
  autoRoutes.data?.forEach(r => console.log(`  workArea:"${r.workAreaName}" num:${r.workAreaNumber} type:${r.routeType}`));

  // ── Anchor areas for AUTO ──────────────────────────────────────────────────
  const autoAnchors = await get(`/api/api/service-areas/${SA_ID}/route-plans/${autoPlan.planId}/anchor-area-temp?`);
  console.log(`\n=== Anchor areas for AUTO ===`);
  console.log("  status:", autoAnchors.status, JSON.stringify(autoAnchors.data).slice(0, 300));
}

// ── Probe: how to set active plan ─────────────────────────────────────────────
console.log("\n=== Probing set-active-plan endpoints ===");
if (autoPlan) {
  const attempts = [
    { m: "PUT",  p: `/api/api/service-areas/${SA_ID}/route-plans/${autoPlan.planId}/activate` },
    { m: "POST", p: `/api/api/service-areas/${SA_ID}/route-plans/${autoPlan.planId}/activate` },
    { m: "PUT",  p: `/api/api/service-areas/${SA_ID}/active-route-plan`, b: { planId: autoPlan.planId } },
    { m: "POST", p: `/api/api/service-areas/${SA_ID}/active-route-plan`, b: { planId: autoPlan.planId } },
    { m: "PUT",  p: `/api/api/service-areas/${SA_ID}/route-plans/${autoPlan.planId}`, b: { isActive: true } },
  ];
  for (const a of attempts) {
    const res = await fetch(DRO_BASE + a.p, { method: a.m, headers: h, body: a.b ? JSON.stringify(a.b) : undefined });
    const body = await res.text().catch(() => "");
    console.log(`  ${a.m} ${a.p.split("/").slice(-2).join("/")} → ${res.status} ${body.slice(0, 100)}`);
  }
}

// ── Probe: how to remove a route/vehicle from a plan ─────────────────────────
console.log("\n=== Probing remove-vehicle-from-plan endpoints ===");
if (activePlanId) {
  const sampleRoute = (await get(`/api/api/service-areas/${SA_ID}/routes?solutionType=actual&routePlanId=${activePlanId}`)).data?.[0];
  if (sampleRoute) {
    console.log("  Sample route:", JSON.stringify(sampleRoute).slice(0, 200));
    const workAreaNum = sampleRoute.workAreaNumber;
    const attempts = [
      { m: "DELETE", p: `/api/api/service-areas/${SA_ID}/route-plans/${activePlanId}/routes/${workAreaNum}` },
      { m: "DELETE", p: `/api/api/service-areas/${SA_ID}/routes/${workAreaNum}?routePlanId=${activePlanId}` },
      { m: "PUT",    p: `/api/api/service-areas/${SA_ID}/route-plans/${activePlanId}/routes/${workAreaNum}`, b: { enabled: false } },
      { m: "GET",    p: `/api/api/service-areas/${SA_ID}/route-plans/${activePlanId}/routes` },
      { m: "GET",    p: `/api/api/service-areas/${SA_ID}/route-plans/${activePlanId}/vehicles` },
    ];
    for (const a of attempts) {
      const res = await fetch(DRO_BASE + a.p, { method: a.m, headers: h, body: a.b ? JSON.stringify(a.b) : undefined });
      const body = await res.text().catch(() => "");
      if (res.status !== 404) console.log(`  ✓ ${a.m} ...${a.p.split("/").slice(-3).join("/")} → ${res.status} ${body.slice(0, 150)}`);
      else console.log(`    ${a.m} ...${a.p.split("/").slice(-3).join("/")} → 404`);
    }
  }
}

// ── Historical with selectedDate ──────────────────────────────────────────────
console.log("\n=== Historical summary ===");
const hist = await get(`/api/api/service-areas/${SA_ID}/historical-summary?selectedDate=2026-07-16`);
console.log("  status:", hist.status);
if (hist.data) {
  console.log("  top keys:", Object.keys(hist.data));
  if (hist.data.daySummary) console.log("  daySummary:", JSON.stringify(hist.data.daySummary).slice(0, 300));
  if (hist.data.workAreaSummaries) console.log("  workAreaSummaries[0]:", JSON.stringify(hist.data.workAreaSummaries?.[0]).slice(0, 300));
}

writeFileSync("scripts/dro-fleet-plans.json", JSON.stringify({ plans: plans.data, fleet: fleet.data, avs: avs.data }, null, 2));
console.log("\n✓ Saved → scripts/dro-fleet-plans.json");
await browser.close();
