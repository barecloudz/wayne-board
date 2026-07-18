/**
 * GroundSwell dispatch v3 — captures vehicle hexCode/workArea map AND tries to
 * trigger the dispatch by interacting with the MUI Select "Import" control.
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
const vehicleData = {};

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  await page.setRequestInterception(true);
  page.on("request", req => {
    const auth = req.headers()["authorization"];
    if (auth?.startsWith("Bearer ")) bearerToken = auth.slice(7);
    req.continue();
  });

  // Capture vehicle data from GraphQL responses
  page.on("response", async (resp) => {
    const url = resp.url();
    if (!url.includes("graphql")) return;
    try {
      const text = await resp.text();
      const data = JSON.parse(text);
      const edges = data?.data?.vehicles?.edges ?? data?.data?.routes?.edges;
      if (!edges) return;

      for (const edge of edges) {
        const node = edge.node;
        // From vehicles query
        if (node?.hexCode !== undefined) {
          vehicleData[node.id] = {
            id: node.id,
            hexCode: node.hexCode,
            capacity: node.capacity,
            maxThreshold: node.maxThresholdNormalized,
            workAreaNumber: node.additionalData?.dro_work_area_number,
            customerUid: node.customerUid,
          };
        }
        // From routes query — vehicle is nested
        if (node?.vehicle?.hexCode !== undefined) {
          const v = node.vehicle;
          vehicleData[v.id] = {
            id: v.id,
            hexCode: v.hexCode,
            capacity: v.capacity,
            maxThreshold: v.maxThresholdNormalized,
            workAreaNumber: v.additionalData?.dro_work_area_number,
            customerUid: v.customerUid,
          };
        }
      }
    } catch {}
  });

  // ── Login ──────────────────────────────────────────────────────────────────
  console.log("→ Navigating...");
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
    console.log("✓ Logged in");
  }

  await new Promise(r => setTimeout(r, 5000));
  console.log("Vehicles captured so far:", Object.keys(vehicleData).length);

  // ── Analyze the Import select structure ───────────────────────────────────
  console.log("\n── Analyzing Import control ──");
  const importInfo = await page.evaluate(() => {
    // Find all select elements
    const selects = Array.from(document.querySelectorAll("select, [role='combobox'], .MuiSelect-root"));
    const selectInfo = selects.map(s => ({
      tag: s.tagName,
      value: s.value || s.textContent?.trim().slice(0, 50),
      id: s.id,
      name: s.name,
      class: s.className?.slice(0, 80),
      options: s.tagName === "SELECT" ? Array.from(s.options).map(o => ({ value: o.value, text: o.text })) : [],
    }));

    // Find hidden native select (MUI pattern)
    const nativeSelects = Array.from(document.querySelectorAll("select.MuiSelect-nativeInput, input.MuiSelect-nativeInput"));
    const nativeInfo = nativeSelects.map(s => ({
      tag: s.tagName,
      value: s.value,
      name: s.name,
      class: s.className,
    }));

    // Find the "I WANT TO" button or trigger
    const iwantto = Array.from(document.querySelectorAll("*")).find(el =>
      el.textContent?.includes("I WANT TO") && el.children.length < 5
    );

    return {
      selects: selectInfo,
      nativeSelects: nativeInfo,
      iwanttoBounds: iwantto ? iwantto.getBoundingClientRect() : null,
    };
  });

  console.log("Selects found:", JSON.stringify(importInfo.selects, null, 2));
  console.log("Native selects:", JSON.stringify(importInfo.nativeSelects, null, 2));

  // ── Interact with the dispatch selector ───────────────────────────────────
  console.log("\n── Trying to interact with Import selector ──");

  // The MUI Select shows the display div. Click it to open.
  const visibleSelect = await page.$('.MuiSelect-standard, .MuiSelect-select');
  if (visibleSelect) {
    console.log("✓ Found MUI Select display, clicking to open...");
    await visibleSelect.click();
    await new Promise(r => setTimeout(r, 1500));
    writeFileSync("scripts/ss-gs-select-open.png", await page.screenshot());

    // Look for dropdown options
    const options = await page.evaluate(() => {
      const listItems = Array.from(document.querySelectorAll("[role='option'], .MuiMenuItem-root, li[data-value]"));
      return listItems.map(li => ({
        text: li.textContent?.trim(),
        value: li.getAttribute("data-value"),
        class: li.className?.slice(0, 60),
      }));
    });
    console.log("Dropdown options:", JSON.stringify(options, null, 2));

    // Try to find "live" option
    const liveOpt = await page.$('[data-value="live"], [data-value="dispatch"], [data-value="import_live"]');
    if (liveOpt) {
      console.log("✓ Found LIVE option, clicking...");
      await liveOpt.click();
      await new Promise(r => setTimeout(r, 1000));
    } else {
      console.log("No LIVE option found in dropdown");
      // Close the dropdown
      await page.keyboard.press("Escape");
    }
  } else {
    console.log("⚠️  No MUI Select found");
  }

  // ── Look for the action button ("I WANT TO") ──────────────────────────────
  console.log("\n── Looking for 'I WANT TO' action button ──");
  const actionBtn = await page.$('button::-p-text(I WANT TO)');
  if (actionBtn) {
    console.log("✓ Found 'I WANT TO' button");
    // Intercept the next network call
    const networkPromise = new Promise(resolve => {
      page.once("response", async resp => {
        if (resp.url().includes("api.risingtide.us")) {
          const text = await resp.text();
          resolve({ url: resp.url(), status: resp.status(), body: text });
        }
      });
    });
    await actionBtn.click();
    await new Promise(r => setTimeout(r, 3000));
    writeFileSync("scripts/ss-gs-after-click.png", await page.screenshot());
    console.log("✓ Clicked! Screenshot saved.");

    // Check for error messages
    const errorText = await page.evaluate(() => {
      const toasts = document.querySelectorAll("[class*='toast'], [class*='snackbar'], [class*='alert'], [class*='error'], [role='alert']");
      return Array.from(toasts).map(t => t.textContent?.trim()).join("\n");
    });
    console.log("Error/toast messages:", errorText || "(none)");

    // Get modal content
    const modalText = await page.evaluate(() => {
      const dialogs = document.querySelectorAll("[role='dialog'], .MuiDialog-root");
      return Array.from(dialogs).map(d => d.textContent?.trim().slice(0, 400)).join("\n");
    });
    console.log("Modal text:", modalText || "(none)");
  } else {
    console.log("⚠️  No 'I WANT TO' button found");
  }

  // ── Use captured bearer token to get vehicles directly ─────────────────
  await new Promise(r => setTimeout(r, 2000));
  console.log("\nFinal vehicle count:", Object.keys(vehicleData).length);
  console.log("Vehicles captured:", JSON.stringify(Object.values(vehicleData), null, 2));

  if (Object.keys(vehicleData).length > 0) {
    writeFileSync("scripts/gs-vehicles.json", JSON.stringify(Object.values(vehicleData), null, 2));
    console.log("✓ Saved gs-vehicles.json");
  }

  // If still no vehicles, try GraphQL directly with correct schema
  if (bearerToken && Object.keys(vehicleData).length === 0) {
    console.log("\n── Direct GraphQL for vehicles ──");
    const headers = {
      "Authorization": `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
    };

    // Use the same query the app uses
    const query = {
      operationName: "Vehicles",
      variables: { first: 200, after: null },
      query: `query Vehicles($first: Int!, $after: String, $serviceAreaIds: [Int!]) {
        vehicles(first: $first, after: $after, serviceAreaIds: $serviceAreaIds) {
          edges { node {
            id
            customerUid
            hexCode
            capacity
            maxThresholdNormalized
            additionalData
          }}
        }
      }`
    };

    const res = await fetch(`${API_BASE}/graphql`, {
      method: "POST",
      headers,
      body: JSON.stringify(query),
    });
    const data = await res.json();
    const edges = data?.data?.vehicles?.edges ?? [];
    console.log(`Direct query got ${edges.length} vehicles`);
    if (edges.length > 0) {
      const result = edges.map(e => ({
        id: e.node.id,
        hexCode: e.node.hexCode,
        customerUid: e.node.customerUid,
        capacity: e.node.capacity,
        workAreaNumber: e.node.additionalData?.dro_work_area_number,
      }));
      console.log(JSON.stringify(result, null, 2));
      writeFileSync("scripts/gs-vehicles.json", JSON.stringify(result, null, 2));
    }

    // Also try without filter to get all
    const query2 = {
      operationName: "Vehicles",
      variables: { first: 200, after: null, serviceAreaIds: [685] },
      query: `query Vehicles($first: Int!, $after: String, $serviceAreaIds: [Int!]) {
        vehicles(first: $first, after: $after, serviceAreaIds: $serviceAreaIds) {
          edges { node {
            id
            customerUid
            hexCode
            capacity
            maxThresholdNormalized
            additionalData
          }}
        }
      }`
    };
    const res2 = await fetch(`${API_BASE}/graphql`, { method: "POST", headers, body: JSON.stringify(query2) });
    const data2 = await res2.json();
    const edges2 = data2?.data?.vehicles?.edges ?? [];
    console.log(`With serviceAreaIds filter: ${edges2.length} vehicles`);
    if (edges2.length > 0) {
      const result2 = edges2.map(e => ({
        id: e.node.id,
        hexCode: e.node.hexCode,
        customerUid: e.node.customerUid,
        capacity: e.node.capacity,
        workAreaNumber: e.node.additionalData?.dro_work_area_number,
      }));
      writeFileSync("scripts/gs-vehicles.json", JSON.stringify(result2, null, 2));
      console.log("✓ Saved vehicles:", JSON.stringify(result2.slice(0, 3), null, 2));
    }
  }

  await new Promise(r => setTimeout(r, 2000));

} finally {
  await browser.close();
}
