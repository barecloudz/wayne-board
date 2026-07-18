/**
 * GroundSwell dispatch v2 — captures GraphQL mutations from "Import" button click
 * and probes for the planning window error.
 * Also captures cluster geofence data (WKT polygons) for map fix.
 * Delete after use.
 */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const GS_URL = "https://groundswell.risingtide.us";
const API_BASE = "https://api.risingtide.us";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  args: ["--no-sandbox"],
});

let bearerToken = null;
const graphqlMutations = [];
const clusterData = [];

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const auth = req.headers()["authorization"];
    if (auth?.startsWith("Bearer ")) bearerToken = auth.slice(7);

    // Log POST bodies (GraphQL mutations)
    if (req.method() === "POST" && req.url().includes("graphql")) {
      const body = req.postData();
      if (body?.includes("mutation") || body?.includes("Dispatch") || body?.includes("Import") || body?.includes("dispatch")) {
        console.log("\n[GraphQL MUTATION REQUEST]", body?.slice(0, 600));
        graphqlMutations.push({ type: "request", body });
      }
    }
    req.continue();
  });

  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes("api.risingtide.us")) {
      const method = resp.request().method();
      try {
        const body = await resp.text();
        // Capture cluster data
        if (url.includes("cluster")) {
          console.log(`\n[CLUSTER] ${method} ${resp.status()} ${url}`);
          const parsed = JSON.parse(body);
          if (Array.isArray(parsed)) {
            clusterData.push(...parsed);
            console.log(`Got ${parsed.length} clusters. Sample:`, JSON.stringify(parsed[0], null, 2));
          }
        }
        // Log dispatch/import mutations
        if (method === "POST" && url.includes("graphql") && (body.includes("dispatch") || body.includes("import") || body.includes("Dispatch"))) {
          console.log(`\n[GraphQL MUTATION RESPONSE]`, body.slice(0, 600));
          graphqlMutations.push({ type: "response", body });
        }
      } catch {}
    }
  });

  // ── Login ──────────────────────────────────────────────────────────────────
  console.log("→ Navigating to GroundSwell...");
  await page.goto(GS_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 1000));

  if (page.url().includes("auth.risingtide.us")) {
    console.log("→ Logging in...");
    await page.waitForSelector("input#username", { timeout: 10000 });
    await page.type("input#username", "bnardoni87@gmail.com");
    await page.click('button[type="submit"]');
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.type('input[type="password"]', "LightningZeus#4");
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 });
    await new Promise(r => setTimeout(r, 4000));
    console.log("✓ Logged in:", page.url());
  }

  await new Promise(r => setTimeout(r, 4000));
  console.log("Token captured:", bearerToken ? `${bearerToken.slice(0, 30)}...` : "NONE");

  // ── Capture full page content ──────────────────────────────────────────────
  const pageText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log("\n── Page Content ──\n", pageText.slice(0, 800));

  // ── Find ALL interactive elements ─────────────────────────────────────────
  const allInteractives = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("button, [role='button'], [onclick], .MuiButton-root, .MuiIconButton-root"))
      .map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim().replace(/\s+/g, " ").slice(0, 100),
        class: el.className?.slice(0, 80),
        id: el.id,
        disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
      }))
      .filter(b => b.text);
  });
  console.log("\n── All buttons ──");
  allInteractives.forEach(b => console.log(`  [${b.disabled ? "DISABLED" : "enabled"}] ${b.tag}: "${b.text}"`));

  // ── Try clicking the Import button ────────────────────────────────────────
  console.log("\n→ Looking for Import button...");
  const importBtn = await page.$('button::-p-text(Import)');
  if (importBtn) {
    console.log("✓ Found Import button, clicking...");
    await importBtn.click();
    await new Promise(r => setTimeout(r, 3000));
    // Check for modal/dialog
    const modalText = await page.evaluate(() => {
      const dialogs = document.querySelectorAll("[role='dialog'], .MuiDialog-root, .modal");
      return Array.from(dialogs).map(d => d.textContent?.trim().slice(0, 300)).join("\n");
    });
    console.log("Modal/dialog text after click:", modalText || "(none)");
    writeFileSync("scripts/ss-gs-import-modal.png", await page.screenshot());
    console.log("✓ Screenshot saved");
  } else {
    console.log("⚠️  No Import button found directly. Checking for panel/menu...");
    // Maybe it's behind a panel
    const allText = await page.evaluate(() => document.body.innerHTML.slice(0, 10000));
    const importIdx = allText.indexOf("Import");
    if (importIdx > -1) {
      console.log("Found 'Import' in HTML at index", importIdx, "context:", allText.slice(importIdx - 100, importIdx + 200));
    }
  }

  // ── Direct API with captured token ────────────────────────────────────────
  if (bearerToken) {
    const headers = {
      "Authorization": `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
    };

    // Get vehicles with hexCode and dro_work_area_number
    console.log("\n── Vehicles with hexCode ──");
    const vehQuery = {
      query: `query Vehicles {
        vehicles(serviceAreaId: 685) {
          id
          customerUid
          hexCode
          capacity
          maxThresholdNormalized
          additionalData
        }
      }`
    };
    const vehRes = await fetch(`${API_BASE}/graphql`, {
      method: "POST",
      headers,
      body: JSON.stringify(vehQuery),
    });
    const vehData = await vehRes.json();
    const vehicles = vehData?.data?.vehicles ?? [];
    console.log(`Got ${vehicles.length} vehicles`);
    // Print only non-PII data: workAreaNumber + hexCode
    const vehicleMap = vehicles.map(v => ({
      id: v.id,
      uid: v.customerUid,
      hexCode: v.hexCode,
      capacity: v.capacity,
      maxThreshold: v.maxThresholdNormalized,
      workAreaNumber: v.additionalData?.dro_work_area_number,
    }));
    console.log(JSON.stringify(vehicleMap, null, 2));
    writeFileSync("scripts/gs-vehicles.json", JSON.stringify(vehicleMap, null, 2));

    // Get cluster data directly
    console.log("\n── Cluster Geofences ──");
    const clRes = await fetch(`${API_BASE}/geofence/v1/cluster?sce_id=26716`, { headers });
    const clData = await clRes.json();
    console.log(`Got ${Array.isArray(clData) ? clData.length : "?"} clusters`);
    if (Array.isArray(clData) && clData.length > 0) {
      // Store minimal non-PII version: vehicle_id, identifier (DRO anchor area ID), poly
      const minimal = clData.map(c => ({
        id: c.id,
        vehicle_id: c.vehicle_id,
        sce_id: c.sce_id,
        name: c.name,
        identifier: c.identifier,
        poly: c.poly,
      }));
      writeFileSync("scripts/gs-clusters.json", JSON.stringify(minimal, null, 2));
      console.log(`✓ Saved ${minimal.length} clusters to gs-clusters.json`);
      console.log("Sample:", JSON.stringify(minimal[0], null, 2));
    }

    // Try triggering dispatch via GraphQL
    console.log("\n── Trying GraphQL dispatch mutation ──");
    // Introspect schema to find mutations
    const introQuery = {
      query: `{
        __schema {
          mutationType {
            fields {
              name
              description
              args { name type { name kind ofType { name } } }
            }
          }
        }
      }`
    };
    const introRes = await fetch(`${API_BASE}/graphql`, { method: "POST", headers, body: JSON.stringify(introQuery) });
    const introData = await introRes.json();
    const mutations = introData?.data?.__schema?.mutationType?.fields ?? [];
    console.log(`Found ${mutations.length} mutations:`);
    mutations.forEach(m => console.log(`  - ${m.name}: ${m.description || "(no desc)"}`));

    if (mutations.length > 0) {
      writeFileSync("scripts/gs-mutations.json", JSON.stringify(mutations, null, 2));
      console.log("✓ Saved mutations to gs-mutations.json");

      // Find dispatch-related mutations
      const dispatchMut = mutations.filter(m =>
        m.name.toLowerCase().includes("dispatch") ||
        m.name.toLowerCase().includes("import") ||
        m.name.toLowerCase().includes("dro") ||
        m.name.toLowerCase().includes("route") ||
        m.name.toLowerCase().includes("trigger")
      );
      console.log("\nDispatch-related mutations:", JSON.stringify(dispatchMut, null, 2));

      // Try calling a dispatch mutation if found
      for (const mut of dispatchMut.slice(0, 3)) {
        const args = mut.args.map(a => `${a.name}: null`).join(", ");
        const testMutation = { query: `mutation { ${mut.name}(${args}) }` };
        const mutRes = await fetch(`${API_BASE}/graphql`, { method: "POST", headers, body: JSON.stringify(testMutation) });
        const mutData = await mutRes.json();
        console.log(`\nTried ${mut.name}:`, JSON.stringify(mutData, null, 2).slice(0, 400));
      }
    }

    // Try REST dispatch endpoints
    console.log("\n── Trying REST dispatch endpoints (POST) ──");
    const droConnectId = 1439;
    const sceId = 26716;
    const dispatchAttempts = [
      { url: `${API_BASE}/dro_connect/v1/${droConnectId}/dispatch/`, body: { sce_id: sceId } },
      { url: `${API_BASE}/dro_connect/v1/${droConnectId}/schedule/run/`, body: {} },
      { url: `${API_BASE}/dro_connect/v1/${droConnectId}/run/`, body: { sce_id: sceId } },
      { url: `${API_BASE}/dro_connect/v1/${droConnectId}/trigger/`, body: { sce_id: sceId, mode: "LIVE" } },
      { url: `${API_BASE}/dro_connect/v1/${droConnectId}/import/live/`, body: { sce_id: sceId } },
      { url: `${API_BASE}/automation/v1/run/`, body: { dro_connect_id: droConnectId, sce_id: sceId } },
      { url: `${API_BASE}/jobs/v1/dispatch/`, body: { sce_id: sceId } },
      { url: `${API_BASE}/worker_scheduling/v1/${sceId}/dispatch/`, body: {} },
    ];
    for (const { url, body } of dispatchAttempts) {
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      const text = await res.text();
      console.log(`POST ${url.replace(API_BASE, '')} → ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  await new Promise(r => setTimeout(r, 2000));

} finally {
  await browser.close();
}
