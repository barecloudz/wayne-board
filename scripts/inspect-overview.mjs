/**
 * Inspector — scrolls Overview page to find delivery KPIs below the map.
 * Writes NO customer data. Delete after use.
 */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const LOGIN_URL = "https://www.groundcloud.io/dashboard/login/";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // ── Login ──────────────────────────────────────────────────────────────────
  await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });
  await page.type("#id_auth-username", "Blake742Logistics");
  await page.type("#id_auth-password", "dowell2026");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
    page.keyboard.press("Enter"),
  ]);
  console.log("✓ Logged in:", page.url());

  // ── Wait for Vue to render ─────────────────────────────────────────────────
  await page.waitForSelector(".gc-sidebar", { timeout: 15000 });
  await new Promise(r => setTimeout(r, 8000)); // extra time for Vue

  writeFileSync("scripts/ss-overview-top.png", await page.screenshot());
  console.log("✓ Screenshot: top of Overview");

  // ── Scroll down in increments ──────────────────────────────────────────────
  await page.evaluate(() => window.scrollTo(0, 500));
  await new Promise(r => setTimeout(r, 1000));
  writeFileSync("scripts/ss-overview-scroll1.png", await page.screenshot());

  await page.evaluate(() => window.scrollTo(0, 1000));
  await new Promise(r => setTimeout(r, 1000));
  writeFileSync("scripts/ss-overview-scroll2.png", await page.screenshot());

  await page.evaluate(() => window.scrollTo(0, 1500));
  await new Promise(r => setTimeout(r, 1000));
  writeFileSync("scripts/ss-overview-scroll3.png", await page.screenshot());

  await page.evaluate(() => window.scrollTo(0, 2000));
  await new Promise(r => setTimeout(r, 1000));
  writeFileSync("scripts/ss-overview-scroll4.png", await page.screenshot());

  // Also scroll the main content area if it has its own scroll
  await page.evaluate(() => {
    const main = document.querySelector("main, .main-content, .dashboard-content, #page-content-wrapper");
    if (main) main.scrollTop = 2000;
  });
  await new Promise(r => setTimeout(r, 1000));
  writeFileSync("scripts/ss-overview-inner-scroll.png", await page.screenshot());

  console.log("✓ All scroll screenshots taken");

  // ── Capture full DOM after waiting ─────────────────────────────────────────
  const allText = await page.evaluate(() => {
    const results = [];
    for (const el of document.querySelectorAll("*")) {
      const text = el.innerText?.trim();
      if (!text || el.children.length > 3 || text.length > 150) continue;
      const lower = text.toLowerCase();
      if (/\d/.test(text) || lower.includes("deliver") || lower.includes("exception")
          || lower.includes("stop") || lower.includes("route") || lower.includes("package")
          || lower.includes("complete") || lower.includes("total") || lower.includes("today")) {
        results.push({
          tag: el.tagName,
          class: el.className,
          id: el.id,
          text,
          rect: (() => {
            const r = el.getBoundingClientRect();
            return { top: Math.round(r.top + window.scrollY), left: Math.round(r.left) };
          })(),
        });
      }
    }
    // Sort by vertical position
    results.sort((a, b) => a.rect.top - b.rect.top);
    return results.slice(0, 100);
  });

  writeFileSync("scripts/overview-all-text.json", JSON.stringify(allText, null, 2));
  console.log("Text elements found:", allText.length);
  console.log(JSON.stringify(allText.slice(0, 30), null, 2));

  // Full structure
  const structure = await page.evaluate(() => {
    function getStructure(el, depth = 0) {
      if (depth > 6) return "";
      const tag = el.tagName?.toLowerCase();
      if (!tag || tag === "script" || tag === "style" || tag === "svg") return "";
      const cls = typeof el.className === "string" ? el.className.trim() : "";
      const id  = el.id || "";
      const txt = el.children.length === 0 ? (el.innerText?.trim().slice(0, 60) || "") : "";
      let out = `${"  ".repeat(depth)}<${tag}${id ? ` id="${id}"` : ""}${cls ? ` class="${cls}"` : ""}>${txt}\n`;
      for (const child of el.children) out += getStructure(child, depth + 1);
      return out;
    }
    return getStructure(document.body).slice(0, 25000);
  });
  writeFileSync("scripts/structure-overview-waited.txt", structure);
  console.log("✓ structure-overview-waited.txt written");

} finally {
  await browser.close();
}
