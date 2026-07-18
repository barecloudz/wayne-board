/**
 * Executes the GroundSwell dispatch by clicking the ArrowCircleRight icon button.
 * Mode: LIVE, Action: Import
 * Expects "outside of window" error during daytime (planning window 8PM-12:30AM ET).
 * Delete after use.
 */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const GS_URL = "https://groundswell.risingtide.us";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  await page.setRequestInterception(true);
  let captureAll = false;
  page.on("request", req => {
    if (captureAll && req.url().includes("api.risingtide.us")) {
      const body = req.postData();
      const url = req.url().replace("https://api.risingtide.us", "");
      if (body) {
        console.log(`\n→ REQ ${req.method()} ${url}`);
        console.log("  BODY:", body.slice(0, 600));
      }
    }
    req.continue();
  });

  page.on("response", async resp => {
    if (captureAll && resp.url().includes("api.risingtide.us")) {
      try {
        const text = await resp.text();
        const url = resp.url().replace("https://api.risingtide.us", "");
        const method = resp.request().method();
        if (!url.includes("graphql") || method === "POST") {
          console.log(`\n← ${method} ${resp.status()} ${url}`);
          if (text.length < 800) console.log("  RESP:", text);
          else console.log("  RESP:", text.slice(0, 600), "...");
        }
      } catch {}
    }
  });

  await page.goto(GS_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 1000));

  if (page.url().includes("auth.risingtide.us")) {
    await page.waitForSelector("input#username", { timeout: 10000 });
    await page.type("input#username", "bnardoni87@gmail.com");
    await page.click('button[type="submit"]');
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.type('input[type="password"]', "LightningZeus#4");
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 });
  }
  await new Promise(r => setTimeout(r, 5000));
  console.log("✓ Logged in:", page.url());

  captureAll = true;
  console.log("\n=== CAPTURE MODE ON ===\n");

  // Step 1: Ensure action = "Import" (first select)
  const visibleSelects = await page.$$("div.MuiSelect-select");
  const vals = await page.evaluate(() =>
    Array.from(document.querySelectorAll("div.MuiSelect-select")).map(s => s.textContent?.trim())
  );
  console.log("Current selects:", vals);

  // Step 2: Set mode to LIVE
  if (visibleSelects.length >= 2) {
    await visibleSelects[1].click();
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll("[role='option'], .MuiMenuItem-root"));
      const live = opts.find(el => el.textContent?.trim() === "LIVE");
      if (live) live.click();
    });
    await new Promise(r => setTimeout(r, 500));
    const newVals = await page.evaluate(() =>
      Array.from(document.querySelectorAll("div.MuiSelect-select")).map(s => s.textContent?.trim())
    );
    console.log("After LIVE select:", newVals);
  }

  // Step 3: Find and click ArrowCircleRight button using data-testid
  console.log("\n→ Finding ArrowCircleRight execute button...");
  const executeBtn = await page.$('[data-testid="ArrowCircleRightIcon"]');
  if (executeBtn) {
    const btnEl = await page.evaluateHandle(el => el.closest("button"), executeBtn);
    if (btnEl) {
      console.log("✓ Found execute button (parent)");
      // Click via JS to avoid detachment issues
      await page.evaluate(el => el?.click(), btnEl);
      console.log("✓ Clicked via JS!");
    }
  } else {
    // Fallback: click by coordinates (306, 257)
    console.log("→ Fallback: clicking at (306, 257)");
    await page.mouse.click(306, 257);
  }

  await new Promise(r => setTimeout(r, 3000));

  // Check for confirmation dialog and click Proceed
  const hasDialog = await page.evaluate(() => {
    const els = document.querySelectorAll("[role='dialog'], .MuiDialog-root, .MuiModal-root");
    return Array.from(els).some(e => e.textContent?.includes("Proceed"));
  });
  if (hasDialog) {
    console.log("✓ Confirmation dialog found — clicking Proceed...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const proceed = btns.find(b => b.textContent?.trim() === "Proceed");
      if (proceed) proceed.click();
    });
    console.log("✓ Clicked Proceed");
  } else {
    console.log("⚠ No confirmation dialog found");
  }

  await new Promise(r => setTimeout(r, 30000));

  writeFileSync("scripts/ss-gs-execute-result.png", await page.screenshot());
  console.log("✓ Screenshot saved");

  // Check for toasts/notifications
  const toasts = await page.evaluate(() => {
    const els = document.querySelectorAll(
      "[class*='snack'], [class*='toast'], [role='alert'], [class*='Alert'], [class*='MuiAlert'], " +
      "[class*='notification'], [class*='Notification'], .MuiSnackbar-root"
    );
    return Array.from(els).map(e => ({
      text: e.textContent?.trim().slice(0, 200),
      class: e.className?.toString?.().slice(0, 60),
    })).filter(e => e.text);
  });
  console.log("\n⚡ Toast/notifications:", JSON.stringify(toasts, null, 2));

  // Check for dialog
  const dialogs = await page.evaluate(() => {
    const els = document.querySelectorAll("[role='dialog'], .MuiDialog-root, .MuiModal-root");
    return Array.from(els).map(e => e.textContent?.trim().slice(0, 300)).filter(Boolean);
  });
  if (dialogs.length) console.log("\n📦 Dialogs:", dialogs);

  // Check page text for error messages
  const pageText = await page.evaluate(() => document.body.innerText);
  if (pageText.includes("window") || pageText.includes("Window") || pageText.includes("outside") || pageText.includes("planning")) {
    console.log("\n🎯 FOUND WINDOW/PLANNING TEXT:");
    const idx = Math.max(0, pageText.indexOf("window"));
    console.log(pageText.slice(Math.max(0, idx - 100), idx + 200));
  }

  await new Promise(r => setTimeout(r, 3000));

} finally {
  await browser.close();
}
