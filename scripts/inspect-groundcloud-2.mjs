/**
 * Inspector v2 — navigates to Dashboard (not Overview map), waits for Vue render,
 * finds delivered/exception count selectors.
 * Writes NO customer data. Delete after use.
 */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const LOGIN_URL = "https://www.groundcloud.io/dashboard/login/";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // ── Login ──────────────────────────────────────────────────────────────────
  console.log("→ Logging in...");
  await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

  await page.type("#id_auth-username", process.env.GC_USER || "Blake742Logistics");
  await page.type("#id_auth-password", process.env.GC_PASS || "dowell2026");

  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
    page.keyboard.press("Enter"),
  ]);
  console.log("✓ Logged in, URL:", page.url());

  // ── Wait for sidebar to render ─────────────────────────────────────────────
  await page.waitForSelector(".gc-sidebar", { timeout: 15000 });
  console.log("✓ Sidebar found");

  // Dump all sidebar links so we can see what nav items exist
  const sidebarLinks = await page.evaluate(() =>
    [...document.querySelectorAll(".gc-sidebar a, .dashboard-sidebar a, nav a")]
      .map(a => ({ text: a.innerText?.trim(), href: a.href }))
      .filter(a => a.text)
  );
  console.log("Sidebar links:", JSON.stringify(sidebarLinks, null, 2));
  writeFileSync("scripts/sidebar-links.json", JSON.stringify(sidebarLinks, null, 2));

  // Screenshot overview/map
  writeFileSync("scripts/ss-overview.png", await page.screenshot());
  console.log("✓ Screenshot: overview (map)");

  // ── Navigate to Dashboard section ─────────────────────────────────────────
  // Try clicking sidebar item that says "Dashboard" (not Overview)
  const dashLink = sidebarLinks.find(l =>
    l.text.toLowerCase() === "dashboard" && !l.href.includes("login")
  );
  if (dashLink) {
    console.log("→ Clicking Dashboard link:", dashLink.href);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
      page.goto(dashLink.href, { waitUntil: "networkidle2" }),
    ]);
  } else {
    // Try known URL patterns
    const today = new Date().toISOString().slice(0, 10);
    const candidates = [
      `https://www.groundcloud.io/dashboard/kpi/?date=${today}`,
      `https://www.groundcloud.io/dashboard/report/?date=${today}`,
      `https://www.groundcloud.io/dashboard/summary/?date=${today}`,
      `https://www.groundcloud.io/dashboard/operations/?date=${today}`,
    ];
    for (const url of candidates) {
      console.log("→ Trying:", url);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});
      const title = await page.title();
      const body = await page.evaluate(() => document.body.innerText?.slice(0, 200));
      console.log(`  title: ${title} | body: ${body}`);
      writeFileSync(`scripts/ss-${url.split("/")[4]}.png`, await page.screenshot());
    }
  }

  // Wait extra time for Vue to fully render
  await new Promise(r => setTimeout(r, 5000));
  writeFileSync("scripts/ss-dashboard.png", await page.screenshot());
  console.log("✓ Screenshot: dashboard view");
  console.log("→ URL now:", page.url());

  // ── Capture full DOM structure (no PII — tags/classes/text snippets only) ──
  const structure = await page.evaluate(() => {
    function getStructure(el, depth = 0) {
      if (depth > 6) return "";
      const tag = el.tagName?.toLowerCase();
      if (!tag) return "";
      const cls = typeof el.className === "string" ? el.className.trim() : "";
      const id  = el.id || "";
      const txt = el.children.length === 0
        ? (el.innerText?.trim().slice(0, 40) || "")
        : "";
      let out = `${"  ".repeat(depth)}<${tag}${id ? ` id="${id}"` : ""}${cls ? ` class="${cls}"` : ""}>${txt}\n`;
      for (const child of el.children) out += getStructure(child, depth + 1);
      return out;
    }
    return getStructure(document.body).slice(0, 15000);
  });
  writeFileSync("scripts/dashboard-structure.txt", structure);
  console.log("✓ dashboard-structure.txt written");

  // ── Find numeric KPI elements ──────────────────────────────────────────────
  const kpiElements = await page.evaluate(() => {
    const results = [];
    for (const el of document.querySelectorAll("*")) {
      const text = el.innerText?.trim();
      if (!text) continue;
      // Look for numeric-ish values (counts) with relevant nearby labels
      if (/^\d+$/.test(text) && el.children.length === 0) {
        const parent = el.parentElement;
        const grandparent = parent?.parentElement;
        results.push({
          tag: el.tagName,
          class: el.className,
          id: el.id,
          text,
          parentClass: parent?.className,
          parentText: parent?.innerText?.trim().slice(0, 60),
          grandparentClass: grandparent?.className,
        });
      }
    }
    return results.slice(0, 80);
  });
  console.log("Numeric elements:", JSON.stringify(kpiElements, null, 2));
  writeFileSync("scripts/kpi-elements.json", JSON.stringify(kpiElements, null, 2));

  // ── Look for "delivered" / "exception" text anywhere in page ──────────────
  const relevantText = await page.evaluate(() => {
    const keywords = ["deliver", "exception", "package", "stop", "route", "complete"];
    const results = [];
    for (const el of document.querySelectorAll("*")) {
      const text = el.innerText?.trim().toLowerCase();
      if (!text || el.children.length > 3) continue;
      for (const kw of keywords) {
        if (text.includes(kw) && text.length < 100) {
          results.push({
            tag: el.tagName,
            class: el.className,
            id: el.id,
            text: el.innerText?.trim(),
          });
          break;
        }
      }
    }
    return results.slice(0, 50);
  });
  console.log("Relevant text elements:", JSON.stringify(relevantText, null, 2));
  writeFileSync("scripts/relevant-text.json", JSON.stringify(relevantText, null, 2));

} finally {
  await browser.close();
}
