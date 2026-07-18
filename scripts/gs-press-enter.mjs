/**
 * After setting LIVE mode, press Enter or click the execute area.
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
  page.on("request", req => req.continue());
  page.on("response", async resp => {
    if (resp.url().includes("api.risingtide.us")) {
      try {
        const text = await resp.text();
        const url = resp.url().replace("https://api.risingtide.us", "");
        if (!url.includes("graphql") || text.includes("window") || text.includes("dispatch") || text.includes("planning") || text.includes("error")) {
          console.log(`${resp.request().method()} ${resp.status()} ${url}: ${text.slice(0, 400)}`);
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
  console.log("✓ Logged in");

  // Set mode to LIVE
  const visibleSelects = await page.$$("div.MuiSelect-select");
  if (visibleSelects.length >= 2) {
    await visibleSelects[1].click();
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll("[role='option'], .MuiMenuItem-root"));
      const live = opts.find(el => el.textContent?.trim() === "LIVE");
      if (live) live.click();
    });
    await new Promise(r => setTimeout(r, 500));
    console.log("✓ Set to LIVE mode");
  }

  // Find the exact "I WANT TO" child elements
  const iwantChildren = await page.evaluate(() => {
    const all = document.querySelectorAll("*");
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.top > 195 && r.top < 215 && r.left > 25 && r.left < 45 && r.width > 200 && r.width < 320 && r.height > 20 && r.height < 40) {
        const children = Array.from(el.children).map(c => ({
          tag: c.tagName,
          class: c.className?.toString?.().slice(0, 80),
          text: c.textContent?.trim().slice(0, 40),
          rect: JSON.stringify(c.getBoundingClientRect()),
          clickable: c.tagName === "BUTTON" || c.getAttribute?.("role") === "button" || c.style?.cursor === "pointer",
          html: c.outerHTML?.slice(0, 200),
        }));
        return {
          tag: el.tagName,
          class: el.className?.toString?.().slice(0, 80),
          rect: JSON.stringify(r),
          children,
        };
      }
    }
    return null;
  });
  console.log("\n── I WANT TO row children ──\n", JSON.stringify(iwantChildren, null, 2));

  // Try clicking right side of "I WANT TO" row (where execute button might be)
  // From DOM: top=200.86, left=32, width=296, height=30 → right side x=300-310, y=215
  const clickTargets = [
    [310, 216], // Right side of I WANT TO row
    [320, 216],
    [295, 216],
    [180, 216], // Center
    [180, 220], // Slightly below
    [180, 230], // Below I WANT TO
  ];

  for (const [x, y] of clickTargets) {
    const el = await page.evaluate((cx, cy) => {
      const e = document.elementFromPoint(cx, cy);
      return e ? {
        tag: e.tagName,
        class: e.className?.toString?.().slice(0, 60),
        text: e.textContent?.trim().slice(0, 30),
        html: e.outerHTML?.slice(0, 100),
      } : null;
    }, x, y);
    console.log(`(${x}, ${y}):`, JSON.stringify(el));
  }

  // Try pressing Enter after the select (simulates form submission)
  console.log("\n→ Pressing Enter on mode select...");
  await visibleSelects[1].click(); // Focus the select
  await page.keyboard.press("Enter");
  await new Promise(r => setTimeout(r, 3000));

  const toastsAfterEnter = await page.evaluate(() => {
    const els = document.querySelectorAll("[class*='snack'], [class*='toast'], [role='alert'], [class*='Alert']");
    return Array.from(els).map(e => e.textContent?.trim()).filter(Boolean);
  });
  console.log("Toasts after Enter:", toastsAfterEnter);

  writeFileSync("scripts/ss-gs-after-enter.png", await page.screenshot());
  console.log("✓ Screenshot after Enter");

  // Try clicking any button-like element in the action area (y=190-250)
  console.log("\n── Trying to find submit button in action area ──");
  const actionBtns = await page.evaluate(() => {
    const all = document.querySelectorAll("button, [role='button'], svg");
    return Array.from(all).filter(el => {
      const r = el.getBoundingClientRect();
      return r.top > 185 && r.top < 260 && r.left > 0 && r.left < 400 && r.width > 0 && r.height > 0;
    }).map(el => ({
      tag: el.tagName,
      class: el.className?.toString?.().slice(0, 80),
      text: el.textContent?.trim().slice(0, 40),
      rect: JSON.stringify(el.getBoundingClientRect()),
      html: el.outerHTML?.slice(0, 150),
    }));
  });
  console.log("Action area buttons/SVGs:", JSON.stringify(actionBtns, null, 2));

  // If we found any action button, click it
  if (actionBtns.length > 0) {
    for (const btn of actionBtns) {
      const r = JSON.parse(btn.rect);
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      console.log(`→ Clicking ${btn.tag} "${btn.text}" at (${cx}, ${cy})`);
      await page.mouse.click(cx, cy);
      await new Promise(r => setTimeout(r, 3000));
      writeFileSync("scripts/ss-gs-after-btn-click.png", await page.screenshot());

      const toasts = await page.evaluate(() => {
        const els = document.querySelectorAll("[class*='snack'], [class*='toast'], [role='alert'], [class*='Alert'], [class*='MuiAlert']");
        return Array.from(els).map(e => e.textContent?.trim()).filter(Boolean);
      });
      console.log("Toasts:", toasts);
      if (toasts.length > 0) break;
    }
  }

  await new Promise(r => setTimeout(r, 3000));

} finally {
  await browser.close();
}
