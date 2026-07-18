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

// ── Helper: click element by text ─────────────────────────────────────────────
async function clickText(text) {
  const pos = await page.evaluate((txt) => {
    for (const el of document.querySelectorAll("a,button,li,span,div,[role='tab'],[role='menuitem']")) {
      if (el.textContent?.trim() === txt) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { x: r.x + r.width/2, y: r.y + r.height/2 };
      }
    }
  }, text);
  if (pos) { await page.mouse.click(pos.x, pos.y); await WAIT(1500); return true; }
  return false;
}

async function navTo(section) {
  await clickText("MANAGE");
  await WAIT(600);
  await clickText(section);
  await WAIT(3000);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Edit AUTO → Update Vehicles → Remove one → Save
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n════════════════════════════════════════");
console.log("SECTION 1: Update Vehicles → Remove + Save");
console.log("════════════════════════════════════════");
await navTo("ROUTE PLANS");
await page.screenshot({ path: "scripts/doc-01-route-plans.png" });

// Find AUTO row and hover
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
await page.mouse.move(autoRow.centerX, autoRow.centerY, { steps: 5 });
await WAIT(500);

// Click Edit (x:1727 from previous run)
allCalls.length = 0;
await page.mouse.click(1727, autoRow.centerY);
await WAIT(2500);
await page.screenshot({ path: "scripts/doc-02-edit-modal.png" });

// Click Update Vehicles tab
await clickText("Update Vehicles");
await WAIT(1500);
await page.screenshot({ path: "scripts/doc-03-update-vehicles.png" });

// Find all delete buttons inside the modal
const deleteButtons = await page.evaluate(() => {
  const modal = document.querySelector("[class*='modal'],[role='dialog'],[class*='dialog'],[class*='overlay']")
    ?? document.body;
  return [...modal.querySelectorAll("button, [role='button'], [title*='delete' i], [title*='remove' i], [aria-label*='delete' i], [aria-label*='remove' i]")]
    .filter(el => el.getBoundingClientRect().width > 0)
    .map(el => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent?.trim().slice(0,30), title: el.title, aria: el.getAttribute("aria-label"), x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
    });
});
console.log("Delete buttons in modal:", JSON.stringify(deleteButtons).slice(0, 600));

// Click first delete-looking button (remove one vehicle)
const delBtn = deleteButtons.find(b => b.title?.match(/delete|remove/i) || b.aria?.match(/delete|remove/i));
if (delBtn) {
  console.log(`\nRemoving vehicle via "${delBtn.title || delBtn.aria}" at (${delBtn.x},${delBtn.y})`);
  await page.mouse.click(delBtn.x, delBtn.y);
  await WAIT(1000);
  await page.screenshot({ path: "scripts/doc-04-vehicle-removed.png" });
}

// Now find and click Save/Update button
allCalls.length = 0;
const saveBtn = await page.evaluate(() => {
  for (const el of document.querySelectorAll("button,[role='button']")) {
    const txt = el.textContent?.trim();
    if (txt?.match(/^(save|update|apply|confirm|ok)$/i) && el.getBoundingClientRect().width > 0) {
      const r = el.getBoundingClientRect();
      return { text: txt, x: r.x + r.width/2, y: r.y + r.height/2 };
    }
  }
});
console.log("Save button:", saveBtn);
if (saveBtn) {
  console.log(`Clicking "${saveBtn.text}"...`);
  await page.mouse.click(saveBtn.x, saveBtn.y);
  await WAIT(3000);
  await page.screenshot({ path: "scripts/doc-05-after-save.png" });
  console.log("API calls after Save:");
  allCalls.forEach(c => {
    console.log(`  [${c.method}] ${c.url}`);
    if (c.body) console.log(`    BODY: ${JSON.stringify(c.body).slice(0, 400)}`);
    if (c.response) console.log(`    RESP: ${JSON.stringify(c.response).slice(0, 200)}`);
  });
} else {
  // Screenshot all visible buttons to find save
  const visButtons = await page.evaluate(() =>
    [...document.querySelectorAll("button,[role='button']")]
      .filter(el => el.getBoundingClientRect().width > 0)
      .map(el => ({ text: el.textContent?.trim(), x: Math.round(el.getBoundingClientRect().x + el.getBoundingClientRect().width/2), y: Math.round(el.getBoundingClientRect().y + el.getBoundingClientRect().height/2) }))
      .filter(b => b.text && b.text.length < 50)
  );
  console.log("All visible buttons:", visButtons.map(b => `"${b.text}" (${b.x},${b.y})`));
}

// Close modal
await clickText("Close").catch(() => {});
await WAIT(1000);

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Anchor Areas
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n════════════════════════════════════════");
console.log("SECTION 2: Anchor Areas");
console.log("════════════════════════════════════════");

// GET all anchor areas
const aaRes  = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area`, { headers: h });
const aaData = await aaRes.json();
console.log(`GET anchor-area: ${aaRes.status} — ${aaData.length} areas`);
console.log("First area keys:", Object.keys(aaData[0] ?? {}));
console.log("Sample area:", JSON.stringify(aaData[0]).slice(0, 400));

// GET anchor area detail
const firstAaId = aaData[0]?.anchorAreaId;
if (firstAaId) {
  const detailRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area/${firstAaId}`, { headers: h });
  const detail = await detailRes.json().catch(() => null);
  console.log(`\nGET anchor-area/${firstAaId}: ${detailRes.status}`, JSON.stringify(detail).slice(0, 400));
}

// Navigate to Anchor Areas page
allCalls.length = 0;
await navTo("ANCHOR AREAS");
await page.screenshot({ path: "scripts/doc-06-anchor-areas.png" });
console.log("API calls loading Anchor Areas page:");
allCalls.forEach(c => console.log(`  [${c.method}] ${c.url} → ${c.responseStatus} ${JSON.stringify(c.response)?.slice(0,150)}`));

// What's on the page?
const aaPageContent = await page.evaluate(() =>
  [...document.querySelectorAll("button,[role='button'],th,td,h1,h2,h3,label")]
    .filter(el => el.getBoundingClientRect().width > 0)
    .map(el => el.textContent?.trim())
    .filter(t => t && t.length > 1 && t.length < 80)
    .filter((v,i,a) => a.indexOf(v) === i)
    .slice(0, 40)
);
console.log("Page content:", aaPageContent);
await page.screenshot({ path: "scripts/doc-07-anchor-areas-loaded.png" });

// Click first anchor area row
allCalls.length = 0;
const firstAaRow = await page.evaluate(() => {
  const trs = [...document.querySelectorAll("tr, [class*='row'], li")];
  for (const tr of trs) {
    const r = tr.getBoundingClientRect();
    if (r.width > 200 && r.height > 20 && r.y > 200) {
      return { x: r.x + r.width/2, y: r.y + r.height/2, text: tr.textContent?.trim().slice(0,60) };
    }
  }
});
if (firstAaRow) {
  console.log(`\nClicking first anchor area row: "${firstAaRow.text}"`);
  await page.mouse.move(firstAaRow.x, firstAaRow.y, { steps: 3 });
  await WAIT(400);
  await page.mouse.click(firstAaRow.x, firstAaRow.y);
  await WAIT(2000);
  await page.screenshot({ path: "scripts/doc-08-anchor-row-clicked.png" });
  console.log("Calls:", allCalls.map(c => `[${c.method}] ${c.url} → ${c.responseStatus}`));

  // Check for edit button
  allCalls.length = 0;
  const editAaBtn = await page.evaluate(() => {
    for (const el of document.querySelectorAll("button,[role='button'],[title='Edit'],[title='edit']")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) return { text: el.textContent?.trim(), title: el.title, x: r.x + r.width/2, y: r.y + r.height/2 };
    }
  });
  if (editAaBtn) {
    console.log(`Edit button: "${editAaBtn.title || editAaBtn.text}" at (${editAaBtn.x},${editAaBtn.y})`);
    await page.mouse.click(editAaBtn.x, editAaBtn.y);
    await WAIT(2000);
    await page.screenshot({ path: "scripts/doc-09-anchor-edit.png" });
    console.log("Calls after Edit click:", allCalls.map(c => `[${c.method}] ${c.url} → ${c.responseStatus} ${JSON.stringify(c.response)?.slice(0,150)}`));
  }
}

// ── Probe anchor area PUT/PATCH ───────────────────────────────────────────────
console.log("\n=== Probing anchor area mutation endpoints ===");
if (firstAaId) {
  const sampleAa = aaData[0];
  const probes = [
    { m: "PUT",   p: `/api/api/service-areas/${SA_ID}/anchor-area/${firstAaId}`, b: sampleAa },
    { m: "PATCH", p: `/api/api/service-areas/${SA_ID}/anchor-area/${firstAaId}`, b: sampleAa },
    { m: "PUT",   p: `/api/api/service-areas/${SA_ID}/anchor-area`, b: [sampleAa] },
    { m: "PUT",   p: `/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN}/anchor-area/${firstAaId}`, b: sampleAa },
    { m: "DELETE",p: `/api/api/service-areas/${SA_ID}/anchor-area/${firstAaId}/route-plan/${AUTO_PLAN}` },
    { m: "POST",  p: `/api/api/service-areas/${SA_ID}/anchor-area/${firstAaId}/route-plan`, b: { routePlanId: AUTO_PLAN } },
    { m: "DELETE",p: `/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN}/anchor-area/${firstAaId}` },
    { m: "GET",   p: `/api/api/service-areas/${SA_ID}/anchor-area/${firstAaId}/route-plans` },
    { m: "GET",   p: `/api/api/service-areas/${SA_ID}/route-plans/${AUTO_PLAN}/anchor-areas` },
  ];
  for (const a of probes) {
    const res = await fetch(DRO_BASE + a.p, { method: a.m, headers: h, body: a.b ? JSON.stringify(a.b) : undefined });
    const text = await res.text().catch(() => "");
    if (res.status !== 404 && res.status !== 405) {
      console.log(`  ✓ ${a.m} ${a.p.split("/api/api/")[1]?.slice(0,60)} → ${res.status} ${text.slice(0,150)}`);
    } else {
      console.log(`    ${a.m} ${a.p.split("/api/api/")[1]?.slice(0,60)} → ${res.status}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3: active-plan — try POST/PATCH variations
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n════════════════════════════════════════");
console.log("SECTION 3: active-plan mutations");
console.log("════════════════════════════════════════");
const apFull = await (await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-plan`, { headers: h })).json();
const dow = new Date().getDay(); // 0=Sun ... 6=Sat
const dowKey = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][dow];
console.log(`Today is dow=${dow} (${dowKey}), current planId: ${apFull[dowKey]?.waves?.[0]?.routePlanId}`);

// The serviceAreaDowWaveId is the key — try updating a single wave
const waveId = apFull[dowKey]?.waves?.[0]?.serviceAreaDowWaveId;
console.log(`serviceAreaDowWaveId: ${waveId}`);

const waveProbes = [
  { m: "PUT",   p: `/api/api/service-areas/${SA_ID}/active-plan/${waveId}`, b: { routePlanId: AUTO_PLAN } },
  { m: "PATCH", p: `/api/api/service-areas/${SA_ID}/active-plan/${waveId}`, b: { routePlanId: AUTO_PLAN } },
  { m: "PUT",   p: `/api/api/service-areas/${SA_ID}/service-area-dow-waves/${waveId}`, b: { routePlanId: AUTO_PLAN } },
  { m: "PATCH", p: `/api/api/service-areas/${SA_ID}/service-area-dow-waves/${waveId}`, b: { routePlanId: AUTO_PLAN } },
  { m: "PUT",   p: `/api/api/service-areas/${SA_ID}/dow-wave/${waveId}`, b: { routePlanId: AUTO_PLAN } },
  { m: "POST",  p: `/api/api/service-areas/${SA_ID}/active-plan`, b: { serviceAreaDowWaveId: waveId, routePlanId: AUTO_PLAN } },
  { m: "PATCH", p: `/api/api/service-areas/${SA_ID}/active-plan`, b: { serviceAreaDowWaveId: waveId, routePlanId: AUTO_PLAN } },
];
for (const a of waveProbes) {
  const res = await fetch(DRO_BASE + a.p, { method: a.m, headers: h, body: JSON.stringify(a.b) });
  const text = await res.text().catch(() => "");
  if (res.status !== 404 && res.status !== 405) {
    console.log(`  ✓ ${a.m} ${a.p.split("/api/api/")[1]?.slice(0,50)} → ${res.status} ${text.slice(0,150)}`);
  } else {
    console.log(`    ${a.m} ${a.p.split("/api/api/")[1]?.slice(0,50)} → ${res.status}`);
  }
}

// Save all findings
writeFileSync("scripts/intercepted-manage-calls.json", JSON.stringify(allCalls, null, 2));
writeFileSync("scripts/dro-anchor-areas-full.json", JSON.stringify(aaData, null, 2));
console.log("\n✓ All done. Browser open — close when done.");
await new Promise(resolve => browser.on("disconnected", resolve));
