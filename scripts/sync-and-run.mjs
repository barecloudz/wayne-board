/**
 * Sync DRO stops then immediately build + push routes
 * Usage: node scripts/sync-and-run.mjs [driverCount]
 */
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const DRIVER_COUNT = parseInt(args[0] ?? "13");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DRO_BASE = "https://dro.routesmart.com";
const SA_ID = "3060743";
const STATION_ID = "259";

const env = readFileSync(".env.local", "utf8");
const getEnv = k => env.match(new RegExp(k + "=(.+)"))?.[1]?.trim();
const DATABASE_URL = getEnv("DATABASE_URL_POOLER") || getEnv("DATABASE_URL");
const sql = neon(DATABASE_URL);
const username = getEnv("DRO_USERNAME");
const password = getEnv("DRO_PASSWORD");

// ── Login helper ─────────────────────────────────────────────────────────────
async function droLogin() {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  page.on("dialog", async d => { try { await d.dismiss(); } catch {} });
  await page.goto(DRO_BASE, { waitUntil: "networkidle2" });
  const popupPromise = new Promise(resolve => browser.once("targetcreated", t => resolve(t.page())));
  await page.click("button::-p-text(Service Provider)");
  const popup = await popupPromise;
  await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  popup.on("dialog", async d => { try { await d.dismiss(); } catch {} });
  try { await popup.waitForSelector("button::-p-text(Block)", { timeout: 4000 }); await popup.click("button::-p-text(Block)"); } catch {}
  await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
  await popup.type('input[name="identifier"]', username);
  await popup.click('input[type="submit"]');
  await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
  await popup.type('input[type="password"]', password);
  const btn = await popup.$('input[type="submit"], button[type="submit"]');
  if (btn) await btn.click(); else await popup.keyboard.press("Enter");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));
  await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
  const stations = await page.$$('[class*="station" i]');
  if (stations.length) await stations[0].click();
  await new Promise(r => setTimeout(r, 3000));
  const cookies = await page.cookies();
  await browser.close();
  return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}

// ── Geometry helpers ─────────────────────────────────────────────────────────
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
  let t = dist(depot.lat,depot.lng,stops[0].lat,stops[0].lng);
  for (let i=1;i<stops.length;i++) t += dist(stops[i-1].lat,stops[i-1].lng,stops[i].lat,stops[i].lng);
  return t;
}
function parseWkt(wkt) {
  return wkt.replace(/^POLYGON\s*\(\(/i,"").replace(/\)\)$/,"").split(",")
    .map(p=>{const[a,b]=p.trim().split(/\s+/);return[parseFloat(a),parseFloat(b)];});
}
function pip(lat,lng,poly) {
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
    if(yi>lat!==yj>lat&&lng<((xj-xi)*(lat-yi))/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}

// ── OSRM ────────────────────────────────────────────────────────────────────
async function getOsrmMatrix(points) {
  if (process.env.SKIP_OSRM === "1") return null;
  try {
    const coords = points.map(p=>`${p.lng},${p.lat}`).join(";");
    const res = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`,
      { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const d = await res.json();
    if (d.code !== "Ok" || !d.durations) return null;
    return d.durations.map(row => row.map(v => (v==null||v<0) ? 999999 : v));
  } catch { return null; }
}
function nnByMatrix(cands, start, mat) {
  const u=[...cands],o=[]; let cur=start;
  while(u.length){let b=0,bt=Infinity; for(let i=0;i<u.length;i++){const t=mat[cur]?.[u[i]]??Infinity;if(t<bt){bt=t;b=i;}} const n=u.splice(b,1)[0];o.push(n);cur=n;} return o;
}
function twoOptMat(r,dep,mat){
  if(r.length<4)return r; let improved=true;
  while(improved){improved=false; for(let i=0;i<r.length-1;i++) for(let j=i+2;j<r.length;j++){
    const a=i===0?dep:r[i-1],nxt=j+1<r.length?r[j+1]:dep;
    const before=(mat[a]?.[r[i]]??0)+(mat[r[j]]?.[nxt]??0), after=(mat[a]?.[r[j]]??0)+(mat[r[i]]?.[nxt]??0);
    if(after<before-0.01){r=[...r.slice(0,i),...r.slice(i,j+1).reverse(),...r.slice(j+1)];improved=true;}
  }} return r;
}
function nnHav(stops,from){const u=[...stops],o=[];let cur=from; while(u.length){let b=0,bd=Infinity; for(let i=0;i<u.length;i++){const d=dist(cur.lat,cur.lng,u[i].lat,u[i].lng);if(d<bd){bd=d;b=i;}} const n=u.splice(b,1)[0];o.push(n);cur=n;} return o;}
async function seqRoute(stops, depot) {
  const reg=stops.filter(s=>!s.isBulkStop), bulk=stops.filter(s=>s.isBulkStop);
  const pts=[depot,...reg,...bulk], mat=await getOsrmMatrix(pts);
  if(mat){
    const DEPOT=0,ri=reg.map((_,i)=>i+1),bi=bulk.map((_,i)=>reg.length+1+i);
    const or=twoOptMat(nnByMatrix(ri,DEPOT,mat),DEPOT,mat);
    const lr=or.length?or[or.length-1]:DEPOT;
    return [...or.map(i=>pts[i]),...nnByMatrix(bi,lr,mat).map(i=>pts[i])];
  }
  const opt=nnHav(reg,depot); return [...opt,...nnHav(bulk,opt.length?opt[opt.length-1]:depot)];
}

const LOAD_THRESHOLD=0.85, MAX_STOPS=150, MIN_STOPS=80;
const isZirconia = n => n.toLowerCase().includes("zirconia");
const merc2lat = y => (180/Math.PI)*(2*Math.atan(Math.exp((y/20037508.34)*Math.PI))-Math.PI/2);
const merc2lng = x => (x/20037508.34)*180;

// ════════════════════════════════════════════════════════════════════════════
console.log("Logging into DRO...");
const cookieHeader = await droLogin();
const headers = { Cookie: cookieHeader, "Content-Type": "application/json" };
console.log("Logged in.");

// ── Pull fresh data from DRO ─────────────────────────────────────────────────
const sdText = (await (await fetch(`${DRO_BASE}/api/api/stations/${STATION_ID}/sortDate`,{headers})).text()).trim().replace(/^"|"$/g,"");
const sortDate = /^\d{4}-\d{2}-\d{2}$/.test(sdText) ? sdText : new Date().toISOString().slice(0,10);
console.log("Sort date:", sortDate);

const planRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/active-route-plan`,{headers});
const plan = await planRes.json();
const routePlanId = plan.planId;
console.log("Route plan:", routePlanId);

console.log("Fetching waypoints from DRO...");
const [waypoints, unroutable, routes, anchorAreas, vehicleSet] = await Promise.all([
  fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints?solutionType=actual&routePlanId=${routePlanId}`,{headers}).then(r=>r.json()),
  fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/UnroutableWaypoints?`,{headers}).then(r=>r.json()).then(d=>d?.eligible??[]).catch(()=>[]),
  fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/route-summary?stationId=${STATION_ID}&solutionType=actual`,{headers}).then(r=>r.json()),
  fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area`,{headers}).then(r=>r.json()),
  fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/route-plans/${routePlanId}/advanced-vehicle-set-with-routes`,{headers}).then(r=>r.json()).catch(()=>({advancedVehicleSet:[]})),
]);
const planVehicleNames = (vehicleSet?.advancedVehicleSet ?? []).map(v => v.vehicleName?.trim()).filter(Boolean);
console.log(`Waypoints: ${waypoints.length} assigned + ${unroutable.length} unroutable`);
console.log(`Plan vehicles (${planVehicleNames.length}):`, planVehicleNames.join(", "));

// Pull GPS coordinates from ArcGIS
const encWhere = s => encodeURIComponent(s).replace(/'/g,"%27");
const agsWhere = encWhere(`sort_date = date'${sortDate}' and station_id = '${STATION_ID}' and csa = '304169'`);
const agsParamValues = encodeURIComponent(JSON.stringify({sort_date:sortDate,station_id:STATION_ID}));
const agsLayerParamValues = encodeURIComponent(JSON.stringify([{"8":{sort_date:sortDate,station_id:STATION_ID}},{"13":{sort_date:sortDate,station_id:STATION_ID}}]));
const agsInner = `http://AGS_URL/rest/services/DRO_Layers/MapServer/8/query?f=json&outFields=wid,route&where=${agsWhere}&returnGeometry=true&outSR=102100&parameterValues=${agsParamValues}&layerParameterValues=${agsLayerParamValues}`;
const agsUrl = `${DRO_BASE}/api/api/Proxy?${agsInner}`;
let agsFeatures = [];
try {
  const agsRes = await fetch(agsUrl, {headers});
  const agsData = await agsRes.json().catch(()=>({}));
  agsFeatures = agsData?.features ?? [];
} catch {}
const widCoords = {};
for (const f of agsFeatures) {
  if (f.geometry?.x!=null && f.attributes?.wid!=null) {
    const x=f.geometry.x, y=f.geometry.y;
    widCoords[String(f.attributes.wid)] = [Math.abs(y)>90?merc2lat(y):y, Math.abs(x)>180?merc2lng(x):x];
  }
}
console.log(`GPS coords: ${Object.keys(widCoords).length}`);

// Build stop list from fresh DRO data
const allWaypoints = [
  ...waypoints.map(w=>({...w,_assigned:true})),
  ...unroutable.map(w=>({...w,_assigned:false})),
];
const stops = allWaypoints.map(w => {
  const coords = widCoords[String(w.wid)] ?? [null,null];
  return {
    waypointId:  w.waypointId ?? "",
    address:     w.address ?? "",
    city:        w.city ?? "",
    firmName:    w.firmName ?? "",
    lat:         coords[0],
    lng:         coords[1],
    noPackages:  w.noPackages ?? 0,
    totalCube:   parseFloat(w.totalCube ?? 0),
    isBulkStop:  w.isBulkStop ?? false,
    actualRoute: w._assigned ? (w.actualRoute ?? "") : "",
    workAreaNumber: w.workAreaNumber ?? "",
  };
}).filter(s => s.lat!=null && s.lng!=null && !isNaN(s.lat) && !isNaN(s.lng));

console.log(`Stops with coords: ${stops.length} / ${allWaypoints.length}`);

// Capacity map
const capacityMap = {};
for (const r of routes) {
  const cap = parseFloat(r.vehicleCapacity);
  if (!isNaN(cap) && cap > 0) capacityMap[r.workAreaName?.trim()] = cap;
}
const defaultCapacity = Object.values(capacityMap).filter(v=>v>0).length
  ? Math.min(...Object.values(capacityMap).filter(v=>v>0)) : 300;

// Anchor areas (convert EPSG:3857 rings → WGS84 WKT-like parsed polygons)
const parsedAreas = anchorAreas.map(a => {
  let rings = [];
  try {
    const shape = typeof a.shape === "string" ? JSON.parse(a.shape) : a.shape;
    rings = shape?.rings?.[0] ?? [];
  } catch {}
  // Convert EPSG:3857 → WGS84
  const poly = rings.map(([x,y]) => [merc2lng(x), merc2lat(y)]);
  return { name: a.name, poly };
}).filter(a => a.poly.length > 2);

// ── Group stops ──────────────────────────────────────────────────────────────
// Seed from the vehicle set — this gives us ALL routes in the plan even if
// they currently have 0 stops (like EXTRA 2).
const groups = new Map();
for (const name of planVehicleNames) groups.set(name, []);
// Also pick up any actualRoute values not in the vehicle set
for (const s of stops) {
  const key = s.actualRoute?.trim() || "";
  if (key && !groups.has(key)) groups.set(key, []);
}

// Assign stops: use actualRoute if set and it matches a known group,
// otherwise assign via polygon → nearest centroid
const groupNames = [...groups.keys()];
const getCent = name => {
  const g = groups.get(name);
  if (!g || g.length === 0) return null;
  return centroid(g.map(s=>({lat:s.lat,lng:s.lng})));
};

// Pre-compute centroids from route-summary data (use DRO's own stop coords as seeds)
// by doing a first-pass assignment using actualRoute for assigned stops
for (const s of stops) {
  const key = s.actualRoute?.trim();
  if (key && groups.has(key)) groups.get(key).push(s);
}
// Assign unrouted stops via polygon → nearest centroid
for (const s of stops.filter(s => !s.actualRoute?.trim())) {
  let assigned = "";
  for (const area of parsedAreas) {
    if (pip(s.lat,s.lng,area.poly)) {
      const match = groupNames.find(n=>n.toLowerCase().includes(area.name.toLowerCase().slice(0,5)));
      if (match) { assigned=match; break; }
    }
  }
  if (!assigned) {
    let bestName=groupNames[0], bestD=Infinity;
    for (const name of groupNames) {
      const c = getCent(name);
      if (!c) continue;
      const d=dist(s.lat,s.lng,c.lat,c.lng); if(d<bestD){bestD=d;bestName=name;}
    }
    assigned=bestName;
  }
  if (assigned) groups.get(assigned).push(s);
}
// Remove empty groups (routes that got no stops at all after assignment)
for (const [name, stps] of groups) {
  if (stps.length === 0) groups.delete(name);
}

// Build route groups
let routeGroups = [...groups.entries()].map(([name,stps]) => {
  const c=centroid(stps.map(s=>({lat:s.lat,lng:s.lng}))), cap=capacityMap[name]??defaultCapacity;
  return {name, stops:stps, totalCube:stps.reduce((s,x)=>s+(x.totalCube??0),0),
    vehicleCapacity:cap, cubeCap:cap*LOAD_THRESHOLD, centLat:c.lat, centLng:c.lng};
});

// Merge to driverCount
let attempts=0;
while(routeGroups.length>DRIVER_COUNT && attempts++<routeGroups.length**2){
  routeGroups.sort((a,b)=>a.totalCube-b.totalCube);
  const sm=routeGroups[0]; let bestIdx=-1, bestD=Infinity;
  for(let i=1;i<routeGroups.length;i++){
    const t=routeGroups[i];
    if(t.totalCube+sm.totalCube>Math.max(t.cubeCap,sm.cubeCap))continue;
    if(t.stops.length+sm.stops.length>MAX_STOPS)continue;
    const d=dist(sm.centLat,sm.centLng,t.centLat,t.centLng); if(d<bestD){bestD=d;bestIdx=i;}
  }
  if(bestIdx===-1)break;
  const t=routeGroups[bestIdx];
  t.stops=[...t.stops,...sm.stops]; t.totalCube+=sm.totalCube;
  t.vehicleCapacity=Math.max(t.vehicleCapacity,sm.vehicleCapacity); t.cubeCap=t.vehicleCapacity*LOAD_THRESHOLD;
  const c=centroid(t.stops.map(s=>({lat:s.lat,lng:s.lng}))); t.centLat=c.lat; t.centLng=c.lng;
  routeGroups.splice(0,1);
}

// Border redistribution — enforce MIN_STOPS (Zirconia isolated)
{
  const needsTopUp = () => routeGroups.find(rg => !isZirconia(rg.name) && rg.stops.length < MIN_STOPS);
  let underMin=needsTopUp(), guard=routeGroups.length*MIN_STOPS;
  while(underMin && guard-->0){
    const neighbors=routeGroups
      .filter(rg=>rg!==underMin&&!isZirconia(rg.name)&&rg.stops.length>MIN_STOPS)
      .sort((a,b)=>dist(underMin.centLat,underMin.centLng,a.centLat,a.centLng)-dist(underMin.centLat,underMin.centLng,b.centLat,b.centLng));
    let moved=false;
    for(const donor of neighbors){
      let borderStop=null, borderD=Infinity;
      for(const s of donor.stops){const d=dist(underMin.centLat,underMin.centLng,s.lat,s.lng);if(d<borderD){borderD=d;borderStop=s;}}
      if(!borderStop)continue;
      donor.stops=donor.stops.filter(s=>s!==borderStop); donor.totalCube-=borderStop.totalCube??0;
      const dc=centroid(donor.stops.map(s=>({lat:s.lat,lng:s.lng}))); donor.centLat=dc.lat; donor.centLng=dc.lng;
      underMin.stops.push(borderStop); underMin.totalCube+=borderStop.totalCube??0;
      const uc=centroid(underMin.stops.map(s=>({lat:s.lat,lng:s.lng}))); underMin.centLat=uc.lat; underMin.centLng=uc.lng;
      moved=true; break;
    }
    if(!moved)break;
    if(underMin.stops.length>=MIN_STOPS) underMin=needsTopUp();
  }
}

// ── Balance: donate border stops from overloaded routes to lightest neighbor ─
{
  const avg = Math.round(routeGroups.reduce((s,rg)=>s+rg.stops.length,0) / routeGroups.length);
  const HIGH = avg + 10; // anything 10+ above average is overloaded
  let guard = routeGroups.length * 50;
  let overloaded = () => routeGroups.filter(rg=>rg.stops.length>HIGH).sort((a,b)=>b.stops.length-a.stops.length)[0];
  let heavy = overloaded();
  while(heavy && guard-->0){
    // Find lightest neighbor (by centroid proximity)
    const light = routeGroups
      .filter(rg=>rg!==heavy && rg.stops.length < avg)
      .sort((a,b)=>dist(heavy.centLat,heavy.centLng,a.centLat,a.centLng)-dist(heavy.centLat,heavy.centLng,b.centLat,b.centLng))[0];
    if(!light)break;
    // Take the stop from heavy that is closest to light's centroid (border stop)
    let borderStop=null, borderD=Infinity;
    for(const s of heavy.stops){const d=dist(light.centLat,light.centLng,s.lat,s.lng);if(d<borderD){borderD=d;borderStop=s;}}
    if(!borderStop)break;
    heavy.stops=heavy.stops.filter(s=>s!==borderStop); heavy.totalCube-=borderStop.totalCube??0;
    const hc=centroid(heavy.stops.map(s=>({lat:s.lat,lng:s.lng}))); heavy.centLat=hc.lat; heavy.centLng=hc.lng;
    light.stops.push(borderStop); light.totalCube+=borderStop.totalCube??0;
    const lc=centroid(light.stops.map(s=>({lat:s.lat,lng:s.lng}))); light.centLat=lc.lat; light.centLng=lc.lng;
    heavy = overloaded();
  }
}

// Sequence
console.log("Sequencing via OSRM...");
const planned = await Promise.all(routeGroups.map(async (rg,idx) => {
  const seq=await seqRoute(rg.stops, {lat:35.421,lng:-82.5022});
  return { name:rg.name, stopCount:seq.length, cubePct:Math.round((rg.totalCube/rg.vehicleCapacity)*100),
    stops:seq.map(s=>({waypointId:s.waypointId})) };
}));

console.log("\nPlan:");
for(const r of planned){
  const flag=r.stopCount<MIN_STOPS&&!isZirconia(r.name)?" ⚠️":"";
  console.log(`  ${r.name.padEnd(22)} ${String(r.stopCount).padStart(3)} stops  ${r.cubePct}% cube${flag}`);
}
console.log(`Total: ${planned.reduce((s,r)=>s+r.stopCount,0)} stops`);

// Transfer
console.log("\nPushing to DRO...");
for(const r of planned){
  if(!r.stops.length)continue;
  const res=await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/waypoints/transferRoute?`,{
    method:"POST",headers,body:JSON.stringify({route:r.name,waypointIds:r.stops.map(s=>s.waypointId),sort_date:sortDate})});
  const body=await res.json().catch(()=>({}));
  console.log(`  ${res.ok?"✓":"✗"} ${r.name} (${r.stops.length})`);
  if(!res.ok) console.error("    ",body);
}

// Solve
const waveRes=await fetch(`${DRO_BASE}/api/api/stations/${STATION_ID}/dispatch-settings`,{headers});
const waveData=await waveRes.json();
const waveId=waveData?.waves?.[0]?.waveId??84167;
const solveRes=await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/create_solution_by_wave`,{
  method:"POST",headers,body:JSON.stringify({alternateSolver:false,createInformedOptimal:false,submittedByStationUser:false,waves:[{waveId,routePlanId,wave:1}]})});
const solveBody=await solveRes.json().catch(()=>({}));
console.log(`\n✓ Done — job ${solveBody.id}, sort date ${solveBody.sortDate}`);
