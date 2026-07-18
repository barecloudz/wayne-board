/**
 * Finds and clicks the dispatch trigger in GroundSwell.
 * Dismisses the AI chat first, then finds the action button.
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

const triggers = [];
page => page.on("response", async resp => {
  if (resp.url().includes("api.risingtide.us") && resp.request().method() === "POST") {
    try {
      const text = await resp.text();
      triggers.push({ status: resp.status(), url: resp.url(), body: text });
    } catch {}
  }
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  await page.setRequestInterception(true);
  page.on("request", req => req.continue());
  page.on("response", async resp => {
    if (resp.url().includes("api.risingtide.us") && resp.request().method() === "POST") {
      try {
        const text = await resp.text();
        const url = resp.url().replace("https://api.risingtide.us", "");
        if (!url.includes("graphql")) {
          triggers.push({ status: resp.status(), url, body: text });
          console.log(`\n← ${resp.status()} ${url}`);
          console.log("  ", text.slice(0, 400));
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

  // Dismiss AI chat if present
  await page.evaluate(() => {
    const closeBtns = Array.from(document.querySelectorAll("button, [role='button']"));
    const closeBtn = closeBtns.find(b => b.textContent?.trim().toLowerCase().includes("close") ||
      b.getAttribute("aria-label")?.toLowerCase().includes("close"));
    if (closeBtn) closeBtn.click();
    // Also try clicking outside any modal
    const overlay = document.querySelector(".atlwdg-trigger");
    if (overlay) overlay.style.display = "none";
  });
  await new Promise(r => setTimeout(r, 1000));

  writeFileSync("scripts/ss-gs-clean.png", await page.screenshot());
  console.log("✓ Clean screenshot saved");

  // Get the left sidebar HTML
  const sidebarHtml = await page.evaluate(() => {
    // Find elements containing "I WANT TO" anywhere in their text
    const allEls = Array.from(document.querySelectorAll("*"));
    for (const el of allEls) {
      if (el.innerText?.includes("I WANT TO") && el.children.length < 20 && el.children.length > 0) {
        return {
          tag: el.tagName,
          class: el.className,
          html: el.outerHTML.slice(0, 4000),
        };
      }
    }

    // Try the left sidebar / nav area
    const sidebar = document.querySelector("nav, aside, [class*='sidebar'], [class*='Sidebar'], [class*='panel'], [class*='Panel']");
    return {
      tag: sidebar?.tagName,
      class: sidebar?.className,
      html: sidebar?.outerHTML?.slice(0, 4000) ?? "no sidebar found",
    };
  });
  console.log("\n── Sidebar HTML ──\n", JSON.stringify(sidebarHtml, null, 2).slice(0, 4000));

  // Get ALL elements with "I WANT TO" anywhere
  const iwElements = await page.evaluate(() => {
    const results = [];
    const all = document.querySelectorAll("*");
    for (const el of all) {
      if (el.childNodes.length > 0 && Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent?.includes("I WANT TO"))) {
        results.push({
          tag: el.tagName,
          class: el.className?.slice(0, 80),
          html: el.outerHTML?.slice(0, 300),
          rect: JSON.stringify(el.getBoundingClientRect()),
        });
      }
    }
    return results;
  });
  console.log("\n── 'I WANT TO' elements ──\n", JSON.stringify(iwElements, null, 2));

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
  }

  writeFileSync("scripts/ss-gs-live-clean.png", await page.screenshot());
  console.log("✓ LIVE mode screenshot saved");

  // Now try every element in the control area
  const allInteractiveInLeft = await page.evaluate(() => {
    // Get the leftmost 300px of the page
    const all = Array.from(document.querySelectorAll("*"));
    return all
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.left < 280 && rect.width > 0 && rect.height > 0 && rect.top < 400;
      })
      .map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim().replace(/\s+/g, " ").slice(0, 60),
        class: el.className?.slice(0, 60),
        rect: JSON.stringify(el.getBoundingClientRect()),
        tabindex: el.getAttribute("tabindex"),
        role: el.getAttribute("role"),
        clickable: el.tagName === "BUTTON" || el.getAttribute("role") === "button" || el.getAttribute("tabindex") === "0",
      }))
      .filter(el => el.clickable || el.tag === "INPUT" || el.tag === "SELECT")
      .slice(0, 30);
  });
  console.log("\n── Interactive elements in left sidebar ──\n", JSON.stringify(allInteractiveInLeft, null, 2));

  await new Promise(r => setTimeout(r, 2000));

} finally {
  await browser.close();
}
