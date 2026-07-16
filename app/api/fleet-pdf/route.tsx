import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { vehicles, drivers, vehicleConditions } from "@/lib/schema";
import { eq } from "drizzle-orm";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

const CHROMIUM_PACK = "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

export const dynamic = "force-dynamic";

// ── Browser factory ───────────────────────────────────────────────────────────
// If CHROMIUM_PATH is set (local dev / Windows), use that Chrome executable.
// Otherwise use @sparticuz/chromium which provides a binary on Netlify/Lambda.
async function getBrowser() {
  const localChrome = process.env.CHROMIUM_PATH;

  if (localChrome) {
    return puppeteer.launch({
      executablePath: localChrome,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(CHROMIUM_PACK),
    headless: true,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function dateClass(raw: string | null, today: string, soon: string): string {
  if (!raw) return "date-missing";
  if (raw < today) return "date-bad";
  if (raw <= soon) return "date-warn";
  return "date-ok";
}

type VehicleRow = {
  id: number; unitNumber: string; make: string; model: string; year: number;
  type: string; ownership: string; active: boolean;
  mmrDue: string | null; federalInspectionDue: string | null; registrationExpiry: string | null;
};

type ConditionRow = {
  id: number; vehicleId: number; description: string; severity: string;
  repairEstimate: number | null; note: string | null;
};

function complianceStatus(v: VehicleRow, today: string, soon: string) {
  const overdue: string[] = [];
  if (v.registrationExpiry   && v.registrationExpiry   < today) overdue.push("Reg. Expired");
  if (v.federalInspectionDue && v.federalInspectionDue < today) overdue.push("Fed. Insp. Overdue");
  if (v.mmrDue               && v.mmrDue               < today) overdue.push("MMR Overdue");

  const warning: string[] = [];
  if (v.registrationExpiry   && v.registrationExpiry   >= today && v.registrationExpiry   <= soon) warning.push("Reg. Expiring");
  if (v.federalInspectionDue && v.federalInspectionDue >= today && v.federalInspectionDue <= soon) warning.push("Fed. Insp. Due Soon");
  if (v.mmrDue               && v.mmrDue               >= today && v.mmrDue               <= soon) warning.push("MMR Due Soon");

  return { overdue, warning };
}

// ── HTML generator ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateHTML(data: {
  printDate: string;
  today: string;
  soon: string;
  active: VehicleRow[];
  owned: VehicleRow[];
  rentals: VehicleRow[];
  inactive: VehicleRow[];
  allVehicles: VehicleRow[];
  driverMap: Map<number, string>;
  conditionsByVehicle: Map<number, ConditionRow[]>;
  openIssueCount: number;
  totalRepairCost: number;
  vehiclesWithConditions: (VehicleRow & { conditions: ConditionRow[] })[];
  issueVehicles: VehicleRow[];
}): string {
  const {
    printDate, today, soon,
    active, owned, rentals, inactive, allVehicles,
    driverMap, conditionsByVehicle,
    openIssueCount, totalRepairCost, vehiclesWithConditions, issueVehicles,
  } = data;

  const totalRepairStr = totalRepairCost > 0
    ? `$${totalRepairCost.toLocaleString()}` : "—";

  function severityBadge(s: string) {
    const cls: Record<string, string> = {
      critical: "sev-critical", high: "sev-high", medium: "sev-medium", low: "sev-low",
    };
    return `<span class="sev-badge ${cls[s] ?? "sev-low"}">${s.toUpperCase()}</span>`;
  }

  function vehicleRow(v: VehicleRow, idx: number, dimmed = false): string {
    const driver = driverMap.get(v.id);
    const { overdue, warning } = complianceStatus(v, today, soon);
    const conditions = conditionsByVehicle.get(v.id) ?? [];
    const condCost = conditions.reduce((s, c) => s + (c.repairEstimate ? Number(c.repairEstimate) : 0), 0);

    const statusCls = overdue.length > 0 ? "status-bad" : warning.length > 0 ? "status-warn" : "status-ok";
    const statusText = overdue.length > 0
      ? `✗ ${overdue.join(", ")}`
      : warning.length > 0
        ? `⚠ ${warning.join(", ")}`
        : "✓ Clear";

    const rowCls = idx % 2 === 0 ? "tr-even" : "tr-odd";
    const hasCritical = conditions.some((c) => c.severity === "critical");

    return `
      <tr class="${rowCls}${dimmed ? " dimmed" : ""}">
        <td class="td-unit">${v.unitNumber}</td>
        <td class="td-vehicle">${v.year} ${v.make} ${v.model}</td>
        <td><span class="own-badge ${v.ownership === "rental" ? "own-rental" : "own-owned"}">${v.ownership === "rental" ? "Rental" : "Owned"}</span></td>
        <td class="${driver ? "" : "td-muted"}">${driver ?? "Unassigned"}</td>
        <td>
          <div class="comp-stack">
            <div class="comp-line">
              <span class="comp-key">Reg.</span>
              <span class="comp-val ${dateClass(v.registrationExpiry, today, soon)}">${fmt(v.registrationExpiry)}</span>
            </div>
            <div class="comp-line">
              <span class="comp-key">Fed. Insp.</span>
              <span class="comp-val ${dateClass(v.federalInspectionDue, today, soon)}">${fmt(v.federalInspectionDue)}</span>
            </div>
            <div class="comp-line">
              <span class="comp-key">MMR</span>
              <span class="comp-val ${dateClass(v.mmrDue, today, soon)}">${fmt(v.mmrDue)}</span>
            </div>
          </div>
        </td>
        <td>
          ${conditions.length > 0
            ? `<div class="issues-cell ${hasCritical ? "issues-critical" : ""}">
                <span>${hasCritical ? "🔴" : "🟡"} ${conditions.length} issue${conditions.length !== 1 ? "s" : ""}</span>
                ${condCost > 0 ? `<span class="cost-tag">$${condCost.toLocaleString()}</span>` : ""}
               </div>`
            : ""}
        </td>
        <td><span class="${statusCls}">${statusText}</span></td>
      </tr>`;
  }

  function vehicleTable(rows: VehicleRow[], dimmed = false): string {
    return `
      <table>
        <thead>
          <tr class="thead-row">
            <th style="width:8%">Unit #</th>
            <th style="width:22%">Vehicle</th>
            <th style="width:8%">Type</th>
            <th style="width:18%">Driver</th>
            <th style="width:24%">Compliance Dates</th>
            <th style="width:10%">Issues</th>
            <th style="width:10%">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((v, i) => vehicleRow(v, i, dimmed)).join("")}
        </tbody>
      </table>`;
  }

  const alertBlock = issueVehicles.length > 0 ? `
    <div class="alert-card">
      <div class="alert-title">&#9888; ${issueVehicles.length} Vehicle${issueVehicles.length !== 1 ? "s" : ""} Require Compliance Attention</div>
      <div class="alert-body">${issueVehicles.map((v) => {
        const { overdue, warning } = complianceStatus(v, today, soon);
        return `<span class="alert-unit">${v.unitNumber}</span> ${[...overdue, ...warning].join(", ")}`;
      }).join("&ensp;&middot;&ensp;")}</div>
    </div>` : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  @page { size: 11in 8.5in; margin: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    background: #f1f5f9;
    color: #0f172a;
    font-size: 10px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    orphans: 1;
    widows: 1;
  }

  /* ── Main header ─────────────────────────────────────────────────── */
  .pg-header {
    background: #0a0f1e;
    color: white;
    padding: 10px 28px;
  }

  .pg-header-inner {
    display: table;
    width: 100%;
  }

  .pg-header-left  { display: table-cell; vertical-align: middle; }
  .pg-header-right { display: table-cell; vertical-align: middle; text-align: right; white-space: nowrap; }

  .eyebrow {
    font-size: 7.5px; font-weight: 700; letter-spacing: 2.5px;
    text-transform: uppercase; color: #6366f1; margin-bottom: 2px;
  }

  .report-title { font-size: 22px; font-weight: 900; color: white; line-height: 1; letter-spacing: -0.5px; }

  .report-date { font-size: 8.5px; color: rgba(255,255,255,0.32); margin-top: 2px; }

  .stat-box {
    display: inline-block;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 6px;
    padding: 5px 10px;
    text-align: center;
    min-width: 48px;
    margin-left: 3px;
    vertical-align: middle;
  }

  .stat-num   { display: block; font-size: 15px; font-weight: 800; color: white; line-height: 1; }
  .stat-label { display: block; font-size: 7px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: rgba(255,255,255,0.30); margin-top: 2px; }
  .stat-accent .stat-num { color: #f87171; }
  .stat-cost .stat-num   { font-size: 11px; color: #38bdf8; }

  /* ── Content wrapper ─────────────────────────────────────────────── */
  .content { padding: 10px 28px; }

  /* ── Alert ────────────────────────────────────────────────────────── */
  .alert-card {
    background: #fff1f2;
    border: 1px solid #fecdd3;
    border-left: 3px solid #dc2626;
    padding: 7px 12px;
    margin-bottom: 10px;
  }

  .alert-title { font-size: 8px; font-weight: 800; color: #b91c1c; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px; }
  .alert-body  { font-size: 9px; color: #7f1d1d; line-height: 1.7; }
  .alert-unit  { font-weight: 700; }

  /* ── Section header — sits directly above a <table> ─────────────── */
  .sec-head {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-bottom: none;
    padding: 5px 12px;
    margin-top: 8px;
    page-break-after: avoid;
    break-after: avoid;
  }
  .sec-head::after { content: ""; display: block; clear: both; }
  .sec-head-left  { float: left; vertical-align: middle; }
  .sec-head-right { float: right; vertical-align: middle; }

  .sec-title { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; }
  .sec-meta  { font-size: 9px; color: #94a3b8; }

  /* ── Tables ────────────────────────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; margin-bottom: 0; }

  thead th {
    background: #0f172a;
    color: rgba(255,255,255,0.55);
    font-size: 7px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.7px;
    padding: 5px 10px; text-align: left;
  }

  tbody tr:nth-child(odd)  td { background: white; }
  tbody tr:nth-child(even) td { background: #f8fafc; }

  td {
    padding: 5px 10px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 9.5px; color: #0f172a;
    vertical-align: middle;
  }

  tbody tr:last-child td { border-bottom: none; }

  .td-unit    { font-weight: 900; font-size: 11px; white-space: nowrap; }
  .td-vehicle { color: #334155; }
  .td-muted   { color: #94a3b8; font-style: italic; }

  /* Compliance stack */
  .comp-line { display: block; }
  .comp-key  { display: inline-block; font-size: 7px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.4px; width: 44px; padding-right: 4px; white-space: nowrap; vertical-align: middle; }
  .comp-val  { display: inline-block; vertical-align: middle; }

  .date-ok      { font-size: 9.5px; color: #0f172a; }
  .date-warn    { font-size: 9.5px; color: #d97706; font-weight: 700; }
  .date-bad     { font-size: 9.5px; color: #dc2626; font-weight: 800; }
  .date-missing { font-size: 9.5px; color: #cbd5e1; }

  .status-ok   { font-size: 8.5px; font-weight: 700; color: #16a34a; }
  .status-warn { font-size: 8.5px; font-weight: 700; color: #d97706; }
  .status-bad  { font-size: 8.5px; font-weight: 700; color: #dc2626; }

  .own-badge  { display: inline-block; font-size: 7px; font-weight: 700; padding: 1px 5px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.4px; }
  .own-owned  { background: #ede9fe; color: #6d28d9; }
  .own-rental { background: #e0f2fe; color: #0369a1; }

  .issues-cell { font-size: 9px; font-weight: 600; color: #d97706; }
  .issues-critical { color: #dc2626; }
  .cost-tag { font-size: 8px; font-weight: 600; color: #0284c7; display: block; }

  /* Severity badges */
  .sev-badge    { display: inline-block; font-size: 6.5px; font-weight: 800; padding: 2px 5px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.3px; vertical-align: middle; }
  .sev-critical { background: #dc2626; color: white; }
  .sev-high     { background: #d97706; color: white; }
  .sev-medium   { background: #eab308; color: #422006; }
  .sev-low      { background: #e2e8f0; color: #64748b; }

  /* Mechanical issues table cells */
  .mech-unit-td    { font-weight: 900; font-size: 11px; white-space: nowrap; vertical-align: top; }
  .mech-vehicle-td { color: #334155; white-space: nowrap; vertical-align: top; }
  .mech-issues-td  { vertical-align: top; }
  .mech-cost-td    { text-align: right; white-space: nowrap; font-weight: 700; color: #0284c7; vertical-align: top; font-size: 9px; }

  .mech-issue-line { margin-bottom: 3px; line-height: 1.5; }
  .mech-issue-line:last-child { margin-bottom: 0; }
  .mech-issue-note { font-size: 8.5px; color: #94a3b8; font-style: italic; display: block; margin-left: 2px; }

  /* ── Inactive section — forced page break ────────────────────────── */
  .inactive-section { page-break-before: always; break-before: page; }

  /* ── Inactive mini-header ─────────────────────────────────────────── */
  .inactive-pg-header {
    background: #0a0f1e;
    color: white;
    padding: 8px 28px;
  }
  .inactive-pg-header::after { content: ""; display: block; clear: both; }
  .inactive-pg-left  { float: left; }
  .inactive-pg-right { float: right; }

  .inactive-title { font-size: 18px; font-weight: 900; color: rgba(255,255,255,0.38); letter-spacing: -0.4px; line-height: 1; }

  .inactive-stat {
    display: inline-block;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    padding: 5px 14px; text-align: center;
    vertical-align: middle;
  }

  /* ── Legend bar ───────────────────────────────────────────────────── */
  .legend-bar {
    padding: 5px 28px 8px;
    border-top: 1px solid #e2e8f0;
    margin-top: 6px;
    font-size: 7.5px;
    color: #94a3b8;
  }
  .legend-bar::after { content: ""; display: block; clear: both; }
  .legend-right { float: right; font-size: 7.5px; color: #cbd5e1; font-weight: 500; }

  .legend-item { display: inline; font-size: 7.5px; color: #94a3b8; margin-right: 12px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; vertical-align: middle; margin-right: 3px; }
  .dot-red   { background: #dc2626; }
  .dot-amber { background: #d97706; }
  .dot-green { background: #16a34a; }

  .dimmed td { opacity: 0.55; }
</style>
</head>
<body>

  <!-- ══ ACTIVE FLEET PAGE ══════════════════════════════════════════ -->
  <div class="pg-header">
    <div class="pg-header-inner">
      <div class="pg-header-left">
        <div class="eyebrow">742 Logistics &middot; Fleet Status Report</div>
        <div class="report-title">Fleet Status</div>
        <div class="report-date">Generated ${printDate}</div>
      </div>
      <div class="pg-header-right">
        <div class="stat-box"><span class="stat-num">${active.length}</span><span class="stat-label">Active</span></div>
        <div class="stat-box"><span class="stat-num">${owned.length}</span><span class="stat-label">Owned</span></div>
        <div class="stat-box"><span class="stat-num">${rentals.length}</span><span class="stat-label">Rentals</span></div>
        <div class="stat-box"><span class="stat-num">${allVehicles.length}</span><span class="stat-label">Total Fleet</span></div>
        <div class="stat-box ${openIssueCount > 0 ? "stat-accent" : ""}"><span class="stat-num">${openIssueCount}</span><span class="stat-label">Open Issues</span></div>
        <div class="stat-box ${totalRepairCost > 0 ? "stat-cost" : ""}"><span class="stat-num">${totalRepairStr}</span><span class="stat-label">Est. Repairs</span></div>
      </div>
    </div>
  </div>

  <div class="content">
    ${alertBlock}

    ${vehiclesWithConditions.length > 0 ? `
    <div class="sec-head">
      <span class="sec-head-left sec-title">Open Mechanical Issues</span>
      <span class="sec-head-right sec-meta">${openIssueCount} open &middot; ${totalRepairStr} est. repairs</span>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:9%">Unit #</th>
          <th style="width:20%">Vehicle</th>
          <th style="width:55%">Issues</th>
          <th style="width:16%">Est. Cost</th>
        </tr>
      </thead>
      <tbody>
        ${vehiclesWithConditions.map((v) => {
          const total = v.conditions.reduce((s, c) => s + (c.repairEstimate ? Number(c.repairEstimate) : 0), 0);
          return `
          <tr>
            <td class="mech-unit-td">${v.unitNumber}</td>
            <td class="mech-vehicle-td">${v.year} ${v.make} ${v.model}</td>
            <td class="mech-issues-td">${v.conditions.map((c) => `
              <div class="mech-issue-line">
                ${severityBadge(c.severity)}
                <span> ${c.description}</span>
                ${c.note ? `<span class="mech-issue-note">${c.note}</span>` : ""}
              </div>`).join("")}
            </td>
            <td class="mech-cost-td">${total > 0 ? `~$${total.toLocaleString()}` : "&mdash;"}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>` : ""}

    ${owned.length > 0 ? `
    <div class="sec-head" style="margin-top:8px">
      <span class="sec-head-left sec-title">Owned Vehicles</span>
      <span class="sec-head-right sec-meta">${owned.length} vehicle${owned.length !== 1 ? "s" : ""}</span>
    </div>
    ${vehicleTable(owned)}` : ""}

    ${rentals.length > 0 ? `
    <div class="sec-head" style="margin-top:8px">
      <span class="sec-head-left sec-title">Rental Vehicles</span>
      <span class="sec-head-right sec-meta">${rentals.length} vehicle${rentals.length !== 1 ? "s" : ""}</span>
    </div>
    ${vehicleTable(rentals)}` : ""}
  </div>

  ${inactive.length > 0 ? `
  <div class="inactive-section">
    <div class="inactive-pg-header">
      <div class="inactive-pg-left">
        <div class="eyebrow">742 Logistics &middot; Fleet Status Report</div>
        <div class="inactive-title">Inactive Fleet</div>
        <div class="report-date">Generated ${printDate}</div>
      </div>
      <div class="inactive-pg-right">
        <div class="inactive-stat">
          <span class="stat-num">${inactive.length}</span>
          <span class="stat-label">Inactive</span>
        </div>
      </div>
    </div>
    <div class="content">
      <div class="sec-head" style="margin-top:0">
        <span class="sec-head-left sec-title">Inactive Fleet</span>
        <span class="sec-head-right sec-meta">${inactive.length} vehicle${inactive.length !== 1 ? "s" : ""}</span>
      </div>
      ${vehicleTable(inactive, true)}
    </div>
    <div class="legend-bar">
      <span class="legend-item"><span class="dot dot-red"></span>Overdue / Expired</span>
      <span class="legend-item"><span class="dot dot-amber"></span>Due within 30 days</span>
      <span class="legend-item"><span class="dot dot-green"></span>In good standing</span>
      <span class="legend-right">742 Logistics &middot; Fleet Status &middot; ${printDate}</span>
    </div>
  </div>` : ""}

</body>
</html>`;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET() {
  const today     = new Date().toISOString().slice(0, 10);
  const printDate = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const soonDate = new Date(today);
  soonDate.setDate(soonDate.getDate() + 30);
  const soon = soonDate.toISOString().slice(0, 10);

  const [allVehicles, allDrivers, allConditions] = await Promise.all([
    db.select().from(vehicles).orderBy(vehicles.unitNumber),
    db.select({ id: drivers.id, name: drivers.name, assignedVehicleId: drivers.assignedVehicleId })
      .from(drivers),
    db.select().from(vehicleConditions)
      .where(eq(vehicleConditions.status, "open"))
      .orderBy(vehicleConditions.vehicleId, vehicleConditions.severity),
  ]);

  const driverMap = new Map<number, string>(
    allDrivers.filter((d) => d.assignedVehicleId).map((d) => [d.assignedVehicleId!, d.name])
  );

  // Group conditions by vehicleId
  const conditionsByVehicle = new Map<number, ConditionRow[]>();
  for (const c of allConditions) {
    const list = conditionsByVehicle.get(c.vehicleId) ?? [];
    list.push(c as ConditionRow);
    conditionsByVehicle.set(c.vehicleId, list);
  }

  const active   = allVehicles.filter((v) => v.active) as VehicleRow[];
  const inactive = allVehicles.filter((v) => !v.active) as VehicleRow[];
  const owned    = active.filter((v) => v.ownership !== "rental");
  const rentals  = active.filter((v) => v.ownership === "rental");

  const openIssueCount  = allConditions.length;
  const totalRepairCost = allConditions.reduce(
    (sum, c) => sum + (c.repairEstimate ? Number(c.repairEstimate) : 0), 0
  );

  const vehiclesWithConditions = active
    .filter((v) => (conditionsByVehicle.get(v.id)?.length ?? 0) > 0)
    .map((v) => ({ ...v, conditions: conditionsByVehicle.get(v.id)! }));

  const issueVehicles = (allVehicles as VehicleRow[]).filter((v) => {
    const { overdue, warning } = complianceStatus(v, today, soon);
    return overdue.length > 0 || warning.length > 0;
  });

  const html = generateHTML({
    printDate, today, soon,
    active, owned, rentals, inactive,
    allVehicles: allVehicles as VehicleRow[],
    driverMap, conditionsByVehicle,
    openIssueCount, totalRepairCost,
    vehiclesWithConditions,
    issueVehicles,
  });

  const browser = await getBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 850, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });

    const pdfBuffer = await page.pdf({
      format: "Letter",
      landscape: true,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="fleet-status-${today}.pdf"`,
        "X-Debug-Version":     "v7",
      },
    });
  } finally {
    await browser.close();
  }
}
