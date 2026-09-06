/**
 * ryde-report-aug.mjs
 * Reads ~/Downloads/ryde-scores.csv → exports PDF + HTML preview
 * Run: node scripts/ryde-report-aug.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import os from "os";
import puppeteer from "puppeteer";

// ── Parse CSV ──────────────────────────────────────────────────────────────
const csvPath = join(os.homedir(), "Downloads", "ryde-scores.csv");
const raw = readFileSync(csvPath, "utf8");
const lines = raw.trim().split("\n");
const reviews = [];
for (let i = 1; i < lines.length; i++) {
  const cols=[]; let cur="", inQ=false;
  for (const ch of lines[i]) {
    if (ch==='"'){inQ=!inQ;continue;}
    if (ch===","&&!inQ){cols.push(cur);cur="";continue;}
    cur+=ch;
  }
  cols.push(cur);
  const [name,fedexId,date,stars,comment]=cols;
  if (!name||!stars) continue;
  reviews.push({name:name.trim(),fedexId:fedexId.trim(),date:date.trim(),stars:parseInt(stars,10),comment:(comment||"").trim()});
}

// ── Aggregate ──────────────────────────────────────────────────────────────
const driverMap=new Map();
for (const r of reviews){
  if (!driverMap.has(r.name)) driverMap.set(r.name,{name:r.name,fedexId:r.fedexId,reviews:[]});
  driverMap.get(r.name).reviews.push(r);
}
const drivers=Array.from(driverMap.values()).map(d=>{
  const total=d.reviews.length;
  const avg=d.reviews.reduce((s,r)=>s+r.stars,0)/total;
  const dist=[1,2,3,4,5].map(n=>d.reviews.filter(r=>r.stars===n).length);
  const pos=dist[3]+dist[4], neg=dist[0]+dist[1], neu=dist[2];
  return{...d,total,avg,dist,pos,neg,neu,pct:Math.round(pos/total*100)};
}).sort((a,b)=>b.avg-a.avg);

const totalReviews=reviews.length;
const overallAvg=reviews.reduce((s,r)=>s+r.stars,0)/totalReviews;
const totalPos=reviews.filter(r=>r.stars>=4).length;
const totalNeg=reviews.filter(r=>r.stars<=2).length;
const totalNeu=reviews.filter(r=>r.stars===3).length;
const posPct=Math.round(totalPos/totalReviews*100);
const negPct=Math.round(totalNeg/totalReviews*100);

// ── Design tokens (Apple glass) ───────────────────────────────────────────
const SILVER  = "#2C2C2E";     // Apple dark silver header
const SILVER2 = "#3A3A3C";     // Lighter silver
const GOLD    = "#C9A44E";     // Gold accent line
const GREEN   = "#30D158";     // Apple green
const RED     = "#FF453A";     // Apple red
const AMBER   = "#FF9F0A";     // Apple amber/orange
const PAGE_BG = "#F5F5F7";    // Apple light gray page
const CARD_BG = "rgba(255,255,255,0.85)";
const BORDER  = "rgba(255,255,255,0.7)";
const RING_COLORS=["#0071E3","#C9A44E","#30D158","#BF5AF2","#FF453A","#64D2FF","#FF9F0A","#AC8E68"];

const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
function scoreColor(avg){return avg>=4.2?GREEN:avg>=3.0?AMBER:RED;}
function tier(avg){return avg>=4.2?"Excellent":avg>=3.0?"Good":avg>=2.0?"Fair":"Needs Work";}

// ── SVG: Semi-circle gauge ─────────────────────────────────────────────────
function gaugeSvg(value,w=190,h=126){
  const cx=w/2,cy=h-8,r=Math.min(cx-18,cy-14),sw=11;
  const p=Math.min(value/5,0.9999);
  const ang=(1-p)*Math.PI;
  const ex=(cx+r*Math.cos(ang)).toFixed(2),ey=(cy-r*Math.sin(ang)).toFixed(2);
  const color=scoreColor(value);
  const ticks=[1,2,3,4,5].map(v=>{
    const a=(1-v/5)*Math.PI;
    const ox=(cx+(r+sw/2+5)*Math.cos(a)).toFixed(1),oy=(cy-(r+sw/2+5)*Math.sin(a)).toFixed(1);
    const tx=(cx+(r+sw/2+14)*Math.cos(a)).toFixed(1),ty=(cy-(r+sw/2+14)*Math.sin(a)+3).toFixed(1);
    return `<line x1="${(cx+(r-sw/2-2)*Math.cos(a)).toFixed(1)}" y1="${(cy-(r-sw/2-2)*Math.sin(a)).toFixed(1)}" x2="${ox}" y2="${oy}" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>
            <text x="${tx}" y="${ty}" text-anchor="middle" font-size="7.5" fill="#86868B" font-family="-apple-system,Inter,sans-serif">${v}</text>`;
  }).join("");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${ticks}
    <path d="M ${cx-r},${cy} A ${r},${r} 0 0,1 ${cx+r},${cy}" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="${sw}" stroke-linecap="round"/>
    <path d="M ${cx-r},${cy} A ${r},${r} 0 0,1 ${ex},${ey}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" opacity="0.9"/>
    <text x="${cx}" y="${cy-r*0.3}" text-anchor="middle" font-size="30" font-weight="800" fill="#1D1D1F" font-family="-apple-system,Inter,sans-serif">${value.toFixed(2)}</text>
    <text x="${cx}" y="${cy-r*0.3+19}" text-anchor="middle" font-size="8.5" fill="#86868B" font-family="-apple-system,Inter,sans-serif" letter-spacing="0.05em">OUT OF 5.0</text>
  </svg>`;
}

// ── SVG: Multi-ring ────────────────────────────────────────────────────────
function multiRingSvg(drivers,size=165){
  const N=Math.min(drivers.length,8),cx=size/2,cy=size/2;
  const sw=7.5,gap=4,maxR=size/2-sw/2-4;
  let rings="";
  for(let i=0;i<N;i++){
    const r=maxR-i*(sw+gap),d=drivers[i];
    const p=Math.min(d.avg/5,0.9999),circ=2*Math.PI*r;
    const fill=(circ*p).toFixed(2),rest=(circ*(1-p)).toFixed(2);
    rings+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${RING_COLORS[i]}" stroke-width="${sw}"
      stroke-dasharray="${fill} ${rest}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})" opacity="0.88"/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${rings}
    <text x="${cx}" y="${cy-3}" text-anchor="middle" font-size="19" font-weight="800" fill="#1D1D1F" font-family="-apple-system,Inter,sans-serif">${overallAvg.toFixed(1)}</text>
    <text x="${cx}" y="${cy+13}" text-anchor="middle" font-size="7.5" fill="#86868B" font-family="-apple-system,Inter,sans-serif" letter-spacing="0.06em">AVG</text>
  </svg>`;
}

// ── SVG: Bar chart ────────────────────────────────────────────────────────
function barChartSvg(drivers,w=305){
  const N=Math.min(drivers.length,14),barH=14,gap=5;
  const labelW=68,chartW=w-labelW-28;
  const h=N*(barH+gap)+20;
  let bars="";
  for(let i=0;i<N;i++){
    const d=drivers[i],y=16+i*(barH+gap);
    const bw=Math.max((d.avg/5)*chartW,2).toFixed(1);
    const color=scoreColor(d.avg);
    const name=d.name.length>11?d.name.slice(0,11)+"…":d.name;
    bars+=`
      <text x="${labelW-4}" y="${y+barH*0.72}" font-size="8.5" fill="#6E6E73" text-anchor="end" font-family="-apple-system,Inter,sans-serif">${esc(name)}</text>
      <rect x="${labelW}" y="${y}" width="${chartW}" height="${barH}" rx="3" fill="rgba(0,0,0,0.06)"/>
      <rect x="${labelW}" y="${y}" width="${bw}" height="${barH}" rx="3" fill="${color}" opacity="0.82"/>
      <text x="${labelW+parseFloat(bw)+4}" y="${y+barH*0.72}" font-size="8.5" fill="${color}" font-weight="700" font-family="-apple-system,Inter,sans-serif">${d.avg.toFixed(1)}</text>`;
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <text x="0" y="9" font-size="7.5" font-weight="600" fill="#86868B" letter-spacing="0.1em" font-family="-apple-system,Inter,sans-serif">AVG RATING PER DRIVER</text>
    ${bars}
  </svg>`;
}

// ── Star bars ─────────────────────────────────────────────────────────────
function starBars(dist,total){
  return[5,4,3,2,1].map(n=>{
    const count=dist[n-1],pct=total>0?Math.round(count/total*100):0;
    const color=n>=4?GREEN:n===3?AMBER:RED;
    return`<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
      <span style="font-size:8px;color:#86868B;width:11px;text-align:right;flex-shrink:0">${n}★</span>
      <div style="flex:1;background:rgba(0,0,0,0.07);border-radius:2px;height:5px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${color};min-width:${count>0?2:0}px;opacity:0.85"></div>
      </div>
      <span style="font-size:8px;color:#86868B;width:14px;flex-shrink:0;text-align:right">${count}</span>
    </div>`;
  }).join("");
}

// ── Driver ring ───────────────────────────────────────────────────────────
function driverRing(avg,size=64){
  const cx=size/2,cy=size/2,r=size*0.37,sw=size*0.1;
  const circ=2*Math.PI*r,p=Math.min(avg/5,0.9999);
  const fill=(circ*p).toFixed(2),rest=(circ*(1-p)).toFixed(2);
  const color=scoreColor(avg);
  return`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"
      stroke-dasharray="${fill} ${rest}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})" opacity="0.88"/>
    <text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="${size*0.195}" font-weight="800" fill="${color}" font-family="-apple-system,Inter,sans-serif">${avg.toFixed(1)}</text>
  </svg>`;
}

// ── Section label (Apple style) ────────────────────────────────────────────
const sl=(t)=>`<div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#86868B;margin-bottom:11px">${t}</div>`;

// ── Driver cards ──────────────────────────────────────────────────────────
const driverCards=drivers.map(d=>{
  const color=scoreColor(d.avg);
  const comments=d.reviews
    .filter(r=>r.comment&&r.comment.length>4&&r.comment!=="-"&&r.comment.toLowerCase()!=="no")
    .slice(0,3)
    .map(r=>{
      const dot=r.stars>=4?GREEN:r.stars<=2?RED:AMBER;
      return`<div style="display:flex;gap:7px;padding:5px 0;border-bottom:1px solid rgba(0,0,0,0.05);align-items:flex-start">
        <div style="width:5px;height:5px;border-radius:50%;background:${dot};flex-shrink:0;margin-top:4px"></div>
        <div style="flex:1;font-size:9px;color:#3C3C43;line-height:1.5">${esc(r.comment)}</div>
        <div style="font-size:7.5px;color:#86868B;white-space:nowrap;flex-shrink:0">${r.date}</div>
      </div>`;
    }).join("");
  return`<div style="background:rgba(255,255,255,0.78);border:1px solid rgba(255,255,255,0.6);border-radius:14px;overflow:hidden;break-inside:avoid;box-shadow:0 4px 16px rgba(0,0,0,0.06),0 1px 3px rgba(0,0,0,0.04)">
    <div style="height:2.5px;background:linear-gradient(90deg,${color},${color}AA)"></div>
    <div style="padding:13px">
      <div style="display:flex;gap:11px;align-items:center;margin-bottom:9px">
        <div style="flex-shrink:0">${driverRing(d.avg,62)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;color:#1D1D1F;letter-spacing:-.01em;margin-bottom:1px">${esc(d.name)}</div>
          <div style="font-size:7.5px;color:#86868B;margin-bottom:5px">ID ${esc(d.fedexId)}</div>
          <span style="background:${color}20;color:${color};padding:2px 8px;border-radius:20px;font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">${tier(d.avg)}</span>
        </div>
        <div style="display:flex;gap:10px;flex-shrink:0">
          <div style="text-align:center"><div style="font-size:15px;font-weight:800;color:#1D1D1F">${d.total}</div><div style="font-size:7px;color:#86868B;text-transform:uppercase;letter-spacing:.04em">Total</div></div>
          <div style="text-align:center"><div style="font-size:15px;font-weight:800;color:${GREEN}">${d.pos}</div><div style="font-size:7px;color:#86868B;text-transform:uppercase;letter-spacing:.04em">Pos</div></div>
          <div style="text-align:center"><div style="font-size:15px;font-weight:800;color:${RED}">${d.neg}</div><div style="font-size:7px;color:#86868B;text-transform:uppercase;letter-spacing:.04em">Neg</div></div>
        </div>
      </div>
      <div style="margin-bottom:${comments?9:0}px">${starBars(d.dist,d.total)}</div>
      ${comments?`<div style="border-top:1px solid rgba(0,0,0,0.06);padding-top:7px">${comments}</div>`:""}
    </div>
  </div>`;
}).join("");

// ── KPI cards ─────────────────────────────────────────────────────────────
const kpis=[
  {label:"Total Reviews",  value:totalReviews,          sub:"August 2026",             accent:"#0071E3"},
  {label:"Avg Rating",     value:overallAvg.toFixed(2), sub:"out of 5.0",              accent:scoreColor(overallAvg), suffix:"★"},
  {label:"Positive",       value:posPct+"%",            sub:`${totalPos} reviews (4–5★)`, accent:GREEN},
  {label:"Negative",       value:negPct+"%",            sub:`${totalNeg} reviews (1–2★)`, accent:RED},
  {label:"Drivers",        value:drivers.length,        sub:"reviewed this month",     accent:"#BF5AF2"},
];

// ── Full HTML ─────────────────────────────────────────────────────────────
const html=`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>RYDE Review Report — August 2026</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',-apple-system,sans-serif;background:${PAGE_BG};color:#1D1D1F;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.card{background:rgba(255,255,255,0.82);border:1px solid rgba(255,255,255,0.65);border-radius:14px;padding:16px;box-shadow:0 4px 20px rgba(0,0,0,0.06),0 1px 3px rgba(0,0,0,0.04)}
.page-break{page-break-before:always;break-before:page}
</style>
</head>
<body>

<!-- ══ PAGE 1 ════════════════════════════════════════════════════════════ -->

<!-- HEADER: Dark silver -->
<div style="background:linear-gradient(160deg,${SILVER} 0%,${SILVER2} 50%,${SILVER} 100%);padding:26px 28px 22px;position:relative;overflow:hidden">
  <!-- Gold accent line at top -->
  <div style="position:absolute;top:0;left:0;right:0;height:2.5px;background:linear-gradient(90deg,transparent,${GOLD},#E8C97A,${GOLD},transparent)"></div>
  <!-- Subtle circle decorations -->
  <div style="position:absolute;right:-30px;top:-50px;width:220px;height:220px;border-radius:50%;border:1px solid rgba(255,255,255,0.04)"></div>
  <div style="position:absolute;right:40px;top:-30px;width:130px;height:130px;border-radius:50%;border:1px solid rgba(255,255,255,0.03)"></div>

  <div style="position:relative;display:flex;justify-content:space-between;align-items:flex-end">
    <div>
      <div style="font-size:8px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:${GOLD};margin-bottom:9px">Apparo Group INC &nbsp;·&nbsp; FedEx Ground Contractor</div>
      <h1 style="font-size:25px;font-weight:800;color:#fff;letter-spacing:-.025em;line-height:1.08;margin-bottom:5px">RYDE Customer<br>Review Report</h1>
      <div style="font-size:11px;color:rgba(255,255,255,0.38);letter-spacing:.02em">August 1 – 30, 2026</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:40px;font-weight:900;color:#fff;line-height:1;letter-spacing:-.03em">${overallAvg.toFixed(2)}</div>
      <div style="font-size:8px;color:${GOLD};letter-spacing:.12em;text-transform:uppercase;margin-top:2px">Overall Avg Rating</div>
      <div style="display:flex;gap:12px;margin-top:10px;justify-content:flex-end">
        <div style="text-align:center">
          <div style="font-size:15px;font-weight:800;color:${GREEN}">${posPct}%</div>
          <div style="font-size:7px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:.07em">Positive</div>
        </div>
        <div style="width:1px;background:rgba(255,255,255,0.1)"></div>
        <div style="text-align:center">
          <div style="font-size:15px;font-weight:800;color:${RED}">${negPct}%</div>
          <div style="font-size:7px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:.07em">Negative</div>
        </div>
        <div style="width:1px;background:rgba(255,255,255,0.1)"></div>
        <div style="text-align:center">
          <div style="font-size:15px;font-weight:800;color:#fff">${totalReviews}</div>
          <div style="font-size:7px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:.07em">Reviews</div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- CONTENT -->
<div style="padding:14px 18px 0">

  <!-- KPI STRIP -->
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-bottom:11px">
    ${kpis.map(k=>`
    <div class="card" style="padding:13px 15px;border-top:2.5px solid ${k.accent}">
      <div style="font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#86868B;margin-bottom:8px">${k.label}</div>
      <div style="font-size:24px;font-weight:800;color:#1D1D1F;line-height:1;letter-spacing:-.02em">${k.value}${k.suffix?`<span style="font-size:13px;color:${k.accent}"> ${k.suffix}</span>`:""}</div>
      <div style="font-size:7.5px;color:#AEAEB2;margin-top:5px">${k.sub}</div>
    </div>`).join("")}
  </div>

  <!-- CHARTS -->
  <div style="display:grid;grid-template-columns:1fr 1.9fr 1fr;gap:9px;margin-bottom:11px">

    <!-- Gauge -->
    <div class="card" style="display:flex;flex-direction:column;align-items:center">
      ${sl("Satisfaction Score")}
      ${gaugeSvg(overallAvg,188,124)}
      <div style="display:flex;gap:15px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.06);width:100%;justify-content:center">
        <div style="text-align:center"><div style="font-size:14px;font-weight:800;color:${GREEN}">${posPct}%</div><div style="font-size:7px;color:#86868B;text-transform:uppercase;letter-spacing:.05em">Positive</div></div>
        <div style="text-align:center"><div style="font-size:14px;font-weight:800;color:${AMBER}">${Math.round(totalNeu/totalReviews*100)}%</div><div style="font-size:7px;color:#86868B;text-transform:uppercase;letter-spacing:.05em">Neutral</div></div>
        <div style="text-align:center"><div style="font-size:14px;font-weight:800;color:${RED}">${negPct}%</div><div style="font-size:7px;color:#86868B;text-transform:uppercase;letter-spacing:.05em">Negative</div></div>
      </div>
    </div>

    <!-- Bar chart -->
    <div class="card">
      ${sl("Driver Avg Ratings")}
      ${barChartSvg(drivers,308)}
    </div>

    <!-- Multi-ring -->
    <div class="card" style="display:flex;flex-direction:column;align-items:center">
      ${sl("Progress Overview")}
      ${multiRingSvg(drivers,155)}
      <div style="width:100%;margin-top:9px">
        ${drivers.slice(0,8).map((d,i)=>`
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">
          <div style="width:7px;height:7px;border-radius:50%;background:${RING_COLORS[i]};flex-shrink:0;opacity:0.88"></div>
          <span style="font-size:8px;color:#6E6E73;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.name)}</span>
          <span style="font-size:8px;font-weight:700;color:${RING_COLORS[i]}">${d.avg.toFixed(1)}</span>
        </div>`).join("")}
      </div>
    </div>
  </div>

  <!-- RANKINGS TABLE -->
  <div class="card" style="margin-bottom:0">
    ${sl("All Driver Rankings")}
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="border-bottom:1px solid rgba(0,0,0,0.08)">
          ${["#","Driver","ID","Avg","Reviews","5★","4★","3★","2★","1★","Pos%","Status"].map((h,i)=>`
          <th style="text-align:${i===1||i===11?"left":"center"};font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#AEAEB2;padding:0 4px 7px">${h}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${drivers.map((d,i)=>{
          const color=scoreColor(d.avg);
          return`<tr style="border-bottom:1px solid rgba(0,0,0,0.04)">
            <td style="padding:6px 4px;text-align:center;font-size:9px;font-weight:600;color:#C7C7CC">${i+1}</td>
            <td style="padding:6px 4px"><div style="font-size:10px;font-weight:700;color:#1D1D1F">${esc(d.name)}</div></td>
            <td style="padding:6px 4px;text-align:center;font-size:8px;color:#AEAEB2">${esc(d.fedexId)}</td>
            <td style="padding:6px 4px;text-align:center"><span style="font-size:14px;font-weight:800;color:${color}">${d.avg.toFixed(2)}</span></td>
            <td style="padding:6px 4px;text-align:center;font-size:10px;font-weight:600;color:#6E6E73">${d.total}</td>
            ${[4,3,2,1,0].map(idx=>{
              const count=d.dist[4-idx];
              const c=[GREEN,GREEN,AMBER,RED,RED][idx];
              return`<td style="padding:6px 4px;text-align:center;font-size:10px;font-weight:700;color:${count>0?c:"#E5E5EA"}">${count}</td>`;
            }).join("")}
            <td style="padding:6px 4px;text-align:center;font-size:10px;font-weight:700;color:${d.pct>=70?GREEN:d.pct>=50?AMBER:RED}">${d.pct}%</td>
            <td style="padding:6px 4px">
              <span style="background:${color}1A;color:${color};padding:2px 8px;border-radius:20px;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap">${tier(d.avg)}</span>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>

  <!-- Footer attribution -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px">
    <div style="font-size:7.5px;color:#AEAEB2;letter-spacing:.04em">Apparo Group INC &nbsp;·&nbsp; FedEx Ground Contractor</div>
    <div style="font-size:7.5px;color:#AEAEB2;font-style:italic">Produced by Blake Nardoni</div>
  </div>
</div>

<!-- ══ PAGE 2 ════════════════════════════════════════════════════════════ -->
<div class="page-break">
  <!-- Page 2 header -->
  <div style="background:linear-gradient(160deg,${SILVER} 0%,${SILVER2} 50%,${SILVER} 100%);padding:18px 24px 16px;position:relative;overflow:hidden">
    <div style="position:absolute;top:0;left:0;right:0;height:2.5px;background:linear-gradient(90deg,transparent,${GOLD},#E8C97A,${GOLD},transparent)"></div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:7.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:${GOLD};margin-bottom:4px">Apparo Group INC</div>
        <h2 style="font-size:17px;font-weight:800;color:#fff;letter-spacing:-.02em">Driver Detail &amp; Customer Feedback</h2>
      </div>
      <div style="text-align:right;font-size:8.5px;color:rgba(255,255,255,0.3)">RYDE &nbsp;·&nbsp; August 2026</div>
    </div>
  </div>

  <!-- Driver cards -->
  <div style="padding:12px 14px 16px;background:${PAGE_BG}">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
      ${driverCards}
    </div>

    <!-- Footer -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:8px;border-top:1px solid rgba(0,0,0,0.07)">
      <div style="font-size:7.5px;color:#AEAEB2">Apparo Group INC &nbsp;·&nbsp; FedEx Ground Contractor</div>
      <div style="font-size:7.5px;color:#AEAEB2;font-style:italic">Produced by Blake Nardoni</div>
    </div>
  </div>
</div>

</body>
</html>`;

// ── Save HTML preview ──────────────────────────────────────────────────────
const htmlPath=join(os.homedir(),"Downloads","ryde-report-aug-2026-preview.html");
writeFileSync(htmlPath,html,"utf8");
console.log(`\n🖥  Preview: ${htmlPath}`);

// ── Render PDF ─────────────────────────────────────────────────────────────
console.log("🎨 Rendering PDF...");
const browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-web-security"]});
const page=await browser.newPage();
await page.setContent(html,{waitUntil:"networkidle0",timeout:30000});
await page.evaluateHandle("document.fonts.ready");
await new Promise(r=>setTimeout(r,1000));

const pdfPath=join(os.homedir(),"Downloads","ryde-report-aug-2026.pdf");
await page.pdf({
  path:pdfPath,format:"A4",printBackground:true,
  margin:{top:"0",right:"0",bottom:"0",left:"0"},
});
await browser.close();

console.log(`✅ PDF: ${pdfPath}`);
console.log(`   ${totalReviews} reviews · ${drivers.length} drivers · ${overallAvg.toFixed(2)}★ · ${posPct}% positive\n`);
