/**
 * Pull the advanced-vehicle-set for all DRO plans so we can see
 * which anchor areas are assigned to which vehicles in each plan.
 */

import puppeteer from "puppeteer";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const eq = line.indexOf("=");
  if (eq > 0) { const k = line.slice(0, eq).trim(); const v = line.slice(eq + 1).trim(); if (k && !process.env[k]) process.env[k] = v; }
}

const DRO_BASE = "https://dro.routesmart.com";
const SA_ID    = "3060743";

async function droLogin() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  page.on("dialog", async d => { try { await d.dismiss(); } catch {} });

  await page.goto(DRO_BASE, { waitUntil: "networkidle2" });

  const popupPromise = new Promise(resolve => browser.once("targetcreated", t => resolve(t.page())));
  await page.click('button::-p-text(Service Provider)');
  const popup = await popupPromise;
  await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  popup.on("dialog", async d => { try { await d.dismiss(); } catch {} });

  try {
    await popup.waitForSelector('button::-p-text(Block)', { timeout: 3000 });
    await popup.click('button::-p-text(Block)');
  } catch {}

  await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
  await popup.type('input[name="identifier"]', process.env.DRO_USERNAME);
  await popup.click('input[type="submit"]');
  await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
  await popup.type('input[type="password"]', process.env.DRO_PASSWORD);
  const sub = await popup.$('input[type="submit"], button[type="submit"]');
  if (sub) await sub.click(); else await popup.keyboard.press("Enter");

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  const stationEls = await page.$$('[class*="station" i]');
  if (stationEls.length > 0) await stationEls[0].click();
  await new Promise(r => setTimeout(r, 3000));

  const cookies = await page.cookies();
  await browser.close();
  return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}

async function droGet(cookieHeader, path) {
  const res = await fetch(`${DRO_BASE}${path}`, {
    headers: { Cookie: cookieHeader, "Content-Type": "application/json" }
  });
  return res.json().catch(() => null);
}

async function run() {
  console.log("Logging into DRO...");
  const cookieHeader = await droLogin();
  console.log("✅ Logged in\n");

  // Plans we care about (from DB)
  const plans = [
    { id: 2352850, name: "AUTO (active)" },
    { id: 675189,  name: "Saturday" },
    { id: 675188,  name: "Mon-Fri" },
    { id: 2346252, name: "11 People" },
    { id: 2323377, name: "Sat Less PPl" },
    { id: 2326588, name: "Wednesday" },
    { id: 2318915, name: "Thursday" },
  ];

  const results = {};

  for (const plan of plans) {
    console.log(`\n─── Plan: ${plan.name} (id=${plan.id}) ───`);
    const vehicles = await droGet(cookieHeader, `/api/api/service-areas/${SA_ID}/route-plans/${plan.id}/advanced-vehicle-set`);

    if (!vehicles || !Array.isArray(vehicles)) {
      console.log("  No data / error");
      continue;
    }

    console.log(`  ${vehicles.length} vehicles`);
    results[plan.name] = vehicles.map(v => ({
      vehicleName:    v.vehicleName    ?? v.workAreaName ?? "",
      workAreaNumber: v.workAreaNumber ?? "",
      routeType:      v.routeType      ?? "",
      anchorAreas:    (v.anchorAreas ?? []).map(a => ({
        id:   a.anchorAreaId ?? a.id,
        name: a.name ?? "",
        workAreaNumber: a.workAreaNumber ?? "",
      })),
    }));

    for (const v of results[plan.name]) {
      const areas = v.anchorAreas.map(a => a.name || a.workAreaNumber).join(", ");
      console.log(`  Route "${v.vehicleName}" (${v.workAreaNumber}): ${v.anchorAreas.length} anchor areas — [${areas}]`);
    }
  }

  writeFileSync(path.join(__dirname, "dro-plan-details.json"), JSON.stringify(results, null, 2));
  console.log("\n✅ Saved to scripts/dro-plan-details.json");
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
