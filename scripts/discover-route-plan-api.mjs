import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";

const DRO_BASE   = "https://dro.routesmart.com";
const CHROME     = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WAIT       = ms => new Promise(r => setTimeout(r, ms));
const SA_ID      = "3060743";

const env      = readFileSync(".env.local", "utf8");
const getEnv   = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const username = getEnv("DRO_USERNAME");
const password = getEnv("DRO_PASSWORD");

const calls = [];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, args: ["--no-sandbox"] });
const page    = await browser.newPage();
page.on("dialog", async d => { try { await d.dismiss(); } catch {} });

// Capture ALL API calls with full request detail
page.on("request", req => {
  const url = req.url();
  if (!url.includes("/api/")) return;
  const method = req.method();
  if (method === "GET" && !url.includes("route-plan")) return; // only log non-GET unless route-plan related
  calls.push({ method, url: url.replace(DRO_BASE, ""), body: (() => { try { return JSON.parse(req.postData() ?? "null"); } catch { return req.postData(); } })() });
});
page.on("response", async res => {
  const url = res.url();
  if (!url.includes("/api/")) return;
  const method = res.request().method();
  if (method === "GET" && !url.includes("route-plan")) return;
  const existing = calls.find(c => c.url === url.replace(DRO_BASE, "") && c.method === method);
  if (existing) {
    try { existing.response = await res.json(); } catch { existing.responseStatus = res.status(); }
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
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
await WAIT(4000);
console.log("✓ Logged in");

const cookies = await page.cookies();
const h = { Cookie: cookies.map(c => `${c.name}=${c.value}`).join("; "), "Content-Type": "application/json" };

// ── Direct API probe: list all route plans ────────────────────────────────────
console.log("\n=== Probing route plan endpoints ===");
async function get(path) {
  const res = await fetch(DRO_BASE + path, { headers: h });
  try { return { status: res.status, data: await res.json() }; }
  catch { return { status: res.status, data: null }; }
}

const planList = await get(`/api/api/service-areas/${SA_ID}/route-plans`);
console.log("GET route-plans:", planList.status, JSON.stringify(planList.data)?.slice(0, 300));

const activePlan = await get(`/api/api/service-areas/${SA_ID}/active-route-plan`);
console.log("GET active-route-plan:", activePlan.status, JSON.stringify(activePlan.data)?.slice(0, 300));

const planId = activePlan.data?.planId;
if (planId) {
  const planDetail = await get(`/api/api/service-areas/${SA_ID}/route-plans/${planId}`);
  console.log(`GET route-plans/${planId}:`, planDetail.status, JSON.stringify(planDetail.data)?.slice(0, 500));

  const planRoutes = await get(`/api/api/service-areas/${SA_ID}/route-plans/${planId}/routes`);
  console.log(`GET route-plans/${planId}/routes:`, planRoutes.status, JSON.stringify(planRoutes.data)?.slice(0, 500));

  const planVehicles = await get(`/api/api/service-areas/${SA_ID}/route-plans/${planId}/vehicles`);
  console.log(`GET route-plans/${planId}/vehicles:`, planVehicles.status, JSON.stringify(planVehicles.data)?.slice(0, 500));
}

// ── Navigate to MANAGE → Route Plans and watch network ───────────────────────
console.log("\n=== Navigating to Manage → Route Plans ===");
calls.length = 0;

// Click MANAGE
await page.evaluate(() => {
  for (const el of document.querySelectorAll("a, button, li, span, div")) {
    if (el.textContent?.trim() === "MANAGE" && el.getBoundingClientRect().width > 0) { el.click(); break; }
  }
});
await WAIT(2000);
await page.screenshot({ path: "scripts/rp-01-manage-clicked.png" });

// Click Route Plans
await page.evaluate(() => {
  for (const el of document.querySelectorAll("a, button, li, span, div")) {
    const txt = el.textContent?.trim().toLowerCase();
    if ((txt === "route plans" || txt?.includes("route plan")) && el.getBoundingClientRect().width > 0) { el.click(); break; }
  }
});
await WAIT(3000);
await page.screenshot({ path: "scripts/rp-02-route-plans-page.png" });
console.log("Route Plans page API calls:");
calls.forEach(c => console.log(" ", c.method, c.url, c.response ? JSON.stringify(c.response).slice(0, 200) : ""));

// ── Look for Copy / Duplicate button ─────────────────────────────────────────
console.log("\n=== Looking for copy/duplicate/create controls ===");
const pageText = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button, a, [role='button']")];
  return btns.map(b => b.textContent?.trim()).filter(Boolean);
});
console.log("Visible buttons:", pageText.filter(t => t.length < 50));

// Try to find BLAKE 13 specifically
const blakeRow = await page.evaluate(() => {
  const all = [...document.querySelectorAll("*")];
  const el = all.find(e => e.textContent?.includes("BLAKE 13") && e.getBoundingClientRect().width > 0 && e.children.length < 5);
  return el ? { text: el.textContent?.trim(), tag: el.tagName, class: el.className } : null;
});
console.log("BLAKE 13 element:", blakeRow);

await page.screenshot({ path: "scripts/rp-03-full-page.png" });

// ── Try clicking the row for BLAKE 13 to see options ─────────────────────────
calls.length = 0;
const clicked = await page.evaluate(() => {
  const all = [...document.querySelectorAll("*")];
  for (const el of all) {
    if (el.textContent?.trim().includes("BLAKE 13") && el.getBoundingClientRect().width > 0 && el.children.length < 5) {
      el.click();
      return true;
    }
  }
  return false;
});
await WAIT(2000);
await page.screenshot({ path: "scripts/rp-04-blake13-clicked.png" });
console.log("\nAfter clicking BLAKE 13:", clicked);
console.log("API calls:", calls.map(c => `${c.method} ${c.url}`));

const afterClickButtons = await page.evaluate(() =>
  [...document.querySelectorAll("button, a, [role='button']")]
    .map(b => b.textContent?.trim())
    .filter(t => t && t.length < 60)
);
console.log("Buttons after click:", afterClickButtons);

// ── Try right-click / context menu ───────────────────────────────────────────
await page.evaluate(() => {
  const all = [...document.querySelectorAll("*")];
  for (const el of all) {
    if (el.textContent?.trim().includes("BLAKE 13") && el.getBoundingClientRect().width > 0 && el.children.length < 5) {
      el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
      return;
    }
  }
});
await WAIT(1500);
await page.screenshot({ path: "scripts/rp-05-context-menu.png" });

// ── Look for kebab/three-dot menus ────────────────────────────────────────────
calls.length = 0;
await page.evaluate(() => {
  // Look for three-dot or kebab icon buttons near BLAKE 13
  const all = [...document.querySelectorAll("button, [role='button']")];
  for (const el of all) {
    const txt = el.textContent?.trim();
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && (txt === "⋮" || txt === "..." || txt === "•••" || el.querySelector('svg') !== null)) {
      // Check if it's near a BLAKE 13 row
      const parent = el.closest("tr, li, [role='row'], div[class*='row'], div[class*='item']");
      if (parent?.textContent?.includes("BLAKE 13")) {
        el.click();
        return "clicked kebab near BLAKE 13";
      }
    }
  }
  return "no kebab found";
});
await WAIT(2000);
await page.screenshot({ path: "scripts/rp-06-kebab-menu.png" });
console.log("\nAPI calls after kebab:", calls.map(c => `${c.method} ${c.url}`));

const kebabButtons = await page.evaluate(() =>
  [...document.querySelectorAll("button, a, [role='button'], li, [role='menuitem']")]
    .filter(el => el.getBoundingClientRect().width > 0)
    .map(b => b.textContent?.trim())
    .filter(t => t && t.length < 60)
);
console.log("Buttons visible after kebab:", kebabButtons);

// ── Probe: try POST to copy/duplicate a plan ──────────────────────────────────
if (planId) {
  console.log("\n=== Probing copy/duplicate/create plan endpoints ===");
  const copyAttempts = [
    { method: "POST", path: `/api/api/service-areas/${SA_ID}/route-plans/${planId}/copy` },
    { method: "POST", path: `/api/api/service-areas/${SA_ID}/route-plans/${planId}/duplicate` },
    { method: "POST", path: `/api/api/service-areas/${SA_ID}/route-plans/${planId}/clone` },
    { method: "POST", path: `/api/api/service-areas/${SA_ID}/route-plans/copy` },
    { method: "POST", path: `/api/api/service-areas/${SA_ID}/route-plans`, body: { name: "AUTO", copyFromPlanId: planId } },
    { method: "POST", path: `/api/api/service-areas/${SA_ID}/route-plans`, body: { name: "AUTO" } },
    { method: "PUT",  path: `/api/api/service-areas/${SA_ID}/route-plans/${planId}`, body: { name: "AUTO" } },
    { method: "GET",  path: `/api/api/service-areas/${SA_ID}/route-plans/${planId}/copy` },
  ];

  for (const attempt of copyAttempts) {
    const res = await fetch(DRO_BASE + attempt.path, {
      method: attempt.method,
      headers: h,
      body: attempt.body ? JSON.stringify(attempt.body) : undefined,
    });
    const text = await res.text().catch(() => "");
    let data;
    try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
    if (res.status !== 404 && res.status !== 405) {
      console.log(`✓ ${attempt.method} ${attempt.path}: ${res.status}`, JSON.stringify(data).slice(0, 300));
    } else {
      console.log(`  ${attempt.method} ${attempt.path}: ${res.status}`);
    }
  }
}

writeFileSync("scripts/dro-route-plan-api.json", JSON.stringify({ planList, activePlan, calls }, null, 2));
console.log("\nSaved → scripts/dro-route-plan-api.json");
console.log("\n⚠ Browser left open — manually try copy/duplicate in DRO UI and watch the console for API calls");
console.log("Press Ctrl+C when done.");

// Keep browser open so you can manually interact
await WAIT(120000);
await browser.close();
