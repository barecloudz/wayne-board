/**
 * Inspector — intercepts network requests on Overview page to find the API
 * that serves delivery metrics. Writes NO customer data. Delete after use.
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

  // Collect interesting API calls
  const apiCalls = [];
  page.on("request", req => {
    const url = req.url();
    if (url.includes("/api/") || url.includes(".json") || url.includes("graphql")) {
      apiCalls.push({ method: req.method(), url, type: req.resourceType() });
    }
  });
  page.on("response", async res => {
    const url = res.url();
    if ((url.includes("/api/") || url.includes(".json") || url.includes("graphql"))
        && res.headers()["content-type"]?.includes("json")) {
      try {
        const body = await res.json();
        // Only save structure (keys), not values, to avoid PII
        const keys = JSON.stringify(Object.keys(body || {}));
        apiCalls.push({ type: "RESPONSE", url, keys });
      } catch {}
    }
  });

  // ── Login ──────────────────────────────────────────────────────────────────
  await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });
  await page.type("#id_auth-username", "Blake742Logistics");
  await page.type("#id_auth-password", "dowell2026");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
    page.keyboard.press("Enter"),
  ]);
  console.log("✓ Logged in:", page.url());

  // ── Overview page — wait for KPI cards ────────────────────────────────────
  await page.waitForSelector(".route-list-totals-bar-card__stops", { timeout: 20000 });
  await new Promise(r => setTimeout(r, 5000));

  writeFileSync("scripts/api-calls.json", JSON.stringify(apiCalls, null, 2));
  console.log("API calls captured:", apiCalls.length);
  console.log(JSON.stringify(apiCalls, null, 2));

  // Extract actual values now that cards are loaded
  const metrics = await page.evaluate(() => {
    const get = (sel, attr = "innerText") => document.querySelector(sel)?.[attr]?.trim() || null;
    return {
      stops: get(".route-list-totals-bar-card__stops .overview-progress-text .me-1"),
      stopsLeft: get(".route-list-totals-bar-card__stops .overview-progress-text .text-nowrap"),
      packages: get(".route-list-totals-bar-card__packages .overview-progress-text .me-1"),
      impactsExceptions: get(".route-list-totals-bar-card__impacts_and_exceptions h3"),
      driversAssigned: get(".route-list-totals-bar-card__drivers-assigned h3"),
      driveTime: get(".route-list-totals-bar-card__drive-time h3"),
    };
  });
  console.log("\n=== METRICS ===");
  console.log(JSON.stringify(metrics, null, 2));
  writeFileSync("scripts/metrics-sample.json", JSON.stringify(metrics, null, 2));

  writeFileSync("scripts/ss-final.png", await page.screenshot());
  console.log("✓ Screenshot taken");

} finally {
  await browser.close();
}
