/**
 * Pulls GroundCloud historical delivery timestamps for route 326,
 * maps each stop to its current anchor area, and reports the driver's
 * *actual* delivery sequence (by time) vs. the current 0326-01…15 numbering.
 *
 * If the sequences diverge, prints a rename plan so the numbers match
 * the real delivery order.
 *
 * Usage:
 *   node scripts/analyze-326-delivery-times.mjs [--days 30]
 */

import fs from "fs";
import https from "https";
import puppeteer from "puppeteer";
import { neon } from "@neondatabase/serverless";

// ── Load env ──────────────────────────────────────────────────────────────────
const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
}

const GC_BASE     = "https://www.groundcloud.io";
const CUSTOMER_ID = 439;
const DRO_BASE    = "https://dro.routesmart.com";
const SA_ID       = "3060743";

const daysArg = process.argv.find(a => a.startsWith("--days=") || a === "--days");
const DAYS_BACK = daysArg
  ? parseInt(daysArg.includes("=") ? daysArg.split("=")[1] : process.argv[process.argv.indexOf("--days") + 1])
  : 30;

// ── Helpers ───────────────────────────────────────────────────────────────────
function merc2ll(x, y) {
  const lng = (x / 20037508.34) * 180;
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
  return [lat, lng];
}

function pip(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}

// Minutes since midnight Eastern from a UTC ISO string
function toEasternMinutes(isoStr) {
  const dt = new Date(isoStr);
  // EDT = UTC-4, EST = UTC-5. July is always EDT.
  const easternMs = dt.getTime() - 4 * 60 * 60 * 1000;
  const d = new Date(easternMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function fmtTime(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${String(h12).padStart(2, " ")}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── Login via Puppeteer (same as gc-stops.mjs) ───────────────────────────────
async function login() {
  const username = process.env.GC_USERNAME || "Blake742Logistics";
  const password = process.env.GC_PASSWORD || "dowell2026";

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page    = await browser.newPage();
  await page.goto("https://www.groundcloud.io/dashboard/login/", { waitUntil: "networkidle2" });

  const uInput = await page.$('input[name="auth-username"]') || await page.$('input[type="text"]');
  const pInput = await page.$('input[name="auth-password"]') || await page.$('input[type="password"]');
  if (uInput) await uInput.type(username, { delay: 30 });
  if (pInput) await pInput.type(password, { delay: 30 });
  await page.evaluate(() => { document.querySelector("form")?.submit(); });
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});

  const cookies = await page.cookies();
  await browser.close();

  const sid  = cookies.find(c => c.name === "sessionid");
  const csrf = cookies.find(c => c.name === "csrftoken");
  if (!sid) throw new Error("Login failed — no sessionid cookie");

  console.log("✓ Logged in to GroundCloud");
  return `sessionid=${sid.value}; csrftoken=${csrf?.value || ""}`;
}

// ── API GET via Node https (requires X-Requested-With for Django REST) ────────
function apiGet(cookieHdr, path) {
  return new Promise((resolve, reject) => {
    const opts = {
      host: "www.groundcloud.io",
      path,
      headers: { Cookie: cookieHdr, "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
    };
    https.get(opts, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ ok: false, status: res.statusCode, data: null, raw: data.slice(0, 300) }); }
      });
    }).on("error", reject);
  });
}

// ── Fetch all pages ───────────────────────────────────────────────────────────
async function fetchAll(cookieHdr, path) {
  const items = [];
  let next = path;
  while (next) {
    const { ok, data } = await apiGet(cookieHdr, next);
    if (!ok || !data) break;
    const page = Array.isArray(data) ? data : (data.results || []);
    items.push(...page);
    next = data.next ? new URL(data.next).pathname + new URL(data.next).search : null;
  }
  return items;
}

// ── Main ───────────────────────────────────────────────────────────────────────
const cookieHdr = await login();

// Find route 326
console.log("Fetching route list...");
const allRoutes = await fetchAll(cookieHdr, `/api/routes/?customer=${CUSTOMER_ID}&archived=false`);
const r326      = allRoutes.find(r => r.name === "326");
if (!r326) {
  console.error("Route 326 not found. Sample names:", allRoutes.slice(0, 20).map(r => r.name).join(", "));
  process.exit(1);
}
console.log(`✓ Route 326 = GC id ${r326.id}`);

// Collect all delivered stops across DAYS_BACK days
const allStops = [];
let   daysWithData = 0;
const today = new Date();

console.log(`\nFetching ${DAYS_BACK} days of route-day data...\n`);

for (let i = 1; i <= DAYS_BACK; i++) {
  const d   = new Date(today);
  d.setDate(d.getDate() - i);
  const day = d.toISOString().slice(0, 10);

  const rds = await fetchAll(cookieHdr, `/api/route-days/?customer=${CUSTOMER_ID}&day=${day}&route=${r326.id}`);

  for (const rd of rds) {
    if (rd.status !== "COMPLETE" && rd.status !== "STARTED") continue;

    const { ok, data: detail } = await apiGet(cookieHdr, `/api/route-days/${rd.id}/`);
    if (!ok || !detail) continue;

    const delivered = (detail.stops || []).filter(s => s.delivered && s.lat && s.lon);
    if (delivered.length === 0) continue;

    allStops.push(...delivered.map(s => ({ ...s, date: day })));
    console.log(`  ${day}: ${delivered.length} stops delivered`);
    daysWithData++;
  }
}

console.log(`\nTotal: ${allStops.length} stops across ${daysWithData} route days`);

if (allStops.length === 0) {
  console.log("No historical data found for route 326 in the last", DAYS_BACK, "days.");
  process.exit(0);
}

// Load anchor areas from DRO
const sql     = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);
const [row]   = await sql`SELECT value FROM settings WHERE key = 'dro_session_cookies' LIMIT 1`;
if (!row?.value) { console.error("No DRO session — run scripts/refresh-dro-session.mjs"); process.exit(1); }
const droHdrs = { Cookie: row.value, "Content-Type": "application/json" };

console.log("\nFetching anchor areas from DRO...");
const areasRaw = await (await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area`, { headers: droHdrs })).json();
const areas326 = areasRaw
  .filter(a => a.name?.startsWith("0326-"))
  .map(a => {
    const shape   = typeof a.shape === "string" ? JSON.parse(a.shape) : (a.shape ?? {});
    const rings3857 = shape?.rings ?? [];
    const ring    = (rings3857[0] || []).map(([x, y]) => merc2ll(x, y));
    return { id: a.anchorAreaId, name: a.name, ring };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

console.log(`✓ ${areas326.length} anchor areas starting with "0326-"`);

// Map each stop → anchor area
const buckets = Object.fromEntries(areas326.map(a => [a.name, []]));
let unassigned = 0;

for (const stop of allStops) {
  let hit = false;
  for (const area of areas326) {
    if (area.ring.length >= 3 && pip(stop.lat, stop.lon, area.ring)) {
      buckets[area.name].push(stop);
      hit = true;
      break;
    }
  }
  if (!hit) unassigned++;
}

// Calculate average delivery time per area
const stats = areas326.map(area => {
  const stops   = buckets[area.name];
  const timed   = stops.filter(s => s.delivered);
  if (timed.length === 0) return { ...area, avgMins: null, count: 0, sampleDays: 0 };

  const avgMins   = timed.reduce((s, x) => s + toEasternMinutes(x.delivered), 0) / timed.length;
  const sampleDays = new Set(timed.map(s => s.date)).size;
  return { ...area, avgMins, count: timed.length, sampleDays };
});

const withData = stats.filter(s => s.avgMins !== null).sort((a, b) => a.avgMins - b.avgMins);
const noData   = stats.filter(s => s.avgMins === null);

// ── Print report ──────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(72));
console.log("  ROUTE 326 — ACTUAL DELIVERY SEQUENCE (from GroundCloud timestamps)");
console.log("═".repeat(72));
console.log(`  ${allStops.length} stops · ${daysWithData} route days · last ${DAYS_BACK} days\n`);

console.log("  Act#  Current Name                    Avg ET Time  Stops  Days  Status");
console.log("  " + "─".repeat(69));

let needsResequence = false;
withData.forEach((a, i) => {
  const currentNum = parseInt(a.name.split("-")[1]);
  const actualNum  = i + 1;
  const ok         = currentNum === actualNum;
  if (!ok) needsResequence = true;
  const flag = ok ? "  ✓" : `  ← was ${String(currentNum).padStart(2, "0")}`;
  console.log(
    `  ${String(actualNum).padStart(2, "0")}    ${a.name.padEnd(32)} ${fmtTime(a.avgMins)}    ${String(a.count).padStart(4)}   ${String(a.sampleDays).padStart(2)}${flag}`
  );
});

if (noData.length > 0) {
  console.log("\n  Areas with NO historical stops mapped:");
  noData.forEach(a => console.log(`    ${a.name}`));
}
if (unassigned > 0) {
  console.log(`\n  ${unassigned} stops did not fall inside any 0326-xx area`);
}

// ── Resequence plan ───────────────────────────────────────────────────────────
if (needsResequence) {
  console.log("\n" + "═".repeat(72));
  console.log("  RENAME PLAN (to match actual delivery order)");
  console.log("═".repeat(72));
  console.log("  Old Name                          → New Name");
  console.log("  " + "─".repeat(60));

  const renames = [];
  withData.forEach((a, i) => {
    const currentNum = parseInt(a.name.split("-")[1]);
    const actualNum  = i + 1;
    if (currentNum !== actualNum) {
      const landmark = a.name.split("-").slice(2).join("-");
      const newName  = `0326-${String(actualNum).padStart(2, "0")}-${landmark}`;
      console.log(`  ${a.name.padEnd(33)} → ${newName}`);
      renames.push({ id: a.id, oldName: a.name, newName });
    }
  });

  fs.writeFileSync("./scripts/326-rename-plan.json", JSON.stringify(renames, null, 2));
  console.log("\n  Saved → scripts/326-rename-plan.json");
  console.log("  Run scripts/apply-326-renames.mjs to push renames to DRO.");
} else {
  console.log("\n  ✓ Current sequencing already matches actual delivery order.");
}

// Save full analysis
const output = {
  generated: new Date().toISOString(),
  daysBack: DAYS_BACK,
  daysWithData,
  totalStops: allStops.length,
  unassigned,
  areas: stats.map(s => ({
    id: s.id, name: s.name,
    avgDeliveryTimeET: s.avgMins !== null ? fmtTime(s.avgMins) : null,
    avgDeliveryMinutes: s.avgMins,
    stopCount: s.count,
    sampleDays: s.sampleDays,
  })),
};
fs.writeFileSync("./scripts/326-delivery-analysis.json", JSON.stringify(output, null, 2));
console.log("\n  Full data saved → scripts/326-delivery-analysis.json\n");
