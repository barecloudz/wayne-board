/**
 * Delete a dangling DRO test plan by ID or name containing "WAYNE TEST"
 * Usage: node scripts/cleanup-test-plan.mjs [planId]
 */
import { readFileSync } from "fs";
import puppeteer from "puppeteer-core";

const CHROME     = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DRO_BASE   = "https://dro.routesmart.com";
const SA_ID      = "3060743";
const STATION_ID = "259";
const TARGET_ID  = parseInt(process.argv[2] ?? "2354125");

const env      = readFileSync(".env.local", "utf8");
const getEnv   = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const username = getEnv("DRO_USERNAME");
const password = getEnv("DRO_PASSWORD");

async function droLogin() {
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
  return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}

const cookieHeader = await droLogin();
const headers = { Cookie: cookieHeader, "Content-Type": "application/json" };

// List plans first
const listRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans`, { headers });
const plans = await listRes.json();
const target = plans.find(p => (p.planId ?? p.id) === TARGET_ID || (p.name ?? "").includes("WAYNE TEST"));

if (!target) {
  console.log("No matching plan found. Current plans:");
  plans.forEach(p => console.log(`  ${p.planId ?? p.id}: ${p.name}`));
  process.exit(0);
}

const planId = target.planId ?? target.id;
console.log(`Found: [${planId}] ${target.name} — deleting...`);

// Try DELETE by ID
const del1 = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans/${planId}`, {
  method: "DELETE", headers });
console.log(`DELETE /{id}: ${del1.status}`);

if (!del1.ok) {
  // Try DELETE with body
  const del2 = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans/`, {
    method: "DELETE", headers, body: JSON.stringify({ planId }) });
  console.log(`DELETE / with body: ${del2.status} — ${await del2.text()}`);

  // Try DELETE with planId as query param
  const del3 = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans?planId=${planId}`, {
    method: "DELETE", headers });
  console.log(`DELETE ?planId: ${del3.status} — ${await del3.text()}`);
}

// Verify
const listAfter = await (await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans`, { headers })).json();
const stillThere = listAfter.find(p => (p.planId ?? p.id) === planId);
console.log(stillThere ? `⚠  Plan still exists.` : `✓ Plan deleted successfully.`);
console.log(`Plans remaining: ${listAfter.length}`);
