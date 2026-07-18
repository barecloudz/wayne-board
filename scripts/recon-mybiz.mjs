/**
 * MyGroundBiz recon — login via PurpleID Okta, then find DSW.
 * Sign In navigates main page to purpleid.okta.com (no popup).
 * IMPORTANT: captures structure/metrics only, NO customer PII.
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DRO_USERNAME) {
  const env = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

const USERNAME = process.env.DRO_USERNAME;
const PASSWORD = process.env.DRO_PASSWORD;
const BASE     = "https://mybizaccount.fedex.com";
const OUTPUT   = path.join(__dirname, "mybiz-recon.json");

const captured = { calls: [], cookies: null, pages: {} };

function shouldCapture(url) {
  return (
    !url.match(/\.(js|css|png|jpg|svg|woff|ico|webp|gif|map|ttf|woff2)(\?|$)/) &&
    !url.includes("google-analytics") &&
    !url.includes("oktacdn.com") &&
    !url.includes("adobedtm") &&
    !url.includes("demdex") &&
    !url.includes("omtrdc") &&
    !url.includes("doubleclick")
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
    const resHdrs = response.headers();

    let body = null;
    try {
      const ct = resHdrs["content-type"] || "";
      if (ct.includes("json")) body = await response.json();
    } catch {}

    const urlLower = url.toLowerCase();
    const hasPii   = urlLower.includes("tracking") || urlLower.includes("recipient");

    const entry = {
      method,
      url: url.replace(BASE, "").slice(0, 200),
      status,
      body: hasPii ? "[REDACTED]" : body,
      ts: new Date().toISOString(),
    };
    captured.calls.push(entry);

    const isWrite = ["POST","PUT","PATCH","DELETE"].includes(method);
    console.log(`${isWrite ? "🔴" : "  "} [${status}] ${entry.url.slice(0,100)}`);
    if (body && typeof body === "object" && !hasPii) {
      if (Array.isArray(body)) console.log(`     array[${body.length}]`, body[0] ? Object.keys(body[0]).slice(0,8).join(",") : "");
      else console.log("     keys:", Object.keys(body).slice(0,10).join(", "));
    }
    if (isWrite) save();
  });
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
async function ss(page, name) {
  const p = path.join(__dirname, `mybiz-${name}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  console.log(`📸 mybiz-${name}.png`);
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
  attachListener(page);

  // ── Step 1: Landing page ──────────────────────────────────────────────────
  console.log("\n→ Loading MyBizAccount...");
  await page.goto(`${BASE}/my.policy`, { waitUntil: "networkidle2", timeout: 30000 });
  await wait(1500);
  await ss(page, "01-landing");

  // ── Step 2: Click Sign In → navigates to PurpleID Okta ───────────────────
  console.log("\n→ Clicking Sign In...");
  const signInEl = await page.$('input[value="Sign In"]') ||
                   await page.$('input[type="submit"]') ||
                   await page.$('input[type="button"]');

  if (signInEl) {
    await signInEl.click();
  } else {
    await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const btn = inputs.find(i => i.value?.includes("Sign"));
      if (btn) btn.click();
    });
  }

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
  await wait(3000);
  console.log("  URL after click:", page.url());
  await ss(page, "02-after-signin");

  // ── Step 3: PurpleID Okta — username ─────────────────────────────────────
  console.log("\n→ Filling PurpleID username...");
  try {
    // Dismiss passkey prompt if shown
    try {
      await page.waitForSelector('button::-p-text(Cancel)', { timeout: 3000 });
      await page.click('button::-p-text(Cancel)');
      await wait(1000);
    } catch {}

    await page.waitForSelector('input[name="identifier"], input[type="text"]', { timeout: 10000 });
    const userField = await page.$('input[name="identifier"]') || await page.$('input[type="text"]');
    if (userField) {
      await userField.click({ clickCount: 3 });
      await userField.type(USERNAME, { delay: 40 });
      console.log("  Username filled");
    }

    // Click Next
    const nextBtn = await page.$('input[type="submit"], button[type="submit"]');
    if (nextBtn) await nextBtn.click();
    else await page.keyboard.press("Enter");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});
    await wait(2000);
    console.log("  URL after username:", page.url());
    await ss(page, "03-after-username");

    // ── Step 4: Password ──────────────────────────────────────────────────
    console.log("\n→ Filling password...");
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    const passField = await page.$('input[type="password"]');
    if (passField) {
      await passField.click({ clickCount: 3 });
      await passField.type(PASSWORD, { delay: 40 });
      console.log("  Password filled");
    }

    const pwBtn = await page.$('input[type="submit"], button[type="submit"], input[value="Verify"]');
    if (pwBtn) await pwBtn.click();
    else await page.keyboard.press("Enter");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await wait(5000);
    console.log("  URL after password:", page.url());
    await ss(page, "04-after-password");

  } catch (e) {
    console.log("  Login error:", e.message);
    await ss(page, "error-login");
  }

  // ── Step 5: Check result ──────────────────────────────────────────────────
  const url = page.url();
  const loggedIn = url.includes("fedex.com") && !url.includes("okta") && !url.includes("login");
  console.log(`\n${loggedIn ? "✅ Logged in!" : "⚠️  URL: " + url}`);

  captured.cookies = await page.cookies();

  // Get page structure
  const info = await page.evaluate(() => {
    return {
      title:    document.title,
      headings: Array.from(document.querySelectorAll("h1,h2,h3,h4,td[class*='head' i]")).map(h => h.textContent?.trim().slice(0,80)).filter(Boolean),
      links:    Array.from(document.querySelectorAll("a[href]")).map(a => ({ text: a.textContent?.trim().slice(0,60), href: a.getAttribute("href") })).filter(l => l.text),
      text:     document.body?.innerText?.slice(0, 2000),
    };
  });

  console.log("  Title:", info.title);
  console.log("  Headings:", info.headings.join(" | "));
  console.log("  Links:", info.links.slice(0,20).map(l => `"${l.text}"`).join(", "));
  console.log("  Text snippet:\n" + info.text?.slice(0, 600));

  captured.pages["main"] = info;
  save();

  console.log(`\n${"=".repeat(60)}`);
  console.log("Browser open — navigate to Daily Service Worksheet manually.");
  console.log("Auto-saves every 10s to scripts/mybiz-recon.json\n");

  const iv = setInterval(() => {
    save();
    console.log(`[auto-save] ${captured.calls.length} calls | ${page.url().slice(0,80)}`);
  }, 10000);

  await new Promise(resolve => {
    browser.on("disconnected", () => { clearInterval(iv); resolve(); });
  });

  save();
  console.log("Done.");
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
