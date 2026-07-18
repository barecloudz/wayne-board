/**
 * Standalone: build route plan + push to DRO
 * Usage: node scripts/run-routes.mjs [driverCount]
 */
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const DRIVER_COUNT = parseInt(args[0] ?? "13");

const env = readFileSync(".env.local", "utf8");
const getEnv = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const DATABASE_URL = getEnv("DATABASE_URL_POOLER") || getEnv("DATABASE_URL");
const sql = neon(DATABASE_URL);

const DRO_BASE    = "https://dro.routesmart.com";
const SA_ID       = "3060743";
const STATION_ID  = "259";
const CHROME      = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DEPOT       = { lat: 35.4210, lng: -82.5022 };
const LOAD_THRESHOLD = 0.85;
const MAX_STOPS   = 150;
const MIN_STOPS   = 80;
const isZirconia  = n => n.toLowerCase().includes("zirconia");

// ── Haversine ────────────────────────────────────────────────────────────────
function dist(lat1, lng1, lat2, lng2) {
  const R = 3958.8, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function centroid(pts) {
  return { lat: pts.reduce((s,p)=>s+p.lat,0)/pts.length, lng: pts.reduce((s,p)=>s+p.lng,0)/pts.length };
}
function routeDist(stops, depot) {
  if (!stops.length) return 0;
  let t = dist(depot.lat, depot.lng, stops[0].lat, stops[0].lng);
  for (let i=1;i<stops.length;i++) t += dist(stops[i-1].lat,stops[i-1].lng,stops[i].lat,stops[i].lng);
  return t;
}

// ── OSRM matrix ──────────────────────────────────────────────────────────────
async function getOsrmMatrix(points) {
  try {
    const coords = points.map(p=>`${p.lng},${p.lat}`).join(";");
    const res = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`,
      { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const d = await res.json();
    if (d.code !== "Ok" || !d.durations) return null;
    return d.durations.map(row => row.map(v => (v==null||v<0) ? 999999 : v));
  } catch { return null; }
}

function nnByMatrix(candidates, startIdx, matrix) {
  const unvisited = [...candidates]; const ordered = []; let cur = startIdx;
  while (unvisited.length) {
    let best=0, bestT=Infinity;
    for (let i=0;i<unvisited.length;i++) { const t=matrix[cur]?.[unvisited[i]]??Infinity; if(t<bestT){bestT=t;best=i;} }
    const next=unvisited.splice(best,1)[0]; ordered.push(next); cur=next;
  }
  return ordered;
}
function twoOptByMatrix(route, depotIdx, matrix) {
  if (route.length<4) return route;
  let r=[...route], improved=true;
  while (improved) {
    improved=false;
    for (let i=0;i<r.length-1;i++) for (let j=i+2;j<r.length;j++) {
      const a=i===0?depotIdx:r[i-1], nxt=j+1<r.length?r[j+1]:depotIdx;
      const before=(matrix[a]?.[r[i]]??0)+(matrix[r[j]]?.[nxt]??0);
      const after=(matrix[a]?.[r[j]]??0)+(matrix[r[i]]?.[nxt]??0);
      if (after<before-0.01) { r=[...r.slice(0,i),...r.slice(i,j+1).reverse(),...r.slice(j+1)]; improved=true; }
    }
  }
  return r;
}
function nnHaversine(stops, from) {
  const unvisited=[...stops], ordered=[]; let cur=from;
  while (unvisited.length) {
    let best=0, bestD=Infinity;
    for (let i=0;i<unvisited.length;i++) { const d=dist(cur.lat,cur.lng,unvisited[i].lat,unvisited[i].lng); if(d<bestD){bestD=d;best=i;} }
    const next=unvisited.splice(best,1)[0]; ordered.push(next); cur=next;
  }
  return ordered;
}

async function sequenceRoute(stops, depot) {
  const regular=stops.filter(s=>!s.isBulkStop), bulk=stops.filter(s=>s.isBulkStop);
  const points=[depot,...regular,...bulk];
  const matrix=await getOsrmMatrix(points);
  if (matrix) {
    const DEPOT=0, regIdxs=regular.map((_,i)=>i+1), bulkIdxs=bulk.map((_,i)=>regular.length+1+i);
    const ordReg=twoOptByMatrix(nnByMatrix(regIdxs,DEPOT,matrix),DEPOT,matrix);
    const lastReg=ordReg.length?ordReg[ordReg.length-1]:DEPOT;
    const ordBulk=nnByMatrix(bulkIdxs,lastReg,matrix);
    return [...ordReg.map(i=>points[i]),...ordBulk.map(i=>points[i])];
  }
  const opt=nnHaversine(regular,depot);
  return [...opt,...nnHaversine(bulk,opt.length?opt[opt.length-1]:depot)];
}

// ── WKT polygon parsing & point-in-polygon ───────────────────────────────────
function parseWkt(wkt) {
  const inner=wkt.replace(/^POLYGON\s*\(\(/i,"").replace(/\)\)$/,"");
  return inner.split(",").map(p=>{const[a,b]=p.trim().split(/\s+/);return[parseFloat(a),parseFloat(b)];});
}
function pip(lat,lng,poly) {
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
    if(yi>lat!==yj>lat&&lng<((xj-xi)*(lat-yi))/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log(`Building plan for ${DRIVER_COUNT} drivers...`);

// Pull data from DB
const [rawStops, droRouteRows, anchorAreaRows, depotLatRow, depotLngRow] = await Promise.all([
  sql`SELECT waypoint_id,address,city,firm_name,lat,lng,no_packages,total_cube,is_bulk_stop,actual_route,work_area_number FROM dro_stops WHERE lat IS NOT NULL`,
  sql`SELECT work_area_name,vehicle_capacity FROM dro_routes`,
  sql`SELECT name,wkt_poly FROM dro_anchor_areas WHERE wkt_poly IS NOT NULL`,
  sql`SELECT value FROM settings WHERE key='depot_lat'`,
  sql`SELECT value FROM settings WHERE key='depot_lng'`,
]);

const depot = {
  lat: parseFloat(depotLatRow[0]?.value ?? "35.4210"),
  lng: parseFloat(depotLngRow[0]?.value ?? "-82.5022"),
};

const capacityMap = {};
for (const r of droRouteRows) {
  const cap = parseFloat(r.vehicle_capacity);
  if (!isNaN(cap) && cap > 0) capacityMap[r.work_area_name.trim()] = cap;
}
const defaultCapacity = Object.values(capacityMap).filter(v=>v>0).length
  ? Math.min(...Object.values(capacityMap).filter(v=>v>0)) : 300;

const parsedAreas = anchorAreaRows.map(a => ({ name: a.name, poly: parseWkt(a.wkt_poly) }));

const stops = rawStops.map(s => ({
  waypointId:    s.waypoint_id,
  address:       s.address,
  city:          s.city,
  firmName:      s.firm_name,
  lat:           parseFloat(s.lat),
  lng:           parseFloat(s.lng),
  noPackages:    s.no_packages ?? 0,
  totalCube:     parseFloat(s.total_cube ?? 0),
  isBulkStop:    s.is_bulk_stop ?? false,
  actualRoute:   s.actual_route ?? "",
  workAreaNumber: s.work_area_number ?? "",
})).filter(s => !isNaN(s.lat) && !isNaN(s.lng));

console.log(`Stops loaded: ${stops.length}`);

// Group by actualRoute
const groups = new Map();
for (const s of stops) {
  const key = s.actualRoute?.trim() || "";
  if (key) { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(s); }
}

// Assign unrouted stops via polygon → nearest centroid
const unrouted = stops.filter(s => !s.actualRoute?.trim());
const groupNames = [...groups.keys()];
const getCent = name => centroid(groups.get(name).map(s=>({lat:s.lat,lng:s.lng})));

for (const s of unrouted) {
  let assigned = "";
  for (const area of parsedAreas) {
    if (pip(s.lat, s.lng, area.poly)) {
      const match = groupNames.find(n => n.toLowerCase().includes(area.name.toLowerCase().slice(0,5)));
      if (match) { assigned = match; break; }
    }
  }
  if (!assigned && groupNames.length) {
    let bestName = groupNames[0], bestD = Infinity;
    for (const name of groupNames) {
      const c = getCent(name);
      const d = dist(s.lat, s.lng, c.lat, c.lng);
      if (d < bestD) { bestD = d; bestName = name; }
    }
    assigned = bestName;
  }
  if (assigned) groups.get(assigned).push(s);
}

// Build route groups
let routeGroups = [...groups.entries()].map(([name, stps]) => {
  const c = centroid(stps.map(s=>({lat:s.lat,lng:s.lng})));
  const cap = capacityMap[name] ?? defaultCapacity;
  return { name, stops: stps, totalCube: stps.reduce((s,x)=>s+(x.totalCube??0),0),
    vehicleCapacity: cap, cubeCap: cap*LOAD_THRESHOLD, centLat: c.lat, centLng: c.lng };
});

const originalCount = routeGroups.length;

// Merge to driverCount
let attempts = 0;
while (routeGroups.length > DRIVER_COUNT && attempts++ < routeGroups.length**2) {
  routeGroups.sort((a,b)=>a.totalCube-b.totalCube);
  const sm = routeGroups[0];
  let bestIdx=-1, bestD=Infinity;
  for (let i=1;i<routeGroups.length;i++) {
    const t=routeGroups[i];
    if (t.totalCube+sm.totalCube > Math.max(t.cubeCap,sm.cubeCap)) continue;
    if (t.stops.length+sm.stops.length > MAX_STOPS) continue;
    const d=dist(sm.centLat,sm.centLng,t.centLat,t.centLng);
    if (d<bestD){bestD=d;bestIdx=i;}
  }
  if (bestIdx===-1) break;
  const t=routeGroups[bestIdx];
  t.stops=[...t.stops,...sm.stops]; t.totalCube+=sm.totalCube;
  t.vehicleCapacity=Math.max(t.vehicleCapacity,sm.vehicleCapacity); t.cubeCap=t.vehicleCapacity*LOAD_THRESHOLD;
  const c=centroid(t.stops.map(s=>({lat:s.lat,lng:s.lng}))); t.centLat=c.lat; t.centLng=c.lng;
  routeGroups.splice(0,1);
}

// Step 4b: border redistribution to enforce MIN_STOPS (Zirconia isolated)
{
  const needsTopUp = () => routeGroups.find(rg => !isZirconia(rg.name) && rg.stops.length < MIN_STOPS);
  let underMin = needsTopUp();
  let guard = routeGroups.length * MIN_STOPS;
  while (underMin && guard-- > 0) {
    const neighbors = routeGroups
      .filter(rg => rg !== underMin && !isZirconia(rg.name) && rg.stops.length > MIN_STOPS)
      .sort((a,b) => dist(underMin.centLat,underMin.centLng,a.centLat,a.centLng) - dist(underMin.centLat,underMin.centLng,b.centLat,b.centLng));
    let moved = false;
    for (const donor of neighbors) {
      let borderStop=null, borderD=Infinity;
      for (const s of donor.stops) {
        const d=dist(underMin.centLat,underMin.centLng,s.lat,s.lng);
        if (d<borderD){borderD=d;borderStop=s;}
      }
      if (!borderStop) continue;
      donor.stops=donor.stops.filter(s=>s!==borderStop); donor.totalCube-=borderStop.totalCube??0;
      const dc=centroid(donor.stops.map(s=>({lat:s.lat,lng:s.lng}))); donor.centLat=dc.lat; donor.centLng=dc.lng;
      underMin.stops.push(borderStop); underMin.totalCube+=borderStop.totalCube??0;
      const uc=centroid(underMin.stops.map(s=>({lat:s.lat,lng:s.lng}))); underMin.centLat=uc.lat; underMin.centLng=uc.lng;
      moved=true; break;
    }
    if (!moved) break;
    if (underMin.stops.length >= MIN_STOPS) underMin = needsTopUp();
  }
}

// Sequence routes
console.log("Sequencing routes via OSRM...");
const planned = await Promise.all(routeGroups.map(async (rg, idx) => {
  const sequenced = await sequenceRoute(rg.stops, depot);
  const cubePct = Math.round((rg.totalCube / rg.vehicleCapacity) * 100);
  return {
    routeIndex: idx+1, name: rg.name, stopCount: sequenced.length,
    cubePct, estMiles: Math.round(routeDist(sequenced,depot)*10)/10,
    stops: sequenced.map(s => ({ waypointId: s.waypointId })),
  };
}));

planned.sort((a,b) => dist(depot.lat,depot.lng,
  routeGroups[a.routeIndex-1].centLat, routeGroups[a.routeIndex-1].centLng) -
  dist(depot.lat,depot.lng, routeGroups[b.routeIndex-1].centLat, routeGroups[b.routeIndex-1].centLng));

console.log("\nPlan:");
for (const r of planned) {
  const flag = r.stopCount < MIN_STOPS && !isZirconia(r.name) ? " ⚠️" : "";
  console.log(`  ${r.name.padEnd(22)} ${String(r.stopCount).padStart(3)} stops  ${r.cubePct}% cube${flag}`);
}
console.log(`\nTotal stops: ${planned.reduce((s,r)=>s+r.stopCount,0)}`);

// ── DRO Login ────────────────────────────────────────────────────────────────
const username = getEnv("DRO_USERNAME"), password = getEnv("DRO_PASSWORD");
console.log("\nLogging into DRO...");

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ["--no-sandbox","--disable-setuid-sandbox"],
});

const page = await browser.newPage();
page.on("dialog", async d => { try { await d.dismiss(); } catch {} });
await page.goto(DRO_BASE, { waitUntil: "networkidle2" });
const popupPromise = new Promise(resolve => browser.once("targetcreated", t => resolve(t.page())));
await page.click("button::-p-text(Service Provider)");
const popup = await popupPromise;
await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(()=>{});
popup.on("dialog", async d => { try { await d.dismiss(); } catch {} });
try { await popup.waitForSelector("button::-p-text(Block)",{timeout:4000}); await popup.click("button::-p-text(Block)"); } catch {}
await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
await popup.type('input[name="identifier"]', username);
await popup.click('input[type="submit"]');
await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
await popup.type('input[type="password"]', password);
const btn = await popup.$('input[type="submit"], button[type="submit"]');
if (btn) await btn.click(); else await popup.keyboard.press("Enter");
await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(()=>{});
await new Promise(r=>setTimeout(r,3000));
await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
const stations = await page.$$('[class*="station" i]');
if (stations.length) await stations[0].click();
await new Promise(r=>setTimeout(r,3000));
const cookies = await page.cookies();
const cookieHeader = cookies.map(c=>`${c.name}=${c.value}`).join("; ");
await browser.close();
console.log("Logged in.");

const headers = { Cookie: cookieHeader, "Content-Type": "application/json" };

// Get active route plan + sort date
const planRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`, { headers });
const plan = await planRes.json();
const routePlanId = plan.planId;
const sdRes = await fetch(`${DRO_BASE}/api/api/stations/${STATION_ID}/sortDate`, { headers });
const sortDate = (await sdRes.text()).trim().replace(/^"|"$/g,"");
console.log(`Route plan: ${routePlanId} | Sort date: ${sortDate}`);

// Transfer routes
console.log("\nTransferring routes...");
const transfers = [];
for (const r of planned) {
  if (!r.stops.length) continue;
  const res = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints/transferRoute?`, {
    method: "POST", headers,
    body: JSON.stringify({ route: r.name, waypointIds: r.stops.map(s=>s.waypointId), sort_date: sortDate }),
  });
  const body = await res.json().catch(()=>({}));
  transfers.push({ route: r.name, stops: r.stops.length, ok: res.ok, msg: body?.message ?? "" });
  console.log(`  ${res.ok?"✓":"✗"} ${r.name} (${r.stops.length} stops)`);
}

const failed = transfers.filter(t=>!t.ok);
if (failed.length) { console.error("Failed transfers:", failed); process.exit(1); }

// Trigger solve
const waveRes = await fetch(`${DRO_BASE}/api/api/stations/${STATION_ID}/dispatch-settings`, { headers });
const waveData = await waveRes.json();
const waveId = waveData?.waves?.[0]?.waveId ?? 84167;

const solveRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/create_solution_by_wave`, {
  method: "POST", headers,
  body: JSON.stringify({ alternateSolver:false, createInformedOptimal:false, submittedByStationUser:false,
    waves:[{ waveId, routePlanId, wave:1 }] }),
});
const solveBody = await solveRes.json().catch(()=>({}));
if (!solveRes.ok) { console.error("Solve failed:", solveBody); process.exit(1); }

console.log(`\n✓ Done — job ${solveBody.id}, sort date ${solveBody.sortDate}`);
