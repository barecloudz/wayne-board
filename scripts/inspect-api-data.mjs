/**
 * Tests the GroundCloud REST API with a historical date to identify stat_type codes.
 * Uses session cookies via Puppeteer login, then calls API via page.evaluate().
 * Writes NO customer addresses or PII. Delete after use.
 */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const LOGIN_URL = "https://www.groundcloud.io/dashboard/login/";
const CUSTOMER_ID = 439;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true, // headless OK now
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

  // ── Fetch API for past dates ───────────────────────────────────────────────
  const STAT_TYPES = [1, 100, 103, 104, 120, 121, 150, 200, 202, 203, 205];
  const statParams = STAT_TYPES.map(t => `stat_type%5B%5D=${t}`).join("&");

  // Try past dates — pick ones where routes likely ran (weekdays in June)
  const testDates = ["2026-06-30", "2026-06-27", "2026-06-26", "2026-06-25"];

  for (const date of testDates) {
    const url = `https://www.groundcloud.io/api/route-day-decimal-stats/?customer=${CUSTOMER_ID}&route_day__day=${date}&${statParams}`;
    console.log(`\n── Fetching ${date} ──`);

    const data = await page.evaluate(async (apiUrl) => {
      const res = await fetch(apiUrl, { credentials: "include" });
      return res.json();
    }, url);

    console.log("Results count:", data.results?.length);
    if (data.results?.length > 0) {
      console.log("Sample results (first 10):", JSON.stringify(data.results.slice(0, 10), null, 2));
      writeFileSync(`scripts/api-data-${date}.json`, JSON.stringify(data, null, 2));
      console.log(`✓ Saved api-data-${date}.json`);
      // If we got data, also fetch route-days for context
      const rdUrl = `https://www.groundcloud.io/api/route-days/?mini=true&customer=${CUSTOMER_ID}&day=${date}`;
      const rdData = await page.evaluate(async (u) => {
        const r = await fetch(u, { credentials: "include" });
        return r.json();
      }, rdUrl);
      // Save only structure/counts, not PII
      const rdSummary = {
        count: rdData.results?.length,
        sample_keys: rdData.results?.[0] ? Object.keys(rdData.results[0]) : [],
      };
      console.log("Route-days summary:", JSON.stringify(rdSummary, null, 2));
      writeFileSync(`scripts/api-routedays-${date}-summary.json`, JSON.stringify(rdSummary, null, 2));
      break; // Got data, stop
    } else {
      console.log("No results for", date);
    }
  }

} finally {
  await browser.close();
}
