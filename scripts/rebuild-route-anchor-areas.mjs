/**
 * Rebuilds anchor areas for any route using GroundCloud history.
 *
 * Usage:
 *   node scripts/rebuild-route-anchor-areas.mjs --route 470 --dry-run
 *   node scripts/rebuild-route-anchor-areas.mjs --route 470 --skip-fetch
 *   node scripts/rebuild-route-anchor-areas.mjs --route 470
 *
 * What it does:
 *  1. Pulls 30 days of stops for the route from GroundCloud
 *  2. Filters to the PRIMARY driver (most common) — skips coverage days
 *  3. Aggregates unique locations with avg delivery time
 *  4. DBSCAN geographic cluster → tight delivery zones
 *  5. Computes convex hull of ALL stops → territory boundary
 *  6. Voronoi-subdivides the territory using cluster centroids → zero gaps
 *  7. Sequences by avg delivery time
 *  8. Deletes old 0{ROUTE}-xx areas, creates new ones
 *
 * For routes that have pre-existing named parent polygons (like 326),
 * pass --parent-ids 21008965,21008962,... to use those instead of
 * computing from stop data.
 */

import fs from "fs";
import https from "https";
import puppeteer from "puppeteer";
import { neon } from "@neondatabase/serverless";

// ── CLI args ──────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const getArg    = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const hasFlag   = (flag) => args.includes(flag);

const ROUTE_NAME  = getArg("--route");
const DRY_RUN     = hasFlag("--dry-run");
const SKIP_FETCH  = hasFlag("--skip-fetch");
const PARENT_IDS  = getArg("--parent-ids")?.split(",").map(Number).filter(Boolean) ?? [];

if (!ROUTE_NAME) {
  console.error("Usage: node rebuild-route-anchor-areas.mjs --route 470 [--dry-run] [--skip-fetch]");
  process.exit(1);
}

const PREFIX     = `0${ROUTE_NAME}-`;
const CACHE_FILE = `./scripts/${ROUTE_NAME}-raw-stops.json`;

// Tuning
const DAYS_BACK          = 30;
const CLUSTER_EPS_DEG    = 0.005;
const MAX_CLUSTER_STOPS  = 25;
const MIN_CLUSTER_STOPS  = 4;
// MIN_DELIVERY_COUNT is computed dynamically after we know primary driver days:
//   max(2, floor(primaryDays / 5))  — scales with how often they ran the route
const EARLIEST_MINS      = 9 * 60;   // 9 AM — suburban routes start earlier
const LATEST_MINS        = 21 * 60;
const HULL_TERRITORY_BUF = 0.002;    // ~220 m territory boundary buffer

// ── Load env ──────────────────────────────────────────────────────────────────
const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
}

const GC_BASE     = "https://www.groundcloud.io";
const CUSTOMER_ID = 439;
const DRO_BASE    = "https://dro.routesmart.com";
const SA_ID       = "3060743";

// ─��� Math helpers ──────────────────────────────────────────────────────────────
function ll2merc(lat, lng) {
  const x = (lng / 180) * 20037508.34;
  const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / Math.PI * 20037508.34;
  return [x, y];
}
function merc2ll(x, y) {
  const lng = (x / 20037508.34) * 180;
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
  return [lat, lng];
}
function dist(a, b) { return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2); }
function pip(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj-xi)*(lat-yi)/(yj-yi)+xi))) inside = !inside;
  }
  return inside;
}
function centroidOf(pts) {
  return [pts.reduce((s,p)=>s+p[0],0)/pts.length, pts.reduce((s,p)=>s+p[1],0)/pts.length];
}
function toEasternMins(iso) {
  const d = new Date(new Date(iso).getTime() - 4*3600000);
  return d.getUTCHours()*60 + d.getUTCMinutes();
}
function fmtTime(m) {
  let h = Math.floor(m/60), mm = Math.round(m%60);
  if (mm===60){h++;mm=0;}
  return `${h>12?h-12:h||12}:${String(mm).padStart(2,"0")} ${h>=12?"PM":"AM"}`;
}

// ── Convex hull (Andrew's monotone chain) ─────────────────────────────────────
function cross(O,A,B){ return (A[0]-O[0])*(B[1]-O[1])-(A[1]-O[1])*(B[0]-O[0]); }
function convexHull(pts) {
  if (pts.length < 3) return pts;
  const s = [...pts].sort((a,b)=>a[0]!==b[0]?a[0]-b[0]:a[1]-b[1]);
  const lo=[], hi=[];
  for (const p of s) {
    while (lo.length>=2 && cross(lo[lo.length-2],lo[lo.length-1],p)<=0) lo.pop();
    lo.push(p);
  }
  for (let i=s.length-1;i>=0;i--) {
    const p=s[i];
    while (hi.length>=2 && cross(hi[hi.length-2],hi[hi.length-1],p)<=0) hi.pop();
    hi.push(p);
  }
  hi.pop(); lo.pop();
  return [...lo,...hi];
}
function bufferHull(hull, buf) {
  const [cx,cy] = centroidOf(hull);
  return hull.map(([lat,lng])=>{
    const dl=lat-cx, dg=lng-cy, d=Math.sqrt(dl*dl+dg*dg)||1e-9;
    const s=(d+buf)/d;
    return [cx+dl*s, cy+dg*s];
  });
}

// ── Voronoi half-plane clipping ───────────────────────────────────────────────
function clipHalfPlane(poly, ci, cj) {
  const mx=(ci[0]+cj[0])/2, my=(ci[1]+cj[1])/2;
  const nx=ci[0]-cj[0], ny=ci[1]-cj[1];
  function side(p){ return (p[0]-mx)*nx+(p[1]-my)*ny; }
  const out=[];
  for (let i=0;i<poly.length;i++) {
    const a=poly[i], b=poly[(i+1)%poly.length];
    const sa=side(a), sb=side(b);
    if (sa>=0) out.push(a);
    if ((sa>=0)!==(sb>=0)) { const t=sa/(sa-sb); out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]); }
  }
  return out;
}
function voronoiCell(ci, all, ring) {
  let cell=[...ring];
  for (const cj of all) {
    if (cj===ci) continue;
    if (cell.length<3) return [];
    cell=clipHalfPlane(cell,ci,cj);
  }
  return cell.length>=3 ? cell : [];
}

// ── DBSCAN + k-means ──────────────────────────────────────────────────────────
// (locs is defined at module scope after building)
let locs = [];

function dbscan(points, eps) {
  const n=points.length, labels=new Array(n).fill(-1); let cl=0;
  for (let i=0;i<n;i++) {
    if (labels[i]!==-1) continue;
    const nb=points.map((_,j)=>j).filter(j=>j!==i&&dist([points[i].lat,points[i].lng],[points[j].lat,points[j].lng])<=eps);
    labels[i]=cl;
    const q=[...nb];
    while(q.length){ const j=q.shift(); if(labels[j]!==-1)continue; labels[j]=cl; q.push(...points.map((_,k)=>k).filter(k=>k!==j&&dist([points[j].lat,points[j].lng],[points[k].lat,points[k].lng])<=eps&&labels[k]===-1)); }
    cl++;
  }
  const cls=Array.from({length:cl},()=>[]);
  labels.forEach((l,i)=>{ if(l>=0) cls[l].push(i); });
  return cls;
}

function kmeans(indices, k) {
  const s=[...indices].sort((a,b)=>locs[a].avgMins-locs[b].avgMins);
  const step=Math.floor(s.length/k);
  let cents=Array.from({length:k},(_,i)=>{ const idx=s[Math.min(i*step,s.length-1)]; return [locs[idx].lat,locs[idx].lng]; });
  let assign=new Array(indices.length).fill(0);
  for (let iter=0;iter<20;iter++) {
    assign=indices.map(i=>{ let best=0,bd=Infinity; for(let c=0;c<k;c++){const d=dist([locs[i].lat,locs[i].lng],cents[c]);if(d<bd){bd=d;best=c;}} return best; });
    const nc=Array.from({length:k},()=>[0,0,0]);
    assign.forEach((c,ii)=>{nc[c][0]+=locs[indices[ii]].lat;nc[c][1]+=locs[indices[ii]].lng;nc[c][2]++;});
    cents=nc.map(([s0,s1,n],c)=>n?[s0/n,s1/n]:cents[c]);
  }
  const g=Array.from({length:k},()=>[]);
  assign.forEach((c,ii)=>g[c].push(indices[ii]));
  return g.filter(x=>x.length>0);
}

// ── GC helpers ────────────────────────────────────────────────────────────────
function apiGet(cookie, path) {
  return new Promise((resolve,reject)=>{
    https.get({host:"www.groundcloud.io",path,headers:{Cookie:cookie,"X-Requested-With":"XMLHttpRequest"}},(res)=>{
      let d=""; res.on("data",c=>d+=c); res.on("end",()=>{ try{resolve({ok:res.statusCode<400,data:JSON.parse(d)});}catch{resolve({ok:false,data:null}); } });
    }).on("error",reject);
  });
}
async function gcLogin() {
  const br=await puppeteer.launch({headless:true,args:["--no-sandbox"]});
  const pg=await br.newPage();
  await pg.goto("https://www.groundcloud.io/dashboard/login/",{waitUntil:"networkidle2"});
  const u=await pg.$('input[name="auth-username"]')||await pg.$('input[type="text"]');
  const p=await pg.$('input[name="auth-password"]')||await pg.$('input[type="password"]');
  await u.type(process.env.GC_USERNAME||"Blake742Logistics",{delay:30});
  await p.type(process.env.GC_PASSWORD||"dowell2026",{delay:30});
  await pg.evaluate(()=>document.querySelector("form")?.submit());
  await pg.waitForNavigation({waitUntil:"networkidle2",timeout:15000}).catch(()=>{});
  const cookies=await pg.cookies(); await br.close();
  const sid=cookies.find(c=>c.name==="sessionid");
  if(!sid) throw new Error("GC login failed");
  console.log("✓ Logged in to GroundCloud");
  return `sessionid=${sid.value}; csrftoken=${cookies.find(c=>c.name==="csrftoken")?.value||""}`;
}
async function fetchAll(cookie, path) {
  const items=[]; let next=path;
  while(next){
    const {ok,data}=await apiGet(cookie,next);
    if(!ok||!data) break;
    items.push(...(Array.isArray(data)?data:(data.results||[])));
    next=data.next?new URL(data.next).pathname+new URL(data.next).search:null;
  }
  return items;
}

// ─��� Step 1: Pull stops ────────────────────────────────────────────────────────
let rawStops, primaryDriver;

if (SKIP_FETCH && fs.existsSync(CACHE_FILE)) {
  const cached = JSON.parse(fs.readFileSync(CACHE_FILE,"utf8"));
  rawStops = cached.stops; primaryDriver = cached.primaryDriver;
  console.log(`Loaded ${rawStops.length} cached stops (primary driver: ${primaryDriver})`);
} else {
  const cookie = await gcLogin();
  const routes = await fetchAll(cookie, `/api/routes/?customer=${CUSTOMER_ID}&archived=false`);
  const route  = routes.find(r => r.name === ROUTE_NAME);
  if (!route) { console.error(`Route ${ROUTE_NAME} not found`); process.exit(1); }
  console.log(`✓ Route ${ROUTE_NAME} = GC id ${route.id}\n`);

  rawStops = [];
  const driverCounts = {};
  const today = new Date();

  for (let i = 1; i <= DAYS_BACK; i++) {
    const d = new Date(today); d.setDate(d.getDate()-i);
    const day = d.toISOString().slice(0,10);
    const rds = await fetchAll(cookie, `/api/route-days/?customer=${CUSTOMER_ID}&day=${day}&route=${route.id}`);
    for (const rd of rds) {
      if (rd.status !== "COMPLETE" && rd.status !== "STARTED") continue;
      const {ok,data:detail} = await apiGet(cookie, `/api/route-days/${rd.id}/`);
      if (!ok || !detail?.stops) continue;
      const driverName = detail.driver?.user
        ? `${detail.driver.user.first_name} ${detail.driver.user.last_name}`.trim()
        : "Unknown";
      const delivered = detail.stops.filter(s=>s.delivered&&s.lat&&s.lon);
      if (!delivered.length) continue;
      rawStops.push(...delivered.map(s=>({ lat:s.lat, lng:s.lon, deliveredMins:toEasternMins(s.delivered), address:s.recip_street||"", date:day, driver:driverName })));
      driverCounts[driverName] = (driverCounts[driverName]||0) + 1;
      console.log(`  ${day}: ${delivered.length} stops (${driverName})`);
    }
  }

  // Pick primary driver (most days)
  primaryDriver = Object.entries(driverCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "";
  console.log(`\nPrimary driver: ${primaryDriver} (${driverCounts[primaryDriver]} days)`);
  Object.entries(driverCounts).filter(([n])=>n!==primaryDriver).forEach(([n,c])=>console.log(`  Coverage: ${n} (${c} days) — excluded from timing`));

  fs.writeFileSync(CACHE_FILE, JSON.stringify({stops:rawStops, primaryDriver}, null, 2));
  console.log(`Cached → ${CACHE_FILE}`);
}

// ── Step 2: Filter to primary driver for timing, use all for territory ─────────
const primaryStops = rawStops.filter(s => s.driver === primaryDriver);
const allCoords    = rawStops;

// Scale min delivery count to primary driver's days worked
const primaryDays        = new Set(primaryStops.map(s => s.date)).size;
const MIN_DELIVERY_COUNT = Math.max(2, Math.floor(primaryDays / 5));

console.log(`\n${primaryStops.length} stops from ${primaryDriver} across ${primaryDays} days (timing)`);
console.log(`${allCoords.length} total stops (all drivers) for territory`);
console.log(`Min delivery count: ${MIN_DELIVERY_COUNT}`);

// ── Step 3: Aggregate unique locations ───────────────────────────────────────
const locMap = new Map();
for (const s of primaryStops) {
  const key = `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`;
  if (!locMap.has(key)) locMap.set(key, {lat:s.lat,lng:s.lng,times:[],addresses:[]});
  const loc = locMap.get(key);
  loc.times.push(s.deliveredMins);
  if (s.address) loc.addresses.push(s.address);
}
const locsAll = [...locMap.values()].map(loc=>{
  const vt = loc.times.filter(t=>t>=EARLIEST_MINS&&t<=LATEST_MINS);
  const avgMins = (vt.length?vt:loc.times).reduce((a,b)=>a+b,0)/(vt.length||loc.times.length);
  return {lat:loc.lat,lng:loc.lng,avgMins,count:loc.times.length,address:[...new Set(loc.addresses)][0]||""};
});
locs = locsAll.filter(l=>l.count>=MIN_DELIVERY_COUNT&&l.avgMins>=EARLIEST_MINS&&l.avgMins<=LATEST_MINS);
console.log(`\n${locsAll.length} unique locs → ${locs.length} after filtering`);

// ── Step 4: DBSCAN + split/merge ──────────────────────────────────────────────
let clusters = dbscan(locs, CLUSTER_EPS_DEG);
console.log(`DBSCAN: ${clusters.length} initial clusters`);
const split = [];
for (const cl of clusters) {
  if (cl.length<=MAX_CLUSTER_STOPS){split.push(cl);continue;}
  const k=Math.ceil(cl.length/8);
  const parts=kmeans(cl,k);
  split.push(...parts);
  console.log(`  Split ${cl.length} → ${parts.length}`);
}
clusters=split;
let changed=true;
while(changed){
  changed=false;
  for(let i=clusters.length-1;i>=0;i--){
    if(clusters[i].length>=MIN_CLUSTER_STOPS) continue;
    const ci=centroidOf(clusters[i].map(idx=>[locs[idx].lat,locs[idx].lng]));
    let bj=-1,bd=Infinity;
    for(let j=0;j<clusters.length;j++){if(j===i)continue;const d=dist(ci,centroidOf(clusters[j].map(idx=>[locs[idx].lat,locs[idx].lng])));if(d<bd){bd=d;bj=j;}}
    if(bj>=0){clusters[bj].push(...clusters[i]);clusters.splice(i,1);changed=true;}
  }
}
console.log(`After split/merge: ${clusters.length} clusters`);

// ── Step 5: Cluster stats + centroids ─────────────────────────────────────────
const clusterStats = clusters.map(cl=>{
  const avgMins=cl.reduce((s,i)=>s+locs[i].avgMins,0)/cl.length;
  const words=cl.flatMap(i=>locs[i].address.replace(/^\d+\s*/,"").trim().split(/\s+/).slice(0,2));
  const freq={}; for(const w of words) if(w.length>2) freq[w]=(freq[w]||0)+1;
  const landmark=Object.entries(freq).sort((a,b)=>b[1]-a[1])[0]?.[0]??"Area";
  const cap=landmark.charAt(0).toUpperCase()+landmark.slice(1).toLowerCase();
  const centroid=centroidOf(cl.map(idx=>[locs[idx].lat,locs[idx].lng]));
  return {cl,centroid,avgMins,landmark:cap,uniqueLocs:cl.length,totalDeliveries:cl.reduce((s,i)=>s+locs[i].count,0)};
}).sort((a,b)=>a.avgMins-b.avgMins);

const centroids = clusterStats.map(cs=>cs.centroid);

// ── Step 6: Parent polygons ───────────────────────────────────────────────────
const sql   = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);
const [row] = await sql`SELECT value FROM settings WHERE key = 'dro_session_cookies' LIMIT 1`;
if (!row?.value) { console.error("No DRO session"); process.exit(1); }
const droHdrs = { Cookie: row.value, "Content-Type": "application/json" };

const areasRaw = await (await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area`, { headers: droHdrs })).json();

let parentPolygons;

if (PARENT_IDS.length > 0) {
  // Use explicit parent IDs (like route 326)
  parentPolygons = areasRaw
    .filter(a => PARENT_IDS.includes(a.anchorAreaId))
    .map(a => { const s=typeof a.shape==="string"?JSON.parse(a.shape):(a.shape??{}); return (s.rings?.[0]||[]).map(([x,y])=>merc2ll(x,y)); })
    .filter(r=>r.length>=3);
  console.log(`\nUsing ${parentPolygons.length} explicit parent polygons`);
} else {
  // Derive territory from convex hull of PRIMARY DRIVER stops only
  // (using all-drivers data would pull in coverage-day outliers and overlap with adjacent routes)
  const allPts = [...new Map(primaryStops.map(s=>[`${s.lat.toFixed(4)},${s.lng.toFixed(4)}`,[s.lat,s.lng]])).values()];
  const hull   = convexHull(allPts);
  const buffed = bufferHull(hull, HULL_TERRITORY_BUF);
  parentPolygons = [buffed];
  console.log(`\nDerived territory: convex hull of ${allPts.length} unique stops + ${HULL_TERRITORY_BUF}° buffer`);

  // Find existing DRO areas whose centroid falls inside the territory
  const inTerritory = areasRaw.filter(a => {
    if (a.name?.startsWith("0")) return false; // skip numbered route areas
    const s = typeof a.shape==="string"?JSON.parse(a.shape):(a.shape??{});
    const ring = (s.rings?.[0]||[]).map(([x,y])=>merc2ll(x,y));
    if (!ring.length) return false;
    const [clat,clng] = centroidOf(ring);
    return pip(clat, clng, buffed);
  });
  console.log(`Existing DRO areas inside ${ROUTE_NAME} territory: ${inTerritory.length}`);
  inTerritory.slice(0,10).forEach(a=>console.log(`  ${a.anchorAreaId} ${a.name}`));
  if (inTerritory.length>10) console.log(`  ... and ${inTerritory.length-10} more`);
}

// ── Step 7: Voronoi cells ─────────────────────────────────────────────────────
const parentCentroidMap = parentPolygons.map(ring=>{
  const inside=centroids.map((c,i)=>({i,c})).filter(({c})=>pip(c[0],c[1],ring)).map(x=>x.i);
  return {ring,inside};
});
for (const pp of parentCentroidMap) {
  if (pp.inside.length>0) continue;
  const pc=centroidOf(pp.ring);
  let bi=0,bd=Infinity;
  for(let i=0;i<centroids.length;i++){const d=dist(pc,centroids[i]);if(d<bd){bd=d;bi=i;}}
  pp.inside=[bi];
  console.log(`  Unoccupied parent → assigned to cluster ${bi} (${clusterStats[bi].landmark})`);
}

const clusterRings = Array.from({length:clusterStats.length},()=>[]);
for (const {ring,inside} of parentCentroidMap) {
  if (inside.length===1) { clusterRings[inside[0]].push(ring); continue; }
  const ic=inside.map(i=>centroids[i]);
  for (const ci of inside) {
    const cell=voronoiCell(centroids[ci],ic,ring);
    if (cell.length>=3) clusterRings[ci].push(cell);
  }
}

const toCreate = clusterStats
  .map((cs,i)=>{
    const rings=clusterRings[i];
    if(!rings.length) return null;
    const ring=rings.reduce((best,r)=>r.length>best.length?r:best,rings[0]);
    return {ring,avgMins:cs.avgMins,uniqueLocs:cs.uniqueLocs,totalDeliveries:cs.totalDeliveries,landmark:cs.landmark};
  })
  .filter(Boolean)
  .map((a,i)=>({...a,name:`${PREFIX}${String(i+1).padStart(2,"0")}-${a.landmark}`}));

// ── Step 8: Print plan ────────────────────────────────────────────────────────
console.log("\n"+"═".repeat(72));
console.log(`  REBUILD PLAN — ${toCreate.length} anchor areas for route ${ROUTE_NAME} (${primaryDriver})`);
console.log("═".repeat(72));
console.log("  Seq  Name                              Avg Time  Locs  Deliveries");
console.log("  "+"─".repeat(68));
for (const a of toCreate) {
  console.log(`  ${a.name.split("-")[1]}   ${a.name.padEnd(36)} ${fmtTime(a.avgMins)}  ${String(a.uniqueLocs).padStart(4)}  ${String(a.totalDeliveries).padStart(6)}`);
}
console.log();

if (DRY_RUN) { console.log("[DRY RUN] Rerun without --dry-run to apply.\n"); process.exit(0); }

// ── Step 9: Delete old areas ──────────────────────────────────────────────────
const oldAreas = areasRaw.filter(a=>a.name?.startsWith(PREFIX));
console.log(`Deleting ${oldAreas.length} existing ${PREFIX}xx areas...\n`);
for (const area of oldAreas) {
  const body=JSON.stringify({AnchorAreaId:area.anchorAreaId});
  let res=await fetch(`${DRO_BASE}/api/api/anchor-areas/Deleteanchor-areasvalidated`,{method:"DELETE",headers:droHdrs,body});
  if(res.status===409) res=await fetch(`${DRO_BASE}/api/api/anchor-areas/Deleteanchor-areasvalidated?forceDelete=true`,{method:"DELETE",headers:droHdrs,body});
  console.log(`  ${res.ok?"✅":"❌"} Deleted ${area.name} (${area.anchorAreaId}) — HTTP ${res.status}`);
  await new Promise(r=>setTimeout(r,800));
}

// ── Step 10: Create new areas ─────────────────────────────────────────────────
console.log("\nCreating new anchor areas in DRO...\n");
let created=0,failed=0;
const results=[];
for (const area of toCreate) {
  const mercRing=area.ring.map(([lat,lng])=>ll2merc(lat,lng));
  if(mercRing[0][0]!==mercRing[mercRing.length-1][0]) mercRing.push(mercRing[0]);
  const shapeJson=JSON.stringify({spatialReference:{latestWkid:3857,wkid:102100},rings:[mercRing]});
  try {
    const res=await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area`,{
      method:"POST",headers:droHdrs,
      body:JSON.stringify({ServiceAreaId:parseInt(SA_ID),Name:area.name,Station:"",Shape:shapeJson}),
    });
    const text=await res.text();
    const newId=parseInt(text.replace("id:","").trim());
    if(res.ok&&newId){console.log(`✅ ${area.name} → ID ${newId}`);results.push({name:area.name,anchorAreaId:newId});created++;}
    else{console.log(`❌ ${area.name} — HTTP ${res.status}: ${text.slice(0,100)}`);failed++;}
  } catch(err){console.log(`❌ ${area.name} — ${err.message}`);failed++;}
  await new Promise(r=>setTimeout(r,12000));
}
console.log(`\n✅ Created: ${created}   ❌ Failed: ${failed}`);
fs.writeFileSync(`./scripts/rebuilt-anchor-areas-${ROUTE_NAME}.json`, JSON.stringify(results,null,2));
console.log(`Saved IDs → scripts/rebuilt-anchor-areas-${ROUTE_NAME}.json`);
