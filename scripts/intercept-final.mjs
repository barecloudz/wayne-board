import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";

const DRO_BASE  = "https://dro.routesmart.com";
const CHROME    = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SA_ID     = "3060743";
const AUTO_PLAN = 2352850;
const WAIT      = ms => new Promise(r => setTimeout(r, ms));

const env    = readFileSync(".env.local", "utf8");
const getEnv = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  args: ["--no-sandbox", "--start-maximized"],
  defaultViewport: null,
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on("dialog", async d => { try { await d.dismiss(); } catch {} });

const allCalls = [];
page.on("request", req => {
  const url = req.url(), meth = req.method();
  if (!url.includes("/api/")) return;
  let body = null;
  try { body = JSON.parse(req.postData() ?? "null"); } catch { body = req.postData(); }
  allCalls.push({ method: meth, url: url.replace(DRO_BASE, ""), body, responseStatus: null, response: null });
});
page.on("response", async res => {
  const url = res.url(), meth = res.request().method();
  if (!url.includes("/api/")) return;
  const entry = allCalls.findLast(c => c.url === url.replace(DRO_BASE, "") && c.method === meth && c.responseStatus === null);
  if (entry) {
    entry.responseStatus = res.status();
    try { entry.response = await res.json(); } catch {}
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
console.log("Logging in...");
await page.goto(DRO_BASE, { waitUntil: "networkidle2" });
const popupPromise = new Promise(resolve => browser.once("targetcreated", t => resolve(t.page())));
await page.click("button::-p-text(Service Provider)");
const popup = await popupPromise;
await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
popup.on("dialog", async d => { try { await d.dismiss(); } catch {} });
try { await popup.waitForSelector("button::-p-text(Block)", { timeout: 4000 }); await popup.click("button::-p-text(Block)"); } catch {}
await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
await popup.type('input[name="identifier"]', getEnv("DRO_USERNAME"));
await popup.click('input[type="submit"]');
await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
await popup.type('input[type="password"]', getEnv("DRO_PASSWORD"));
const btn = await popup.$('input[type="submit"], button[type="submit"]');
if (btn) await btn.click(); else await popup.keyboard.press("Enter");
await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 }).catch(() => {});
await WAIT(3000);
(await page.$$('[class*="station" i]'))[0]?.click();
await WAIT(4000);
console.log("✓ Logged in");

const cookies = await page.cookies();
const h = { Cookie: cookies.map(c => `${c.name}=${c.value}`).join("; "), "Content-Type": "application/json" };

async function clickText(text) {
  const pos = await page.evaluate((txt) => {
    for (const el of document.querySelectorAll("a,button,li,span,div,[role='tab'],[role='menuitem']")) {
      if (el.textContent?.trim() === txt) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { x: r.x + r.width/2, y: r.y + r.height/2 };
      }
    }
  }, text);
  if (pos) { await page.mouse.click(pos.x, pos.y); await WAIT(1000); return true; }
  return false;
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 1: Intercept schedule row change (set active plan per day)
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n═══ PART 1: Schedule row — change day's plan ═══");
await clickText("MANAGE");
await WAIT(600);
await clickText("ROUTE PLANS");
await WAIT(3000);
await page.screenshot({ path: "scripts/fin-01-route-plans.png" });

// The schedule is at the TOP of the page (Day of Week table)
// Find the Monday row's dispatch/plan dropdown or edit button
const scheduleRows = await page.evaluate(() => {
  const rows = [...document.querySelectorAll("tr")];
  return rows
    .filter(tr => tr.getBoundingClientRect().width > 0)
    .map(tr => ({
      text: tr.textContent?.trim().replace(/\s+/g, " ").slice(0, 80),
      y: Math.round(tr.getBoundingClientRect().y),
      h: Math.round(tr.getBoundingClientRect().height),
      centerY: Math.round(tr.getBoundingClientRect().y + tr.getBoundingClientRect().height/2),
    }))
    .filter(r => r.text.length > 5)
    .slice(0, 20);
});
console.log("Schedule rows:", JSON.stringify(scheduleRows, null, 2));
await page.screenshot({ path: "scripts/fin-02-schedule.png" });

// Find Friday row (today) and click it
const fridayRow = scheduleRows.find(r => r.text.includes("Friday") || r.text.includes("friday"));
if (fridayRow) {
  console.log(`\nClicking Friday row at y=${fridayRow.centerY}...`);

  // First just hover to see what appears
  await page.mouse.move(960, fridayRow.centerY, { steps: 3 });
  await WAIT(500);
  await page.screenshot({ path: "scripts/fin-03-friday-hover.png" });

  // Click edit button or dropdown in Friday row
  const fridayBtns = await page.evaluate((cy) => {
    return [...document.querySelectorAll("button,[role='button'],select,input,[class*='dropdown'],[class*='select']")]
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && Math.abs((r.y + r.height/2) - cy) < 30;
      })
      .map(el => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, text: el.textContent?.trim().slice(0,30), title: el.title, type: el.type, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
      });
  }, fridayRow.centerY);
  console.log("Friday row elements:", JSON.stringify(fridayBtns));

  // Click each one and capture
  for (const fb of fridayBtns) {
    allCalls.length = 0;
    console.log(`\nClicking "${fb.text || fb.title || fb.tag}" at (${fb.x},${fb.y})...`);
    await page.mouse.click(fb.x, fb.y);
    await WAIT(2000);
    await page.screenshot({ path: `scripts/fin-04-friday-btn.png` });
    const calls = allCalls.filter(c => c.method !== "GET" || c.url.includes("plan") || c.url.includes("active"));
    if (calls.length > 0) {
      console.log("  API calls:");
      calls.forEach(c => console.log(`    [${c.method}] ${c.url} BODY:${JSON.stringify(c.body)?.slice(0,200)} → ${c.responseStatus}`));
    }

    // Look for a dropdown/select with plan options
    const dropdownItems = await page.evaluate(() =>
      [...document.querySelectorAll("li,[role='option'],option")]
        .filter(el => el.getBoundingClientRect().width > 0)
        .map(el => ({ text: el.textContent?.trim(), x: Math.round(el.getBoundingClientRect().x + el.getBoundingClientRect().width/2), y: Math.round(el.getBoundingClientRect().y + el.getBoundingClientRect().height/2) }))
        .filter(el => el.text && el.text.length < 50)
        .slice(0, 20)
    );
    if (dropdownItems.length > 0) {
      console.log("  Dropdown items:", dropdownItems.map(d => `"${d.text}"`));
      // Find AUTO option
      const autoOpt = dropdownItems.find(d => d.text?.toLowerCase().includes("auto"));
      if (autoOpt) {
        console.log(`  Selecting AUTO at (${autoOpt.x},${autoOpt.y})...`);
        allCalls.length = 0;
        await page.mouse.click(autoOpt.x, autoOpt.y);
        await WAIT(1500);
        // Now look for Save button
        const saveBtns = await page.evaluate(() =>
          [...document.querySelectorAll("button")]
            .filter(el => el.textContent?.trim().match(/save|apply|update|ok|confirm/i) && el.getBoundingClientRect().width > 0)
            .map(el => ({ text: el.textContent?.trim(), x: Math.round(el.getBoundingClientRect().x + el.getBoundingClientRect().width/2), y: Math.round(el.getBoundingClientRect().y + el.getBoundingClientRect().height/2) }))
        );
        console.log("  Save buttons:", saveBtns);
        if (saveBtns[0]) {
          await page.mouse.click(saveBtns[0].x, saveBtns[0].y);
          await WAIT(2000);
          console.log("  Calls after selecting AUTO + Save:");
          allCalls.forEach(c => console.log(`    [${c.method}] ${c.url} BODY:${JSON.stringify(c.body)?.slice(0,300)} → ${c.responseStatus} RESP:${JSON.stringify(c.response)?.slice(0,200)}`));
          // UNDO — click back to original plan
          await page.goBack().catch(() => {});
        }
      }
    }
    break; // only try first element
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 2: Edit AUTO vehicles — remove one → click Save and intercept
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n═══ PART 2: Remove vehicle from AUTO → Save ═══");

// Navigate back to route plans
await clickText("MANAGE");
await WAIT(600);
await clickText("ROUTE PLANS");
await WAIT(3000);

// Find AUTO row
const autoRow = await page.evaluate(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent?.trim() === "AUTO" && node.children.length === 0) {
      const r = node.getBoundingClientRect();
      if (r.width > 0) {
        let row = node.parentElement;
        while (row && row.tagName !== "TR") row = row.parentElement;
        if (row) { const rr = row.getBoundingClientRect(); return { centerX: rr.x + rr.width/2, centerY: rr.y + rr.height/2 }; }
      }
    }
  }
});

// Hover + click Edit
await page.mouse.move(autoRow.centerX, autoRow.centerY, { steps: 3 });
await WAIT(400);
await page.mouse.click(1727, autoRow.centerY); // Edit button
await WAIT(2500);
await page.screenshot({ path: "scripts/fin-05-auto-edit.png" });
await clickText("Update Vehicles");
await WAIT(1500);
await page.screenshot({ path: "scripts/fin-06-vehicles-tab.png" });

// Dump the full modal HTML to understand structure
const modalHTML = await page.evaluate(() => {
  const modal = document.querySelector("[class*='modal'],[role='dialog'],[class*='dialog']");
  return modal?.innerHTML?.slice(0, 3000) ?? "no modal found";
});
console.log("Modal HTML snippet:", modalHTML.slice(0, 1500));

// Find all buttons with delete/remove icons (look for aria-label or svg title)
const allModalBtns = await page.evaluate(() => {
  const modal = document.querySelector("[class*='modal'],[role='dialog'],[class*='dialog']") ?? document.body;
  return [...modal.querySelectorAll("button,[role='button']")]
    .filter(el => el.getBoundingClientRect().width > 0)
    .map(el => {
      const r = el.getBoundingClientRect();
      const svgTitle = el.querySelector("title")?.textContent;
      return {
        text: el.textContent?.trim().slice(0,30),
        title: el.title,
        aria: el.getAttribute("aria-label"),
        svgTitle,
        cls: el.className?.slice(0,60),
        x: Math.round(r.x + r.width/2),
        y: Math.round(r.y + r.height/2),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
});
console.log("\nAll modal buttons:", JSON.stringify(allModalBtns, null, 2).slice(0, 2000));

// Try clicking the close/X button on first vehicle row (typically a small button on the right)
// Sort by X position descending — rightmost buttons are likely remove icons
const sortedByX = allModalBtns
  .filter(b => !b.text?.match(/save|cancel|close|stop|update/i))
  .filter(b => b.x > 800 && b.w < 50) // small right-side buttons
  .sort((a, b) => b.x - a.x);
console.log("\nSmall right-side buttons (likely remove icons):", JSON.stringify(sortedByX).slice(0,500));

if (sortedByX.length > 0) {
  const removeBtn = sortedByX[0];
  console.log(`\nClicking suspected remove at (${removeBtn.x},${removeBtn.y})...`);
  await page.mouse.click(removeBtn.x, removeBtn.y);
  await WAIT(1000);
  await page.screenshot({ path: "scripts/fin-07-after-remove.png" });

  // Now click Save
  allCalls.length = 0;
  const savePos = await page.evaluate(() => {
    for (const el of document.querySelectorAll("button")) {
      if (el.textContent?.trim().match(/^save$/i) && el.getBoundingClientRect().width > 0) {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width/2, y: r.y + r.height/2 };
      }
    }
  });
  if (savePos) {
    console.log(`Clicking Save at (${savePos.x},${savePos.y})...`);
    await page.mouse.click(savePos.x, savePos.y);
    await WAIT(3000);
    await page.screenshot({ path: "scripts/fin-08-after-save.png" });
    console.log("\n★ API calls after Save (CRITICAL):");
    allCalls.forEach(c => {
      console.log(`  [${c.method}] ${c.url}`);
      if (c.body) console.log(`    BODY: ${JSON.stringify(c.body).slice(0, 600)}`);
      if (c.response) console.log(`    RESP: ${JSON.stringify(c.response).slice(0, 300)}`);
    });
  }
}

writeFileSync("scripts/intercepted-manage-calls.json", JSON.stringify(allCalls, null, 2));
console.log("\n✓ Done. Browser open — close when done.");
await new Promise(resolve => browser.on("disconnected", resolve));
