/**
 * Triggers GroundSwell dispatch — selects LIVE mode then clicks the action trigger.
 * Expects "outside of window" error during daytime (planning window 8PM-12:30AM ET).
 * Delete after use.
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const GS_URL = "https://groundswell.risingtide.us";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  args: ["--no-sandbox"],
});

const apiCalls = [];

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  await page.setRequestInterception(true);
  page.on("request", req => {
    if (req.method() === "POST" && req.url().includes("api.risingtide.us")) {
      const body = req.postData() ?? "";
      apiCalls.push({ type: "req", url: req.url(), body });
      if (!body.includes("operationName")) {
        console.log(`\n→ POST ${req.url().replace("https://api.risingtide.us", "")}\n  body: ${body.slice(0, 300)}`);
      }
    }
    req.continue();
  });

  page.on("response", async resp => {
    const url = resp.url();
    if (url.includes("api.risingtide.us") && resp.request().method() === "POST") {
      try {
        const text = await resp.text();
        if (!url.includes("graphql") || text.includes("error") || text.includes("window") || text.includes("dispatch")) {
          apiCalls.push({ type: "resp", status: resp.status(), url, body: text });
          console.log(`\n← ${resp.status()} ${url.replace("https://api.risingtide.us", "")}`);
          console.log("  Response:", text.slice(0, 500));
        }
      } catch {}
    }
  });

  // ── Login ──────────────────────────────────────────────────────────────────
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

  // ── Click mode dropdown (SANDBOX) ─────────────────────────────────────────
  console.log("\n── Step 1: Open mode select ──");
  const visibleSelects = await page.$$("div.MuiSelect-select");
  console.log(`Found ${visibleSelects.length} selects. Clicking second one (mode)...`);

  if (visibleSelects.length >= 2) {
    await visibleSelects[1].click();
    await new Promise(r => setTimeout(r, 1500));

    // Click LIVE via JS (avoids "not clickable" error with detached elements)
    const clicked = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll("[role='option'], .MuiMenuItem-root, li[data-value]"));
      const live = opts.find(el => el.getAttribute("data-value") === "LIVE" || el.textContent?.trim() === "LIVE");
      if (live) { live.click(); return true; }
      return false;
    });
    console.log("Clicked LIVE:", clicked);
    await new Promise(r => setTimeout(r, 500));
  }

  // Verify mode changed
  const modeVal = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll("div.MuiSelect-select"));
    return selects.map(s => s.textContent?.trim());
  });
  console.log("Select values after change:", modeVal);

  // ── Find and click the action trigger button ───────────────────────────────
  console.log("\n── Step 2: Find action button ──");

  // The "I WANT TO" text is on the page — find its containing button/clickable
  const actionClicked = await page.evaluate(() => {
    // Try MUI contained buttons
    const btns = Array.from(document.querySelectorAll("button.MuiButton-contained, button.MuiButton-root"));
    for (const btn of btns) {
      const txt = btn.textContent?.trim().toLowerCase();
      if (txt && (txt.includes("want") || txt.includes("submit") || txt.includes("run") || txt.includes("go") || txt.includes("trigger"))) {
        (btn).click();
        return `clicked: ${btn.textContent?.trim()}`;
      }
    }

    // Fallback: look for any button near the "I WANT TO" text
    const allText = Array.from(document.querySelectorAll("*"));
    for (const el of allText) {
      if (el.childNodes.length === 1 && el.textContent?.trim() === "I WANT TO") {
        // Find sibling or parent button
        let p = el.parentElement;
        for (let i = 0; i < 5; i++) {
          const btnsNearby = p?.querySelectorAll("button");
          if (btnsNearby?.length) {
            const lastBtn = btnsNearby[btnsNearby.length - 1];
            lastBtn.click();
            return `clicked nearby button: ${lastBtn.textContent?.trim()}`;
          }
          p = p?.parentElement ?? null;
        }
      }
    }
    return "no button found";
  });
  console.log("Action result:", actionClicked);

  await new Promise(r => setTimeout(r, 5000));

  // ── Check for response ─────────────────────────────────────────────────────
  const pageText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log("\n── Page text after trigger ──\n", pageText.slice(0, 800));

  const toasts = await page.evaluate(() => {
    const els = document.querySelectorAll("[class*='toast'], [class*='snack'], [role='alert'], [class*='noti'], [class*='Alert']");
    return Array.from(els).map(e => e.textContent?.trim()).filter(Boolean);
  });
  if (toasts.length) console.log("\n⚡ Toast/alert messages:", toasts);

  // Check for any dialog/modal
  const modals = await page.evaluate(() => {
    const els = document.querySelectorAll("[role='dialog'], .MuiDialog-root, [class*='Modal']");
    return Array.from(els).map(e => e.textContent?.trim().slice(0, 200)).filter(Boolean);
  });
  if (modals.length) console.log("\n📦 Modal content:", modals);

  console.log("\n── Captured non-GraphQL API calls ──");
  apiCalls.filter(c => !c.url?.includes("graphql")).forEach(c => {
    console.log(`${c.type === "req" ? "POST" : "←"+c.status} ${c.url?.replace("https://api.risingtide.us", "")}`);
    if (c.body) console.log("  ", c.body.slice(0, 200));
  });

  await new Promise(r => setTimeout(r, 3000));

} finally {
  await browser.close();
}
