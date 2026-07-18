/**
 * MyGroundBiz DSW scraper.
 * Login → click "Daily Service" directly from FCC Links widget on dashboard
 *       → DSW opens in new tab → set date → search → scrape.
 *
 * Driver-level metrics only. NO customer PII.
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

const USERNAME   = process.env.DRO_USERNAME;
const PASSWORD   = process.env.DRO_PASSWORD;
const MYBIZ_BASE = "https://mybizaccount.fedex.com";

// Date to pull — yesterday by default
const TARGET_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  // DSW likely uses M/D/YYYY format
  return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
})();

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
async function ss(page, name) {
  const p = path.join(__dirname, `dsw-${name}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  console.log(`📸 dsw-${name}.png`);
}

// Get all current page targets
async function getAllPages(browser) {
  const targets = browser.targets().filter(t => t.type() === "page");
  const pages = await Promise.all(targets.map(t => t.page()));
  return pages.filter(Boolean);
}

async function run() {
  console.log(`Pulling DSW for date: ${TARGET_DATE}`);
  console.log("Launching browser...");

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1600, height: 900 },
    args: ["--no-sandbox"],
  });

  const page = await browser.newPage();
  page.on("dialog", async d => { try { await d.dismiss(); } catch {} });

  try {
    // ── Step 1: Login ────────────────────────────────────────────────────────
    console.log("\n→ Logging in...");
    await page.goto(`${MYBIZ_BASE}/my.policy`, { waitUntil: "networkidle2", timeout: 30000 });
    await wait(1500);

    const signInEl = await page.$('input[value="Sign In"]') || await page.$('input[type="submit"]');
    if (signInEl) await signInEl.click();
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await wait(2000);

    try {
      await page.waitForSelector('button::-p-text(Cancel)', { timeout: 3000 });
      await page.click('button::-p-text(Cancel)');
      await wait(1000);
    } catch {}

    await page.waitForSelector('input[name="identifier"], input[type="text"]', { timeout: 10000 });
    const userField = await page.$('input[name="identifier"]') || await page.$('input[type="text"]');
    if (userField) { await userField.click({ clickCount: 3 }); await userField.type(USERNAME, { delay: 40 }); }
    const nextBtn = await page.$('input[type="submit"], button[type="submit"]');
    if (nextBtn) await nextBtn.click(); else await page.keyboard.press("Enter");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});
    await wait(2000);

    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    const passField = await page.$('input[type="password"]');
    if (passField) { await passField.click({ clickCount: 3 }); await passField.type(PASSWORD, { delay: 40 }); }
    const pwBtn = await page.$('input[type="submit"], button[type="submit"]');
    if (pwBtn) await pwBtn.click(); else await page.keyboard.press("Enter");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await wait(5000);

    console.log("✅ Logged in. Title:", await page.title());
    await ss(page, "01-dashboard");

    // Dump all links to find "Daily Service"
    const allLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a"))
        .map(a => ({ text: a.textContent?.trim(), href: a.getAttribute("href") }))
        .filter(l => l.text)
    );
    const dswLink = allLinks.find(l => l.text.toLowerCase().includes("daily service"));
    console.log("\nAll links with 'daily' or 'dsw':", allLinks.filter(l => l.text.toLowerCase().includes("daily") || l.text.toLowerCase().includes("dsw")));
    console.log("DSW link:", dswLink);

    // ── Step 2: Click "Daily Service Wk" from FCC Links iframe ──────────────
    console.log("\n→ Clicking Daily Service link (searching iframes)...");
    await wait(2000);

    const pagesBefore = await getAllPages(browser);
    console.log("  Pages before click:", pagesBefore.length);

    let clicked = false;

    // Search all frames for the Daily Service link
    const frames = page.frames();
    console.log("  Frames:", frames.length);
    for (const frame of frames) {
      try {
        const el = await frame.$('a::-p-text(Daily Service Wk)') ||
                   await frame.$('a::-p-text(Daily Service)');
        if (el) {
          const txt = await el.evaluate(e => e.textContent?.trim());
          console.log(`  Found in frame: "${txt}"`);
          await el.click();
          clicked = true;
          break;
        }
      } catch {}
    }

    if (!clicked) throw new Error("Could not find Daily Service link in any frame");

    // Wait for new tab to appear
    console.log("  Waiting for DSW tab...");
    await wait(6000);

    const pagesAfter = await getAllPages(browser);
    console.log("  Pages after click:", pagesAfter.length);

    let dswPage = null;

    if (pagesAfter.length > pagesBefore.length) {
      // New page opened
      const newPages = pagesAfter.filter(p => !pagesBefore.find(pb => pb === p));
      dswPage = newPages[newPages.length - 1];
      dswPage.on("dialog", async d => { try { await d.dismiss(); } catch {} });
      await wait(4000);
      console.log("  New tab URL:", dswPage.url().slice(0, 120));
    } else {
      // Navigated in same page
      dswPage = page;
      console.log("  Same tab, URL:", page.url().slice(0, 120));
    }

    await wait(3000);
    await ss(dswPage, "02-dsw-initial");
    console.log("  DSW title:", await dswPage.title());

    // Get page structure — look for date input and search button
    const pageStruct = await dswPage.evaluate(() => ({
      title: document.title,
      inputs: Array.from(document.querySelectorAll("input,select")).map(i => ({
        type: i.type, name: i.name, id: i.id, value: i.value, placeholder: i.placeholder,
      })),
      buttons: Array.from(document.querySelectorAll("button,input[type=submit],input[type=button]")).map(b => ({
        text: b.textContent?.trim() || b.value, type: b.type, name: b.name,
      })),
      headings: Array.from(document.querySelectorAll("h1,h2,h3,th")).map(h => h.textContent?.trim().slice(0,60)).filter(Boolean),
      text: document.body?.innerText?.slice(0, 1000),
    }));

    console.log("\n  Inputs:", JSON.stringify(pageStruct.inputs));
    console.log("  Buttons:", JSON.stringify(pageStruct.buttons));
    console.log("  Headings:", pageStruct.headings.join(" | ").slice(0, 300));
    console.log("  Text:\n" + pageStruct.text?.slice(0, 600));

    // ── Step 3: Set date and search ───────────────────────────────────────────
    console.log(`\n→ Setting date to ${TARGET_DATE} and searching...`);

    // Set date via JS (inputs may be in nested frames or not directly clickable)
    const dateSet = await dswPage.evaluate((date) => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      let set = 0;
      for (const inp of inputs.slice(0, 2)) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(inp, date);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          inp.value = date;
        }
        set++;
      }
      return set;
    }, TARGET_DATE);
    console.log(`  Set ${dateSet} date inputs to ${TARGET_DATE}`);

    // Also try iframes within DSW page
    for (const frame of dswPage.frames()) {
      try {
        await frame.evaluate((date) => {
          const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
          for (const inp of inputs.slice(0, 2)) {
            inp.value = date;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, TARGET_DATE);
      } catch {}
    }

    await wait(1000);

    // Click Search — try main page and iframes
    let searchClicked = false;
    for (const frame of [dswPage, ...dswPage.frames()]) {
      try {
        const searchBtn = await frame.$('button::-p-text(Search)');
        if (searchBtn) {
          await searchBtn.click();
          searchClicked = true;
          console.log("  Clicked search — waiting for data...");
          break;
        }
      } catch {}
    }
    if (!searchClicked) {
      // Try JS click
      await dswPage.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const btn = btns.find(b => b.textContent?.trim() === "Search");
        if (btn) btn.click();
      });
      console.log("  Search clicked via JS");
    }

    // Wait for AJAX table refresh
    await wait(8000);

    await ss(dswPage, "03-dsw-results");

    // ── Step 4: Scrape the results table ──────────────────────────────────────
    console.log("\n→ Scraping results...");

    const scraped = await dswPage.evaluate(() => {
      const result = { title: document.title, headers: [], rows: [], allText: "" };
      result.allText = document.body?.innerText?.slice(0, 3000) || "";
      result.headers = Array.from(document.querySelectorAll("th"))
        .map(th => th.textContent?.trim().replace(/\s+/g, " "))
        .filter(Boolean);
      const trs = Array.from(document.querySelectorAll("tr"));
      for (const tr of trs) {
        const cells = Array.from(tr.querySelectorAll("td"))
          .map(td => td.textContent?.trim().replace(/\s+/g, " ") || "");
        if (cells.length > 3) result.rows.push(cells);
      }
      return result;
    });

    console.log("  Headers:", scraped.headers.join(" | ").slice(0, 400));
    console.log("  Rows:", scraped.rows.length);
    console.log("  Text:\n" + scraped.allText.slice(0, 800));

    scraped.rows.slice(0, 8).forEach((r, i) => {
      console.log(`  row[${i}]: ${r.join(" | ").slice(0, 150)}`);
    });

    fs.writeFileSync(path.join(__dirname, "dsw-raw.json"), JSON.stringify(scraped, null, 2));
    console.log("\n✅ Saved to scripts/dsw-raw.json");

    console.log("\nBrowser open. Close when done.");
    await new Promise(resolve => browser.on("disconnected", resolve));

  } catch (err) {
    console.error("\nFatal:", err.message);
    try { await ss(page, "error"); } catch {}
    await wait(60000);
  } finally {
    await browser.close().catch(() => {});
  }
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
