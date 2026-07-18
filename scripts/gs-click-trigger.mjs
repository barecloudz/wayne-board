/**
 * Clicks the dispatch trigger in GroundSwell by coordinates.
 * The UI shows "Import from LIVE" with a small icon on the right side.
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

  const allResponses = [];
  page.on("response", async resp => {
    if (resp.url().includes("api.risingtide.us")) {
      try {
        const text = await resp.text();
        const url = resp.url().replace("https://api.risingtide.us", "");
        allResponses.push({ method: resp.request().method(), status: resp.status(), url, body: text.slice(0, 400) });
        if (!url.includes("graphql") || text.includes("window") || text.includes("dispatch") || text.includes("error")) {
          console.log(`${resp.request().method()} ${resp.status()} ${url}: ${text.slice(0, 200)}`);
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
  }

  // Find the "I WANT TO" container by looking for specific text content
  const controlInfo = await page.evaluate(() => {
    // Find all elements that contain both "I WANT" and "TO" in their visual text
    const getVisibleText = el => {
      return el.innerText ?? el.textContent ?? "";
    };

    const results = [];
    const all = document.querySelectorAll("*");
    for (const el of all) {
      const txt = getVisibleText(el);
      if (txt.includes("I WANT") && el.clientWidth > 0 && el.clientHeight > 0 && el.children.length < 30) {
        const rect = el.getBoundingClientRect();
        results.push({
          tag: el.tagName,
          text: txt.trim().replace(/\s+/g, " ").slice(0, 100),
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          children: el.children.length,
        });
      }
    }
    return results.slice(0, 10);
  });
  console.log("\n── I WANT TO containers ──\n", JSON.stringify(controlInfo, null, 2));

  // Try to find the button/icon using a more specific approach
  // The control is at approximately x=155, y=80 based on screenshot
  // Let's first inspect what's in that area
  const elemAtPos = await page.evaluate(() => {
    // Check what elements are at x=160, y=80 (the icon area)
    const el = document.elementFromPoint(160, 80);
    if (!el) return "nothing at 160,80";
    return {
      tag: el.tagName,
      class: el.className?.toString?.()?.slice(0, 80),
      text: el.textContent?.trim().slice(0, 50),
      title: el.getAttribute("title"),
      aria: el.getAttribute("aria-label"),
      html: el.outerHTML.slice(0, 200),
    };
  });
  console.log("\n── Element at (160, 80) ──", JSON.stringify(elemAtPos, null, 2));

  // Try clicking coordinates where the import icon seems to be
  // Based on screenshot: the icon is to the right of "Import from LIVE" input ~x=158, y=82
  for (const [x, y] of [[158, 82], [165, 82], [155, 80], [170, 80], [145, 80], [160, 75], [160, 85]]) {
    const el = await page.evaluate((cx, cy) => {
      const e = document.elementFromPoint(cx, cy);
      return e ? { tag: e.tagName, class: e.className?.toString?.().slice(0, 60), text: e.textContent?.trim().slice(0, 30) } : null;
    }, x, y);
    console.log(`(${x}, ${y}):`, JSON.stringify(el));
  }

  // Try clicking the element that most resembles the action trigger
  // From the screenshot it looks like a small icon/svg button
  const svgBtns = await page.evaluate(() => {
    const results = [];
    const rect_in_sidebar = (el) => {
      const r = el.getBoundingClientRect();
      return r.left < 250 && r.top < 200 && r.width > 0 && r.height > 0;
    };

    // SVG elements in the sidebar area
    const svgs = document.querySelectorAll("svg, button svg, [class*='icon'], [class*='Icon']");
    for (const svg of svgs) {
      if (rect_in_sidebar(svg)) {
        const r = svg.getBoundingClientRect();
        results.push({
          tag: svg.tagName,
          parent: svg.parentElement?.tagName,
          parentClass: svg.parentElement?.className?.toString?.().slice(0, 60),
          center: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) },
        });
      }
    }
    return results;
  });
  console.log("\n── SVG/icon elements in sidebar ──\n", JSON.stringify(svgBtns, null, 2));

  // Take a zoomed screenshot of the left sidebar
  const clip = { x: 0, y: 0, width: 220, height: 300 };
  writeFileSync("scripts/ss-gs-sidebar-zoom.png", await page.screenshot({ clip }));
  console.log("✓ Zoomed sidebar screenshot saved");

  // Try clicking the first SVG button in the sidebar
  if (svgBtns.length > 0) {
    const { x, y } = svgBtns[0].center;
    console.log(`\n→ Clicking SVG button at (${x}, ${y})...`);
    await page.mouse.click(x, y);
    await new Promise(r => setTimeout(r, 3000));
    writeFileSync("scripts/ss-gs-after-svg-click.png", await page.screenshot());
    console.log("✓ Screenshot after SVG click");

    const toastText = await page.evaluate(() => {
      const els = document.querySelectorAll("[class*='toast'], [class*='snack'], [class*='notification'], [class*='alert'], [role='alert'], [class*='Alert'], [class*='Snack']");
      return Array.from(els).map(e => e.textContent?.trim()).filter(Boolean);
    });
    console.log("Toasts:", toastText);
  }

  await new Promise(r => setTimeout(r, 3000));

  console.log("\n── Non-graphql API responses captured ──");
  allResponses.filter(r => !r.url.includes("graphql")).forEach(r =>
    console.log(`${r.method} ${r.status} ${r.url}: ${r.body.slice(0, 100)}`)
  );

} finally {
  await browser.close();
}
