/**
 * Pull all GroundCloud routes and build the route name → GC route ID map.
 * Also checks recent route-days to confirm route→route-day structure.
 */

import puppeteer from "puppeteer";
import https from "https";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const eq = line.indexOf("=");
  if (eq > 0) { const k = line.slice(0, eq).trim(); const v = line.slice(eq + 1).trim(); if (k && !process.env[k]) process.env[k] = v; }
}

const USERNAME = "Blake742Logistics";
const PASSWORD = "dowell2026";
const BASE     = "https://www.groundcloud.io";
const CUSTOMER = 439;

function apiGet(cookieHdr, path) {
  return new Promise((resolve) => {
    const opts = { host: "www.groundcloud.io", path, headers: { Cookie: cookieHdr, "X-Requested-With": "XMLHttpRequest" } };
    https.get(opts, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({ _raw: data.slice(0, 300) }); } });
    }).on("error", e => resolve({ _err: e.message }));
  });
}

async function login() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(`${BASE}/dashboard/login/`, { waitUntil: "networkidle2" });
  const u = await page.$('input[name="auth-username"]') || await page.$('input[type="text"]');
  const p = await page.$('input[name="auth-password"]') || await page.$('input[type="password"]');
  if (u) await u.type(USERNAME, { delay: 30 });
  if (p) await p.type(PASSWORD, { delay: 30 });
  await page.evaluate(() => document.querySelector("form")?.submit());
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  const cookies = await page.cookies();
  await browser.close();
  const sid  = cookies.find(c => c.name === "sessionid");
  const csrf = cookies.find(c => c.name === "csrftoken");
  if (!sid) throw new Error("Login failed");
  return `sessionid=${sid.value}; csrftoken=${csrf?.value || ""}`;
}

async function run() {
  const cookieHdr = await login();
  console.log("✅ Logged in\n");

  // ── All routes ────────────────────────────────────────────────────────────
  const routesResp = await apiGet(cookieHdr, `/api/routes/?customer=${CUSTOMER}&limit=100`);
  const routes = routesResp.results || [];
  console.log(`${routes.length} routes found\n`);

  console.log("─── All Routes ───");
  for (const r of routes) {
    console.log(`  id=${r.id}  name="${r.name}"  wa="${r.work_area_number || r.work_area || ""}"  active=${r.active ?? "?"}`);
  }

  // ── Recent route-days to confirm structure ────────────────────────────────
  let recentDate = null;
  let recentRds = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const r = await apiGet(cookieHdr, `/api/route-days/?customer=${CUSTOMER}&day=${ds}&limit=20`);
    if (r.results?.length > 0) { recentDate = ds; recentRds = r.results; break; }
  }

  if (recentRds.length) {
    console.log(`\n─── Route-days on ${recentDate} (showing route field) ───`);
    for (const rd of recentRds) {
      // Find route name from our routes list
      const routeObj = routes.find(r => r.id === rd.route);
      console.log(`  rd.id=${rd.id}  route=${rd.route}  routeName="${routeObj?.name ?? "?"}"  driver=${rd.driver}  status=${rd.status}`);
    }
  }

  // ── Save the mapping ──────────────────────────────────────────────────────
  const map = routes.map(r => ({
    gc_route_id: r.id,
    name: r.name,
    work_area_number: r.work_area_number || null,
    active: r.active ?? true,
  }));

  writeFileSync(path.join(__dirname, "gc-route-map.json"), JSON.stringify(map, null, 2));
  console.log(`\n✅ Saved to scripts/gc-route-map.json`);
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
