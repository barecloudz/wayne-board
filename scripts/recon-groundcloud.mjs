/**
 * GroundCloud full recon.
 * Logs in, navigates every section, captures all API calls + screenshots.
 * Output: scripts/groundcloud-recon.json
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL  = "https://www.groundcloud.io";
const OUTPUT    = path.join(__dirname, "groundcloud-recon.json");

const USERNAME = "Blake742Logistics";
const PASSWORD = "dowell2026";

const captured = { calls: [], cookies: null };

function shouldCapture(url) {
  return (
    !url.match(/\.(js|css|png|jpg|svg|woff|ico|webp|gif|map)(\?|$)/) &&
    !url.includes("google-analytics") &&
    !url.includes("googletagmanager") &&
    !url.includes("hotjar") &&
    !url.includes("intercom") &&
    !url.includes("sentry") &&
    !url.includes("cdn.") &&
    !url.includes("fonts.")
  );
}

function save() {
  fs.writeFileSync(OUTPUT, JSON.stringify(captured, null, 2));
}

function attachListener(page) {
  page.on("response", async (response) => {
    const url = response.url();
    if (!shouldCapture(url)) return;

    const method  = response.request().method();
    const status  = response.status();
    const reqBody = response.request().postData() || null;
    const resHdrs = response.headers();

    let body = null;
    try {
      const ct = resHdrs["content-type"] || "";
      if (ct.includes("json")) body = await response.json();
    } catch {}

    const entry = {
      method,
      url: url.replace(BASE_URL, ""),
      status,
      reqBody: reqBody ? reqBody.slice(0, 2000) : null,
      body,
      ts: new Date().toISOString(),
    };
    captured.calls.push(entry);

    const isWrite = ["POST","PUT","PATCH","DELETE"].includes(method);
    const tag     = isWrite ? "🔴 WRITE" : "     GET";
    console.log(`${tag} [${status}] ${entry.url.slice(0, 100)}`);
    if (body && typeof body === "object") {
      if (Array.isArray(body)) console.log(`       array[${body.length}]`, body[0] ? Object.keys(body[0]).slice(0,6).join(",") : "");
      else console.log("       keys:", Object.keys(body).slice(0,8).join(", "));
    }
    if (isWrite) {
      if (reqBody) console.log("       req:", reqBody.slice(0, 300));
      save();
    }
  });
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ss(page, name) {
  const p = path.join(__dirname, `gc2-${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`📸 gc2-${name}.png`);
}

async function run() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1440, height: 900 },
    args: ["--no-sandbox"],
  });

  const page = await browser.newPage();
  page.on("dialog", async d => { try { await d.dismiss(); } catch {} });
  browser.on("targetcreated", async (target) => {
    const p = await target.page().catch(() => null);
    if (p) { attachListener(p); p.on("dialog", async d => { try { await d.dismiss(); } catch {} }); }
  });
  attachListener(page);

  // ── Login ──────────────────────────────────────────────────────────────────
  console.log("\n→ Navigating to GroundCloud login...");
  await page.goto(`${BASE_URL}/dashboard/login/`, { waitUntil: "networkidle2" });
  await wait(1500);

  // Inspect the form
  const formInfo = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input")).map(i => ({ name: i.name, type: i.type, id: i.id }));
    const buttons = Array.from(document.querySelectorAll("button")).map(b => ({ text: b.textContent.trim(), type: b.type, name: b.name }));
    const form = document.querySelector("form");
    return { inputs, buttons, formAction: form?.action, formMethod: form?.method };
  });
  console.log("Form info:", JSON.stringify(formInfo));

  // Fill and submit
  const userInput = await page.$('input[name="username"], input[name="auth-username"]') ||
                    await page.$('input[type="text"]');
  const passInput = await page.$('input[name="password"], input[name="auth-password"]') ||
                    await page.$('input[type="password"]');

  if (userInput) { await userInput.click({ clickCount: 3 }); await userInput.type(USERNAME, { delay: 40 }); }
  if (passInput) { await passInput.click({ clickCount: 3 }); await passInput.type(PASSWORD, { delay: 40 }); }

  await ss(page, "02-filled");

  // Submit via form.submit() in the page to bypass button type issues
  const submitted = await page.evaluate(() => {
    const form = document.querySelector("form");
    if (form) { form.submit(); return true; }
    // Try clicking Next button
    const nextBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "Next");
    if (nextBtn) { nextBtn.click(); return "clicked-next"; }
    const submitBtn = document.querySelector('input[type="submit"], button[type="submit"]');
    if (submitBtn) { submitBtn.click(); return "clicked-submit"; }
    return false;
  });
  console.log("Submitted:", submitted);

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  await wait(3000);
  console.log("URL after login:", page.url());
  await ss(page, "03-after-login");

  const loggedIn = !page.url().includes("/login/");
  console.log(loggedIn ? "✅ Logged in!" : "⚠️  Still on login page");

  if (!loggedIn) {
    // Check for error message
    const errMsg = await page.evaluate(() => {
      const err = document.querySelector('.error, .alert, [class*="error"], [class*="invalid"]');
      return err ? err.textContent.trim() : null;
    });
    console.log("Error message:", errMsg || "none found");
    await ss(page, "03b-login-failed");
  }

  // Save cookies regardless
  captured.cookies = await page.cookies();
  save();

  // ── Navigate all sections ─────────────────────────────────────────────────
  console.log("\n=== NAVIGATING ALL SECTIONS ===");

  const paths = [
    "/dashboard/",
    "/dashboard/routes/",
    "/dashboard/manifest/",
    "/dashboard/reports/",
    "/dashboard/overview/",
    "/dashboard/drivers/",
    "/dashboard/vehicles/",
    "/dashboard/stops/",
    "/dashboard/metrics/",
    "/dashboard/settings/",
    "/dashboard/admin/",
    "/api/",
  ];

  for (const p of paths) {
    try {
      console.log(`\n→ ${p}`);
      await page.goto(`${BASE_URL}${p}`, { waitUntil: "networkidle2", timeout: 15000 });
      await wait(3000);

      // Check if redirected to login (not authed)
      if (page.url().includes("/login/")) {
        console.log("  ↩ Redirected to login — not authenticated");
        continue;
      }

      const name = p.replace(/\//g, "-").replace(/^-|-$/g, "") || "home";
      await ss(page, `nav-${name}`);
      console.log(`  ✓ URL: ${page.url()} (${captured.calls.length} calls)`);

      // Extract page structure
      const structure = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href]'))
          .map(a => ({ text: a.textContent.trim().slice(0,40), href: a.getAttribute("href") }))
          .filter(l => l.text && l.href && l.href.startsWith("/"))
          .slice(0, 20);
        const tables = Array.from(document.querySelectorAll("table")).length;
        const h1 = document.querySelector("h1,h2")?.textContent?.trim() || "";
        return { links, tables, h1 };
      });
      if (structure.h1) console.log(`  Page title: "${structure.h1}"`);
      if (structure.tables) console.log(`  Tables: ${structure.tables}`);
      structure.links.forEach(l => console.log(`    link: "${l.text}" → ${l.href}`));

      save();
    } catch (e) {
      console.log(`  ✗ ${e.message.slice(0, 80)}`);
    }
  }

  // ── Try API endpoints directly ─────────────────────────────────────────────
  console.log("\n=== PROBING API ENDPOINTS ===");
  const apiEndpoints = [
    "/api/v1/",
    "/api/v2/",
    "/api/routes/",
    "/api/drivers/",
    "/api/stops/",
    "/api/metrics/",
    "/api/manifests/",
    "/api/reports/",
    "/api/overview/",
  ];

  for (const ep of apiEndpoints) {
    try {
      const res = await page.evaluate(async (url) => {
        const r = await fetch(url, { headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" } });
        const text = await r.text();
        return { status: r.status, text: text.slice(0, 500) };
      }, `${BASE_URL}${ep}`);
      console.log(`  ${ep} → ${res.status}: ${res.text.slice(0, 100)}`);
    } catch (e) {
      console.log(`  ${ep} → error: ${e.message}`);
    }
  }

  save();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ Captured ${captured.calls.length} API calls`);
  console.log("Browser open for manual exploration. Auto-saves every 15s.\n");

  await new Promise(resolve => {
    const iv = setInterval(() => {
      save();
      console.log(`[auto-save] ${captured.calls.length} calls`);
    }, 15000);
    browser.on("disconnected", () => { clearInterval(iv); resolve(); });
  });

  save();
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
