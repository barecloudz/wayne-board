/**
 * Screenshots the GroundSwell dashboard and inspects the dispatch control area.
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

  // Screenshot the whole page
  writeFileSync("scripts/ss-gs-dashboard-full.png", await page.screenshot());
  console.log("✓ Full screenshot saved");

  // Get the HTML around "I WANT TO" text
  const htmlAroundControl = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent?.includes("I WANT TO")) {
        // Get the grandparent's outerHTML
        let el = node.parentElement;
        for (let i = 0; i < 8; i++) {
          if (el) el = el.parentElement;
        }
        return el?.outerHTML?.slice(0, 3000) ?? "not found";
      }
    }
    return "not found";
  });
  console.log("\n── HTML around 'I WANT TO' control ──\n", htmlAroundControl);

  // Change to LIVE and get screenshot
  const visibleSelects = await page.$$("div.MuiSelect-select");
  if (visibleSelects.length >= 2) {
    await visibleSelects[1].click();
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll("[role='option'], .MuiMenuItem-root, li[data-value]"));
      const live = opts.find(el => el.getAttribute("data-value") === "LIVE" || el.textContent?.trim() === "LIVE");
      if (live) live.click();
    });
    await new Promise(r => setTimeout(r, 500));
  }

  writeFileSync("scripts/ss-gs-dashboard-live.png", await page.screenshot());
  console.log("✓ LIVE mode screenshot saved");

  // Get ALL clickable elements in the control area
  const controlElements = await page.evaluate(() => {
    // Find the "I WANT TO" text and get all interactive siblings/children
    const allEls = Array.from(document.querySelectorAll("*"));
    const iwantEl = allEls.find(el => el.children.length === 0 && el.textContent?.trim() === "I WANT TO");
    if (!iwantEl) return "I WANT TO element not found";

    // Go up 10 levels and get all children
    let container = iwantEl;
    for (let i = 0; i < 10; i++) {
      container = container.parentElement ?? container;
      const rect = container.getBoundingClientRect();
      if (rect.width > 400) break; // Found container
    }

    return {
      containerTag: container.tagName,
      containerClass: container.className,
      containerHTML: container.outerHTML.slice(0, 2000),
      allButtons: Array.from(container.querySelectorAll("button, [role='button'], [tabindex='0']:not(input):not(select)"))
        .map(el => ({
          tag: el.tagName,
          text: el.textContent?.trim().slice(0, 60),
          class: el.className?.slice(0, 80),
          disabled: el.getAttribute("disabled") !== null || el.getAttribute("aria-disabled") === "true",
          tabindex: el.getAttribute("tabindex"),
        })),
    };
  });
  console.log("\n── Control elements ──\n", JSON.stringify(controlElements, null, 2).slice(0, 3000));

  await new Promise(r => setTimeout(r, 2000));

} finally {
  await browser.close();
}
