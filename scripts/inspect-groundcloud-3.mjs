/**
 * Inspector v3 — navigates to Reports page and Routes page to find delivery metrics.
 * Writes NO customer data. Delete after use.
 */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const LOGIN_URL = "https://www.groundcloud.io/dashboard/login/";

async function captureStructure(page, label) {
  const structure = await page.evaluate(() => {
    function getStructure(el, depth = 0) {
      if (depth > 6) return "";
      const tag = el.tagName?.toLowerCase();
      if (!tag || tag === "script" || tag === "style") return "";
      const cls = typeof el.className === "string" ? el.className.trim() : "";
      const id  = el.id || "";
      const txt = el.children.length === 0 ? (el.innerText?.trim().slice(0, 60) || "") : "";
      let out = `${"  ".repeat(depth)}<${tag}${id ? ` id="${id}"` : ""}${cls ? ` class="${cls}"` : ""}>${txt}\n`;
      for (const child of el.children) out += getStructure(child, depth + 1);
      return out;
    }
    return getStructure(document.body).slice(0, 20000);
  });
  writeFileSync(`scripts/structure-${label}.txt`, structure);
  console.log(`✓ structure-${label}.txt written`);
}

async function findKeywords(page) {
  return page.evaluate(() => {
    const keywords = ["deliver", "exception", "package", "stop", "route", "complete", "total", "count"];
    const results = [];
    for (const el of document.querySelectorAll("*")) {
      if (el.children.length > 5) continue;
      const text = el.innerText?.trim();
      if (!text || text.length > 120) continue;
      const lower = text.toLowerCase();
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          results.push({ tag: el.tagName, class: el.className, id: el.id, text });
          break;
        }
      }
    }
    return results.slice(0, 80);
  });
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // ── Login ──────────────────────────────────────────────────────────────────
  console.log("→ Logging in...");
  await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });
  await page.type("#id_auth-username", "Blake742Logistics");
  await page.type("#id_auth-password", "dowell2026");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
    page.keyboard.press("Enter"),
  ]);
  console.log("✓ Logged in:", page.url());

  const today = new Date().toISOString().slice(0, 10);

  // ── Reports page ───────────────────────────────────────────────────────────
  console.log("\n── Reports page ──");
  await page.goto(`https://www.groundcloud.io/dashboard/reports?date=${today}`, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 5000)); // wait for Vue
  writeFileSync("scripts/ss-reports.png", await page.screenshot());
  console.log("✓ Screenshot: reports");
  await captureStructure(page, "reports");
  const reportKeywords = await findKeywords(page);
  writeFileSync("scripts/keywords-reports.json", JSON.stringify(reportKeywords, null, 2));
  console.log("Report keywords:", JSON.stringify(reportKeywords.slice(0, 20), null, 2));

  // ── Routes page ────────────────────────────────────────────────────────────
  console.log("\n── Routes page ──");
  await page.goto(`https://www.groundcloud.io/dashboard/routes/?date=${today}`, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 5000)); // wait for Vue
  writeFileSync("scripts/ss-routes.png", await page.screenshot());
  console.log("✓ Screenshot: routes");
  await captureStructure(page, "routes");
  const routeKeywords = await findKeywords(page);
  writeFileSync("scripts/keywords-routes.json", JSON.stringify(routeKeywords, null, 2));
  console.log("Route keywords:", JSON.stringify(routeKeywords.slice(0, 20), null, 2));

  // ── Manifests page ─────────────────────────────────────────────────────────
  console.log("\n── Manifests page ──");
  await page.goto(`https://www.groundcloud.io/dashboard/manifests?date=${today}`, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 5000)); // wait for Vue
  writeFileSync("scripts/ss-manifests.png", await page.screenshot());
  console.log("✓ Screenshot: manifests");
  await captureStructure(page, "manifests");
  const manifestKeywords = await findKeywords(page);
  writeFileSync("scripts/keywords-manifests.json", JSON.stringify(manifestKeywords, null, 2));
  console.log("Manifest keywords:", JSON.stringify(manifestKeywords.slice(0, 20), null, 2));

} finally {
  await browser.close();
}
