/**
 * Cut tonight's routes locally.
 * Logs into DRO, grabs today's stops, distributes them evenly across
 * all active routes, and pushes back via transferRoute + solve.
 *
 * Run: node scripts/cut-routes-tonight.mjs
 */

import puppeteer from "puppeteer";

const USERNAME  = "6367044";
const PASSWORD  = "LightningZeus#4";
const BASE_URL  = "https://dro.routesmart.com";
const SA_ID     = "3060743";
const STATION_ID = "259";

// ── Haversine distance ────────────────────────────────────────────────────────
function dist(lat1, lng1, lat2, lng2) {
  const R = 3958.8, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function centroid(stops) {
  return { lat: stops.reduce((s,p)=>s+p.lat,0)/stops.length, lng: stops.reduce((s,p)=>s+p.lng,0)/stops.length };
}

async function run() {
  console.log("🚀 Launching browser...");
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
  const page    = await browser.newPage();

  // Collect cookies after login
  let cookieHeader = "";

  // ── Step 1: Login via Okta popup ─────────────────────────────────────────
  console.log("🔑 Logging in...");
  await page.goto(BASE_URL, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 2000));

  // Click "Service Provider" to open Okta popup
  const popupPromise = new Promise(resolve => browser.once("targetcreated", t => resolve(t.page())));
  const spSelectors = [
    'button::-p-text(Service Provider)',
    '[class*="service" i]',
    'div::-p-text(Service Provider)',
    'span::-p-text(Service Provider)',
    'a::-p-text(Service Provider)',
  ];
  let clicked = false;
  for (const sel of spSelectors) {
    try { const el = await page.$(sel); if (el) { await el.click(); clicked = true; break; } } catch {}
  }
  if (!clicked) {
    const [el] = await page.$x('//*[contains(translate(text(),"abcdefghijklmnopqrstuvwxyz","ABCDEFGHIJKLMNOPQRSTUVWXYZ"),"SERVICE PROVIDER")]');
    if (el) { await el.click(); clicked = true; }
  }
  if (!clicked) throw new Error("Could not find Service Provider login button");

  const popup = await popupPromise;
  await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  console.log("  Okta popup URL:", popup.url());
  popup.on("dialog", async d => d.dismiss());

  // Dismiss any permission dialog
  await new Promise(r => setTimeout(r, 2000));
  try {
    const blockBtn = await popup.waitForSelector('button::-p-text(Block), [aria-label*="Block" i]', { timeout: 4000 });
    if (blockBtn) await blockBtn.click();
  } catch {}

  // Fill username
  await popup.waitForSelector('input[name="identifier"], input[name="username"], input[type="text"]', { timeout: 15000 });
  const usernameSelectors = ['input[name="identifier"]', 'input[name="username"]', 'input[type="text"]'];
  let usernameEl = null;
  for (const sel of usernameSelectors) { usernameEl = await popup.$(sel); if (usernameEl) break; }
  if (!usernameEl) throw new Error("Username field not found in Okta popup");
  await usernameEl.click({ clickCount: 3 });
  await usernameEl.type(USERNAME, { delay: 40 });

  // Click Next
  const nextBtn = await popup.$('input[value="Next"], button::-p-text(Next), [data-type="save"]');
  if (nextBtn) await nextBtn.click(); else await popup.keyboard.press("Enter");

  // Fill password
  await popup.waitForSelector('input[type="password"]', { timeout: 15000 });
  const passwordEl = await popup.$('input[type="password"]');
  if (!passwordEl) throw new Error("Password field not found");
  await passwordEl.click({ clickCount: 3 });
  await passwordEl.type(PASSWORD, { delay: 40 });

  const verifyBtn = await popup.$('input[value="Verify"], button::-p-text(Verify), button[type="submit"]');
  if (verifyBtn) await verifyBtn.click(); else await popup.keyboard.press("Enter");

  // Wait for redirect back to DRO main page
  await new Promise(r => setTimeout(r, 8000));
  console.log("  Post-login URL:", page.url());

  // Station selection if needed
  const stationSelectors = ['[class*="station" i]', 'li button', 'ul li', '.card'];
  for (const sel of stationSelectors) {
    const els = await page.$$(sel);
    if (els.length > 0) { await els[0].click(); await new Promise(r => setTimeout(r, 3000)); break; }
  }

  const cookies = await page.cookies();
  cookieHeader  = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  console.log(`✓ Logged in — ${cookies.length} cookies`);

  const headers = { Cookie: cookieHeader, "Content-Type": "application/json" };

  // ── Step 2: Get active plan + sort date ───────────────────────────────────
  const planJson  = await fetch(`${BASE_URL}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers }).then(r => r.json());
  const planId    = planJson.planId;
  const sdText    = (await fetch(`${BASE_URL}/api/api/stations/${STATION_ID}/sortDate`, { headers }).then(r => r.text())).trim().replace(/^"|"$/g, "");
  const sortDate  = /^\d{4}-\d{2}-\d{2}$/.test(sdText) ? sdText : new Date().toISOString().slice(0,10);
  console.log(`✓ Plan ID: ${planId}  Sort date: ${sortDate}`);

  // ── Step 3: Get waypoints ─────────────────────────────────────────────────
  console.log("📦 Fetching waypoints...");
  const waypoints = await fetch(`${BASE_URL}/api/api/service-areas/${SA_ID}/waypoints?solutionType=actual&routePlanId=${planId}`, { headers }).then(r => r.json());
  console.log(`✓ ${waypoints.length} waypoints`);

  // ── Step 4: Get vehicle set → build workAreaNumber → routeName map ────────
  const vehicleSetRaw = await fetch(`${BASE_URL}/api/api/service-areas/${SA_ID}/route-plans/${planId}/advanced-vehicle-set`, { headers }).then(r => r.json()).catch(() => []);
  const vehicleSet = Array.isArray(vehicleSetRaw?.advancedVehicleSet) ? vehicleSetRaw.advancedVehicleSet : (Array.isArray(vehicleSetRaw) ? vehicleSetRaw : []);
  // workAreaNumber is a stable per-route code on both the vehicle and each waypoint
  const wanToRoute = {};
  for (const v of vehicleSet) {
    if (v.workAreaNumber && v.vehicleName) wanToRoute[v.workAreaNumber] = v.vehicleName;
  }
  console.log(`✓ ${vehicleSet.length} vehicles in plan (workAreaNumber map: ${Object.keys(wanToRoute).length} entries)`);

  // ── Step 5: Get GPS coords from ArcGIS proxy ──────────────────────────────
  console.log("📍 Fetching GPS coordinates...");
  const where = encodeURIComponent(`sort_date = date'${sortDate}' and station_id = '${STATION_ID}' and csa = '304169'`);
  const inner = `http://AGS_URL/rest/services/DRO_Layers/MapServer/8/query?f=json&outFields=wid,route&where=${where}&returnGeometry=true&outSR=102100`;
  const agsUrl = `${BASE_URL}/api/api/Proxy?${inner}`;
  const agsData = await fetch(agsUrl, { headers }).then(r => r.json()).catch(() => ({ features: [] }));
  const features = agsData?.features ?? [];
  console.log(`✓ ${features.length} GPS features`);

  const merc2lat = y => (180/Math.PI)*(2*Math.atan(Math.exp((y/20037508.34)*Math.PI))-Math.PI/2);
  const merc2lng = x => (x/20037508.34)*180;
  const widCoords = {};
  for (const f of features) {
    if (f.geometry?.x != null && f.attributes?.wid != null) {
      const x = f.geometry.x, y = f.geometry.y;
      widCoords[String(f.attributes.wid)] = [Math.abs(y)>90?merc2lat(y):y, Math.abs(x)>180?merc2lng(x):x];
    }
  }

  // ── Step 6: Build stop list — use workAreaNumber for route assignment ──────
  const hasGPS = Object.keys(widCoords).length > 0;
  const stops = waypoints.map(w => ({
    waypointId:     w.waypointId,
    workAreaNumber: w.workAreaNumber || "",
    canonicalRoute: wanToRoute[w.workAreaNumber] || "",
    lat: widCoords[String(w.wid)]?.[0] ?? null,
    lng: widCoords[String(w.wid)]?.[1] ?? null,
    packages:       w.noPackages ?? 1,
  }));
  console.log(`✓ ${stops.length} stops${hasGPS ? " with GPS" : " (no GPS — balancing skipped)"}`);

  // ── Step 7: Route names from vehicle set ─────────────────────────────────
  const routeNames = vehicleSet.map(v => v.vehicleName).filter(Boolean);
  console.log(`\n📋 Active routes (${routeNames.length}):`);
  routeNames.forEach(r => console.log(`   • ${r}`));

  // ── Step 8: Assign each stop to its canonical route via workAreaNumber ───
  const groups = {};
  for (const r of routeNames) groups[r] = [];

  const unrouted = [];
  for (const s of stops) {
    if (s.canonicalRoute && groups[s.canonicalRoute]) {
      groups[s.canonicalRoute].push(s);
    } else {
      unrouted.push(s);
    }
  }
  // Truly unrouted → smallest route
  for (const s of unrouted) {
    const best = routeNames.reduce((a, b) => groups[a].length <= groups[b].length ? a : b);
    groups[best].push(s);
  }

  console.log(`\n📊 Anchor-area distribution (${unrouted.length} stops had no workAreaNumber match):`);
  for (const r of routeNames) console.log(`   ${r}: ${groups[r].length} stops`);

  // ── Step 8b: Border-only balancing (only when GPS available) ─────────────
  if (hasGPS) {
    const stopsWithGPS = r => groups[r].filter(s => s.lat != null);
    const routeCentroid = r => {
      const pts = stopsWithGPS(r);
      if (!pts.length) return null;
      return { lat: pts.reduce((s,p)=>s+p.lat,0)/pts.length, lng: pts.reduce((s,p)=>s+p.lng,0)/pts.length };
    };

    // Determine neighboring routes: pairs whose centroids are within 15 miles
    const NEIGHBOR_MILES = 15;
    const neighbors = {};
    for (const r of routeNames) neighbors[r] = [];
    for (let i = 0; i < routeNames.length; i++) {
      for (let j = i+1; j < routeNames.length; j++) {
        const ci = routeCentroid(routeNames[i]);
        const cj = routeCentroid(routeNames[j]);
        if (!ci || !cj) continue;
        if (dist(ci.lat, ci.lng, cj.lat, cj.lng) <= NEIGHBOR_MILES) {
          neighbors[routeNames[i]].push(routeNames[j]);
          neighbors[routeNames[j]].push(routeNames[i]);
        }
      }
    }

    const total  = stops.length;
    const target = Math.round(total / routeNames.length);
    console.log(`\n⚖️  Balancing (target ~${target}/route, GPS available):`);

    let moved = 0, iters = 0;
    let changed = true;
    while (changed && iters++ < 1000) {
      changed = false;
      // Sort routes biggest → smallest
      const sorted = [...routeNames].sort((a,b) => groups[b].length - groups[a].length);
      const src = sorted[0];
      const dst = sorted[sorted.length - 1];
      if (groups[src].length - groups[dst].length <= 2) break;
      // Only transfer if src and dst are geographic neighbors
      if (!neighbors[src].includes(dst)) {
        // Try to find any neighbor pair that's unbalanced
        let didMove = false;
        outer: for (const big of sorted) {
          for (const small of [...sorted].reverse()) {
            if (big === small) continue;
            if (groups[big].length - groups[small].length <= 2) continue;
            if (!neighbors[big].includes(small)) continue;
            // Move the stop in big that is closest to small's centroid
            const sc = routeCentroid(small);
            if (!sc) continue;
            const pts = stopsWithGPS(big);
            if (!pts.length) continue;
            pts.sort((a,b) => dist(a.lat,a.lng,sc.lat,sc.lng) - dist(b.lat,b.lng,sc.lat,sc.lng));
            const toMove = pts[0];
            groups[big].splice(groups[big].indexOf(toMove), 1);
            groups[small].push(toMove);
            moved++; changed = true; didMove = true;
            break outer;
          }
        }
        if (!didMove) break;
      } else {
        // src and dst are neighbors — move the border stop from src closest to dst
        const sc = routeCentroid(dst);
        if (!sc) break;
        const pts = stopsWithGPS(src);
        if (!pts.length) break;
        pts.sort((a,b) => dist(a.lat,a.lng,sc.lat,sc.lng) - dist(b.lat,b.lng,sc.lat,sc.lng));
        const toMove = pts[0];
        groups[src].splice(groups[src].indexOf(toMove), 1);
        groups[dst].push(toMove);
        moved++; changed = true;
      }
    }

    console.log(`   ${moved} border stops moved across ${iters} iterations`);
    console.log("✅ Balanced distribution:");
    for (const r of routeNames) console.log(`   ${r}: ${groups[r].length} stops`);
  }

  // ── Step 9: Push to DRO ───────────────────────────────────────────────────
  const proceed = true; // set to false to do a dry run
  if (!proceed) { console.log("\n⚠️  Dry run — not pushing"); await browser.close(); return; }

  console.log("\n📤 Pushing routes to DRO...");
  for (const routeName of routeNames) {
    const waypointIds = groups[routeName].map(s => s.waypointId);
    const res = await fetch(`${BASE_URL}/api/api/service-areas/${SA_ID}/waypoints/transferRoute?`, {
      method: "POST",
      headers,
      body: JSON.stringify({ route: routeName, waypointIds, sort_date: sortDate }),
    });
    const body = await res.json().catch(() => ({}));
    console.log(`   ${res.ok ? "✓" : "✗"} ${routeName}: ${waypointIds.length} stops ${res.ok ? "" : JSON.stringify(body)}`);
  }

  // ── Step 10: Trigger solve ────────────────────────────────────────────────
  console.log("\n⚙️  Triggering solve...");
  const waveData = await fetch(`${BASE_URL}/api/api/stations/${STATION_ID}/dispatch-settings`, { headers }).then(r => r.json()).catch(() => ({}));
  const waveId   = waveData?.waves?.[0]?.waveId ?? 84167;

  const solveRes  = await fetch(`${BASE_URL}/api/api/service-areas/${SA_ID}/create_solution_by_wave`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      alternateSolver: false,
      createInformedOptimal: false,
      submittedByStationUser: false,
      waves: [{ waveId, routePlanId: planId, wave: 1 }],
    }),
  });
  const solveBody = await solveRes.json().catch(() => ({}));
  if (solveRes.ok) {
    console.log(`✓ Solve triggered — job ID: ${solveBody.id ?? "unknown"}`);
  } else {
    console.log(`✗ Solve failed: ${JSON.stringify(solveBody)}`);
  }

  console.log("\n🎉 Done! Routes are being solved in DRO. Check DRO in ~60 seconds.");
  await browser.close();
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
