/**
 * One-time inspector — finds dashboard structure, takes screenshots.
 * Writes NO customer data anywhere. Delete after use.
 */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL    = "https://www.groundcloud.io/dashboard/login/";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false, // visible so we can see what's happening
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  console.log("→ Navigating to login...");
  await page.goto(URL, { waitUntil: "networkidle2" });
  writeFileSync("scripts/screenshot-1-login.png", await page.screenshot());
  console.log("✓ Screenshot 1: login page");

  // Dump all input fields on login page
  const inputs = await page.evaluate(() =>
    [...document.querySelectorAll("input")].map(i => ({
      name: i.name, id: i.id, type: i.type, placeholder: i.placeholder,
    }))
  );
  console.log("Login page inputs:", JSON.stringify(inputs, null, 2));

  // Try filling the form
  const usernameSelector = inputs.find(i => i.type !== "password" && i.type !== "hidden" && i.type !== "checkbox")?.name
    || inputs.find(i => i.id?.toLowerCase().includes("user") || i.name?.toLowerCase().includes("user"))?.name;

  // Fill username
  await page.focus(`input[type="text"], input[name="username"], input[id*="user"], input[name*="user"]`);
  await page.keyboard.type("Blake742Logistics");
  await page.screenshot().then(s => writeFileSync("scripts/screenshot-2-username.png", s));

  // Fill password
  await page.focus(`input[type="password"]`);
  await page.keyboard.type("dowell2026");

  writeFileSync("scripts/screenshot-3-filled.png", await page.screenshot());
  console.log("✓ Screenshot 3: form filled");

  // Submit
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }),
    page.keyboard.press("Enter"),
  ]);

  const afterUrl = page.url();
  console.log("→ After login URL:", afterUrl);
  writeFileSync("scripts/screenshot-4-after-login.png", await page.screenshot());
  console.log("✓ Screenshot 4: after login");

  // Wait a moment and take another shot
  await new Promise(r => setTimeout(r, 3000));
  writeFileSync("scripts/screenshot-5-dashboard.png", await page.screenshot());

  // Dump page title and all visible text blocks for inspection
  const title = await page.title();
  console.log("→ Page title:", title);

  // Get all text content of elements that might contain counts (numbers)
  const textBlocks = await page.evaluate(() => {
    const els = document.querySelectorAll("*");
    const results = [];
    for (const el of els) {
      const text = el.innerText?.trim();
      if (text && /^\d+$/.test(text) && el.children.length === 0) {
        results.push({
          tag: el.tagName,
          class: el.className,
          id: el.id,
          text,
        });
      }
    }
    return results.slice(0, 50);
  });
  console.log("Numeric text elements:", JSON.stringify(textBlocks, null, 2));

  // Dump full page HTML structure (no customer data — just tags/classes)
  const structure = await page.evaluate(() => {
    function getStructure(el, depth = 0) {
      if (depth > 4) return "";
      const tag = el.tagName?.toLowerCase();
      const cls = el.className && typeof el.className === "string" ? el.className.trim() : "";
      const id  = el.id || "";
      const txt = el.children.length === 0 ? (el.innerText?.trim().slice(0, 30) || "") : "";
      let out = `${"  ".repeat(depth)}<${tag}${id ? ` id="${id}"` : ""}${cls ? ` class="${cls}"` : ""}>${txt}\n`;
      for (const child of el.children) out += getStructure(child, depth + 1);
      return out;
    }
    return getStructure(document.body).slice(0, 8000);
  });
  writeFileSync("scripts/page-structure.txt", structure);
  console.log("✓ page-structure.txt written");

} finally {
  await browser.close();
}
