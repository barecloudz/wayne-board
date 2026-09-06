/**
 * Opens a visible browser, logs into DRO, and captures all Power BI network
 * traffic to scripts/captured-powerbi-calls.json while you navigate to Spotlight.
 *
 * Run: node scripts/browse-spotlight.mjs
 * Keep the browser open — navigate to Spotlight → Customer Experience → Ryde
 * Press Ctrl+C when done — captured calls will be in scripts/captured-powerbi-calls.json
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const USERNAME   = "6367044";
const PASSWORD   = "LightningZeus#4";
const MYBIZ_BASE = "https://mybizaccount.fedex.com";
const OUTPUT     = path.join("scripts", "captured-powerbi-calls.json");

const captured = [];

function save() {
  fs.writeFileSync(OUTPUT, JSON.stringify(captured, null, 2));
  console.log(`\n[capture] Saved ${captured.length} requests to ${OUTPUT}`);
}

process.on("SIGINT", () => { save(); process.exit(0); });

(async () => {
  console.log("[browse] Launching visible browser...");

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--start-maximized", "--no-sandbox"],
  });

  const page = await browser.newPage();
  page.on("dialog", async d => { try { await d.dismiss(); } catch {} });

  function attachListeners(p) {
    p.on("response", async (response) => {
      const url = response.url();
      if (
        url.includes("powerbi") ||
        url.includes("analysis.windows.net") ||
        url.includes("GenerateToken") ||
        url.includes("executeQueries") ||
        url.includes("querydata") ||
        url.includes("QueryData") ||
        url.includes("datasets") ||
        url.includes("embed") ||
        url.includes("spotlight") ||
        url.includes("dataworks.fedex") ||
        url.includes("spoi")
      ) {
        try {
          const status = response.status();
          const headers = response.headers();
          let body = "";
          try { body = await response.text(); } catch {}
          const entry = { url, status, headers, body: body.slice(0, 50000) };
          captured.push(entry);
          console.log(`[capture] ${status} ${url.slice(0, 120)}`);
          save();
        } catch {}
      }
    });

    p.on("request", (request) => {
      const url = request.url();
      if (
        url.includes("powerbi") ||
        url.includes("analysis.windows.net") ||
        url.includes("GenerateToken") ||
        url.includes("executeQueries") ||
        url.includes("spotlight") ||
        url.includes("dataworks.fedex") ||
        url.includes("mfa-api") ||
        url.includes("spoi")
      ) {
        const headers = request.headers();
        const postData = request.postData();
        const entry = {
          type: "REQUEST",
          method: request.method(),
          url,
          authorization: headers["authorization"],
          postData: postData ?? null,
        };
        if (headers["authorization"] || postData) {
          captured.push(entry);
          console.log(`[req] ${request.method()} ${url.slice(0, 100)} ${postData ? '| body: ' + postData.slice(0,200) : ''}`);
          save();
        }
      }
    });
  }

  // Attach to initial page
  attachListeners(page);

  // Attach to every new tab that opens
  browser.on("targetcreated", async (target) => {
    const newPage = await target.page().catch(() => null);
    if (newPage) {
      console.log(`[capture] New tab detected — attaching listeners`);
      attachListeners(newPage);
    }
  });

  console.log("[browse] Opening MyBizAccount — log in manually...");
  await page.goto(`${MYBIZ_BASE}/my.policy`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});

  console.log("\n✅ Browser is open.");
  console.log("👉 Log in manually → Spotlight → OTP → Customer Experience → Ryde");
  console.log("👉 Wait for Ryde page to fully load, then press Ctrl+C\n");

  // Keep alive
  await new Promise(() => {});
})();
