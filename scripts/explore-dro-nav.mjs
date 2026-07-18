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

// ── Login ─────────────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  args: ["--no-sandbox"],
  defaultViewport: { width: 1400, height: 900 },
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
await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 }).catch(() => {});
await WAIT(3000);
(await page.$$('[class*="station" i]'))[0]?.click();
await WAIT(4000);
console.log("✓ Logged in\n");

const cookies = await page.cookies();
const h = { Cookie: cookies.map(c => `${c.name}=${c.value}`).join("; "), "Content-Type": "application/json" };

const results = {};

// ── Use real mouse to get element position and hover ─────────────────────────
async function realMouseHover(label) {
  const box = await page.evaluate((txt) => {
    const all = [...document.querySelectorAll("a, button, li, span, div")];
    for (const el of all) {
      if (el.textContent?.trim() === txt) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  }, label);
  if (!box) { console.log(`  ! "${label}" not found on page`); return false; }
  await page.mouse.move(box.x, box.y, { steps: 5 });
  await WAIT(600);
  return true;
}

async function realMouseClick(label) {
  const box = await page.evaluate((txt) => {
    const all = [...document.querySelectorAll("a, button, li, span, div, [role='menuitem']")];
    for (const el of all) {
      if (el.textContent?.trim() === txt) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: el.textContent.trim() };
      }
    }
    return null;
  }, label);
  if (!box) { console.log(`  ! "${label}" not clickable`); return false; }
  await page.mouse.click(box.x, box.y);
  await WAIT(2000);
  return true;
}

// Wait for new elements to appear after opening a dropdown
async function waitForNewContent(knownButtons) {
  await page.waitForFunction(
    (known) => {
      const btns = [...document.querySelectorAll("a, button, li, [role='menuitem']")]
        .filter(el => el.getBoundingClientRect().width > 0)
        .map(el => el.textContent?.trim())
        .filter(Boolean);
      return btns.some(b => !known.includes(b));
    },
    { timeout: 3000 },
    knownButtons
  ).catch(() => {});
}

async function getVisibleText() {
  return page.evaluate(() =>
    [...document.querySelectorAll("a, button, li, [role='menuitem'], span")]
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map(el => el.textContent?.trim())
      .filter(t => t && t.length > 1 && t.length < 60)
      .filter((v, i, a) => a.indexOf(v) === i)
  );
}

async function captureSection(name, fn) {
  const calls = [];
  const listener = async (res) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    let body = null;
    try { body = await res.json(); } catch {}
    calls.push({ method: res.request().method(), url: url.replace(DRO_BASE, ""), status: res.status(), body });
  };
  page.on("response", listener);
  await fn();
  await WAIT(2500);
  page.off("response", listener);
  results[name] = { calls: calls.filter(c => c.status < 400) };
  console.log(`  API calls: ${results[name].calls.length}`);
  results[name].calls.forEach(c => {
    const d = c.body;
    const preview = Array.isArray(d)
      ? `Array[${d.length}]${d[0] ? " keys: " + Object.keys(d[0]).slice(0, 6).join(", ") : " empty"}`
      : typeof d === "object" && d
      ? "keys: " + Object.keys(d).slice(0, 8).join(", ")
      : String(d ?? "").slice(0, 120);
    console.log(`    ${c.method} ${c.url} → ${preview}`);
  });
}

const baseButtons = await getVisibleText();

// ═══════════════════════════════════════════════════════════════════════════════
// Top-level nav items
// ═══════════════════════════════════════════════════════════════════════════════
for (const nav of ["DASHBOARD", "MAP", "HISTORICAL"]) {
  console.log(`\n── ${nav} ──`);
  await captureSection(nav, async () => {
    await realMouseClick(nav);
    await WAIT(2000);
  });
  await page.screenshot({ path: `scripts/nav-${nav.toLowerCase()}.png` });
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT dropdown
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── REPORT dropdown ──");
await realMouseHover("REPORT");
await WAIT(800);
await page.screenshot({ path: "scripts/nav-report-hover.png" });
const reportVisible = await getVisibleText();
const newReportItems = reportVisible.filter(t => !baseButtons.includes(t));
console.log("  New items after hover:", newReportItems);

for (const item of newReportItems) {
  if (item === "REPORT") continue;
  console.log(`\n  ── REPORT → ${item} ──`);
  await realMouseHover("REPORT");
  await WAIT(500);
  await captureSection(`report_${item}`, async () => {
    await realMouseClick(item);
  });
  const safe = item.replace(/[\s/\\]/g, "_").replace(/[^a-z0-9_]/gi, "").slice(0, 30).toLowerCase();
  await page.screenshot({ path: `scripts/nav-report-${safe}.png` });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGE dropdown
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── MANAGE dropdown ──");
await realMouseHover("MANAGE");
await WAIT(800);
await page.screenshot({ path: "scripts/nav-manage-hover.png" });
const manageVisible = await getVisibleText();
const newManageItems = manageVisible.filter(t => !baseButtons.includes(t));
console.log("  New items after hover:", newManageItems);

for (const item of newManageItems) {
  if (item === "MANAGE") continue;
  console.log(`\n  ── MANAGE → ${item} ──`);
  await realMouseHover("MANAGE");
  await WAIT(500);
  await captureSection(`manage_${item}`, async () => {
    await realMouseClick(item);
  });
  const safe = item.replace(/[\s/\\]/g, "_").replace(/[^a-z0-9_]/gi, "").slice(0, 30).toLowerCase();
  await page.screenshot({ path: `scripts/nav-manage-${safe}.png` });
  console.log("  Visible buttons:", (await getVisibleText()).filter(t => !baseButtons.includes(t)).slice(0, 20));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SWITCH VIEW dropdown
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n── SWITCH VIEW dropdown ──");
await realMouseHover("SWITCH VIEW");
await WAIT(800);
await page.screenshot({ path: "scripts/nav-switchview-hover.png" });
const switchVisible = await getVisibleText();
const newSwitchItems = switchVisible.filter(t => !baseButtons.includes(t));
console.log("  New items after hover:", newSwitchItems);

for (const item of newSwitchItems) {
  if (item === "SWITCH VIEW") continue;
  console.log(`\n  ── SWITCH VIEW → ${item} ──`);
  await realMouseHover("SWITCH VIEW");
  await WAIT(500);
  await captureSection(`switchview_${item}`, async () => {
    await realMouseClick(item);
    await WAIT(3000); // views take longer
  });
  const safe = item.replace(/[\s/\\]/g, "_").replace(/[^a-z0-9_]/gi, "").slice(0, 30).toLowerCase();
  await page.screenshot({ path: `scripts/nav-switchview-${safe}.png` });
}

writeFileSync("scripts/dro-nav-exploration.json", JSON.stringify(results, null, 2));
console.log("\n✓ Done. Saved → scripts/dro-nav-exploration.json");
await browser.close();
