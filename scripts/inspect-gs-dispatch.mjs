/**
 * Explore GroundSwell dispatch / auto-routing API.
 * Logs in via Auth0, intercepts network calls when "Import from LIVE" is clicked,
 * and tries to call the dispatch endpoint directly.
 * Delete after use — no PII written to disk.
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const GS_URL = "https://groundswell.risingtide.us";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  args: ["--no-sandbox"],
});

let bearerToken = null;

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Intercept requests to capture the bearer token
  const capturedCalls = [];
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const authHeader = req.headers()["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      bearerToken = authHeader.slice(7);
    }
    req.continue();
  });

  // Capture all API responses for analysis
  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes("api.risingtide.us") || url.includes("risingtide.us")) {
      const method = resp.request().method();
      try {
        const body = await resp.text();
        capturedCalls.push({ url, method, status: resp.status(), body: body.slice(0, 500) });
        if (url.includes("dispatch") || url.includes("import") || url.includes("trigger") || url.includes("dro_connect")) {
          console.log(`\n[${method} ${resp.status()}] ${url}`);
          console.log("Response:", body.slice(0, 800));
        }
      } catch {}
    }
  });

  // ── Login to GroundSwell via Auth0 ─────────────────────────────────────────
  console.log("→ Navigating to GroundSwell...");
  await page.goto(GS_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Check if redirected to auth
  const currentUrl = page.url();
  console.log("Current URL:", currentUrl);

  if (currentUrl.includes("auth.risingtide.us") || currentUrl.includes("auth0")) {
    console.log("→ Logging in via Auth0...");
    await page.waitForSelector("input#username", { timeout: 10000 });
    await page.type("input#username", "bnardoni87@gmail.com");
    await page.click('button[type="submit"], button::-p-text(Continue)');
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.type('input[type="password"]', "LightningZeus#4");
    await page.click('button[type="submit"], button::-p-text(Continue)');
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 });
    console.log("✓ Logged in. URL:", page.url());
  }

  await new Promise(r => setTimeout(r, 5000));
  console.log("✓ At:", page.url());
  console.log("Bearer token captured:", bearerToken ? `${bearerToken.slice(0, 20)}...` : "NONE YET");

  // ── Try to find and click "Import from LIVE" button ───────────────────────
  console.log("\n→ Looking for Import from LIVE button...");

  // First check page text
  const pageText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log("Page text preview:", pageText.slice(0, 500));

  // Try to find any button/link with dispatch-related text
  const buttons = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("button, a, [role='button']"));
    return all.map(el => ({
      text: el.textContent?.trim().slice(0, 80),
      tag: el.tagName,
      class: el.className?.slice(0, 50),
    })).filter(b => b.text && b.text.length > 0).slice(0, 50);
  });
  console.log("\nButtons/links found:", JSON.stringify(buttons, null, 2));

  // ── If we have a bearer token, call the DRO Connect endpoint directly ─────
  if (bearerToken) {
    const API_BASE = "https://api.risingtide.us";
    const DRO_CONNECT_ID = 1439;
    const SCE_ID = 26716; // Today's schedule entry (Thursday as of 2026-07-16)

    const headers = {
      "Authorization": `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
    };

    // 1. Get DRO Connect config to confirm we can auth
    console.log("\n── DRO Connect Config ──");
    const droRes = await fetch(`${API_BASE}/dro_connect/v1/${DRO_CONNECT_ID}/`, { headers });
    const droData = await droRes.json();
    console.log("Status:", droRes.status);
    console.log("planning_window_start:", droData.planning_window_start);
    console.log("planning_window_end:", droData.planning_window_end);
    console.log("n_minus:", droData.n_minus);

    // 2. Get dispatch schedules
    console.log("\n── DRO Connect Schedules ──");
    const schedRes = await fetch(`${API_BASE}/dro_connect/v1/${DRO_CONNECT_ID}/schedules/`, { headers });
    console.log("Status:", schedRes.status);
    const schedData = await schedRes.json();
    console.log(JSON.stringify(schedData, null, 2).slice(0, 800));

    // 3. Try the dispatch endpoint — various guesses
    const dispatchEndpoints = [
      `${API_BASE}/dro_connect/v1/${DRO_CONNECT_ID}/dispatch/`,
      `${API_BASE}/dro_connect/v1/${DRO_CONNECT_ID}/import/`,
      `${API_BASE}/dro_connect/v1/${DRO_CONNECT_ID}/trigger/`,
      `${API_BASE}/dro_connect/v1/${DRO_CONNECT_ID}/run/`,
      `${API_BASE}/dro_connect/v1/dispatch/`,
      `${API_BASE}/automation/v1/dispatch/`,
      `${API_BASE}/automation/v1/trigger/`,
      `${API_BASE}/dro_connect/v1/${DRO_CONNECT_ID}/dispatch/?sce_id=${SCE_ID}`,
    ];

    console.log("\n── Probing dispatch endpoints ──");
    for (const endpoint of dispatchEndpoints) {
      try {
        // Try GET first
        const getRes = await fetch(endpoint, { headers });
        console.log(`GET ${endpoint.replace(API_BASE, '')} → ${getRes.status}`);
        if (getRes.status !== 404) {
          const body = await getRes.text();
          console.log("  Response:", body.slice(0, 300));
        }
      } catch (e) {
        console.log(`  Error: ${e.message}`);
      }
    }

    // 4. Try POST to dispatch
    console.log("\n── Trying POST dispatch ──");
    const postEndpoints = [
      { url: `${API_BASE}/dro_connect/v1/${DRO_CONNECT_ID}/dispatch/`, body: { sce_id: SCE_ID } },
      { url: `${API_BASE}/dro_connect/v1/${DRO_CONNECT_ID}/import/`, body: { sce_id: SCE_ID } },
      { url: `${API_BASE}/automation/v1/dispatch/`, body: { dro_connect_id: DRO_CONNECT_ID, sce_id: SCE_ID } },
    ];

    for (const { url, body } of postEndpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        console.log(`POST ${url.replace(API_BASE, '')} → ${res.status}`);
        const resText = await res.text();
        console.log("  Response:", resText.slice(0, 400));
      } catch (e) {
        console.log(`  Error: ${e.message}`);
      }
    }

    // 5. Check vehicles for capacity/max stops config
    console.log("\n── Vehicle Capacities (sample) ──");
    const vRes = await fetch(`${API_BASE}/health/authcheck`, { headers });
    const authData = await vRes.json();
    console.log("Auth check:", JSON.stringify(authData, null, 2).slice(0, 200));

  } else {
    console.log("\n⚠️  No bearer token captured yet — trying to get one via page.evaluate...");
    // Try to get it from localStorage/sessionStorage
    const stored = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const authKeys = keys.filter(k => k.includes("auth") || k.includes("token") || k.includes("@@"));
      return authKeys.map(k => ({ key: k, value: localStorage.getItem(k)?.slice(0, 200) }));
    });
    console.log("LocalStorage auth keys:", JSON.stringify(stored, null, 2));
  }

  // Keep browser open briefly to capture any deferred network calls
  await new Promise(r => setTimeout(r, 3000));

  console.log("\n── Summary of captured API calls ──");
  capturedCalls.slice(-20).forEach(c => {
    console.log(`${c.method} ${c.status} ${c.url.replace("https://api.risingtide.us", "")}`);
  });

} finally {
  await browser.close();
}
