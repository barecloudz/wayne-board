import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getPayrollWeek } from "@/lib/actions/attendance";
import { getDswDataForRange } from "@/lib/actions/dsw-data";
import { getSetting } from "@/lib/actions/settings";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import type { AttendanceStatus, PayrollDriverRow, PayrollWeekData } from "@/lib/actions/attendance";
import type { DswDayRow } from "@/lib/actions/dsw-data";

const CHROMIUM_PACK = "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

export const dynamic = "force-dynamic";

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

function getPayWeekBounds(offsetWeeks: number, payWeekStart: number) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const payWeekEnd = (payWeekStart + 6) % 7;
  const daysToEnd = ((dayOfWeek - payWeekEnd + 7) % 7) || 7;
  const lastEndDay = new Date(today);
  lastEndDay.setDate(today.getDate() - daysToEnd - offsetWeeks * 7);
  const weekEnd = lastEndDay.toISOString().slice(0, 10);
  const weekStartDate = new Date(lastEndDay);
  weekStartDate.setDate(lastEndDay.getDate() - 6);
  const weekStart = weekStartDate.toISOString().slice(0, 10);
  return { weekStart, weekEnd };
}

function getWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  const start = new Date(weekStart + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const DAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function matchDswName(driverName: string, dswNameRaw: string): boolean {
  const dswParts = dswNameRaw.toUpperCase().replace(",", " ").split(/\s+/).filter(Boolean);
  const driverParts = driverName.toUpperCase().split(/\s+/).filter(Boolean);
  let matches = 0;
  for (const p of driverParts) {
    if (dswParts.some(d => d === p)) matches++;
  }
  return matches >= 2;
}

function computeRowTotals(attendance: Record<string, AttendanceStatus>) {
  let workDays = 0;
  let traineeDays = 0;
  for (const status of Object.values(attendance)) {
    if (status === "work") workDays += 1;
    else if (status === "half_day") workDays += 0.5;
    else if (status === "trainee") traineeDays += 1;
  }
  return { workDays, traineeDays };
}

function statusCell(status: AttendanceStatus | undefined): string {
  if (!status || status === "day_off") return '<span class="day-dash">&mdash;</span>';
  if (status === "work")     return '<span class="dot-work">&#11044;</span>';
  if (status === "half_day") return '<span class="half-day">&frac12;</span>';
  if (status === "cut")      return '<span class="badge badge-cut">Cut</span>';
  if (status === "call_out") return '<span class="badge badge-out">Out</span>';
  if (status === "holiday")  return '<span class="badge badge-hol">Hol</span>';
  if (status === "trainee")  return '<span class="badge badge-t">T</span>';
  return '<span class="day-dash">&mdash;</span>';
}

function dayCellBg(status: AttendanceStatus | undefined): string {
  if (status === "call_out") return " bg-out";
  if (status === "half_day") return " bg-half";
  if (status === "cut")      return " bg-cut";
  if (status === "holiday")  return " bg-hol";
  if (status === "trainee")  return " bg-t";
  return "";
}

function buildDriverRows(
  drivers: PayrollDriverRow[],
  weekDates: string[],
  dswByDriverDate: Map<string, Map<string, DswDayRow>>,
  deductionAmount: number,
  dimmed = false,
): string {
  return drivers.map(driver => {
    const { workDays, traineeDays } = computeRowTotals(driver.attendance);
    const driverDsw = dswByDriverDate.get(driver.driverId);
    const hasDsw = driverDsw && driverDsw.size > 0;
    const showDeduction = driver.isTerminated && driver.terminationType === "notice";

    const notesText = weekDates
      .map(date => {
        const note = driver.notes[date];
        if (!note) return null;
        const d = new Date(date + "T00:00:00");
        const status = driver.attendance[date];
        return `${DAY_ABBREVS[d.getDay()]}: ${note}${status === "half_day" ? " (\u00bd)" : ""}`;
      })
      .filter(Boolean)
      .join("; ");

    const dimClass = dimmed ? " dimmed" : "";

    let rows = `
      <tr class="driver-row${dimClass}">
        <td class="td-name">
          ${driver.name}
          ${showDeduction ? `<div class="deduction">&minus;$${deductionAmount} &middot; No Notice</div>` : ""}
          ${driver.terminationNote ? `<div class="term-note">${driver.terminationNote}</div>` : ""}
        </td>
        ${weekDates.map(date => {
          const status = driver.attendance[date];
          return `<td class="td-day${dayCellBg(status)}">${statusCell(status)}</td>`;
        }).join("")}
        <td class="td-total">${workDays % 1 === 0 ? workDays : workDays.toFixed(1)}</td>
        <td class="td-total">${traineeDays > 0 ? `<span class="trainee-total">${traineeDays}</span>` : "&mdash;"}</td>
        <td class="td-notes">${notesText}</td>
      </tr>`;

    if (hasDsw) {
      rows += `
      <tr class="dsw-row${dimClass}">
        <td class="td-dsw-label">ILS%</td>
        ${weekDates.map(date => {
          const dsw = driverDsw.get(date);
          if (!dsw || dsw.ilsPct == null) return `<td class="td-day"><span class="dsw-dash">&mdash;</span></td>`;
          const cls = dsw.ilsPct >= 100 ? "dsw-green" : dsw.ilsPct >= 99 ? "dsw-amber" : "dsw-red";
          const breakdown = (dsw.codeBreakdown ?? {}) as Record<string, number>;
          const code27 = breakdown["27"] ?? 0;
          const otherIls = (["2","3","12"] as const).reduce((s, k) => s + (breakdown[k] ?? 0), 0);
          const impactParts: string[] = [];
          if (code27 > 0) impactParts.push(`<span class="dsw-code27">${code27}&times;27</span>`);
          if (otherIls > 0) impactParts.push(`<span class="dsw-impact">${otherIls}pkg</span>`);
          return `<td class="td-day${dsw.ilsPct >= 100 ? " bg-green-cell" : ""}"><div class="dsw-cell"><span class="${cls}">${dsw.ilsPct}%</span>${impactParts.join("")}</div></td>`;
        }).join("")}
        <td class="td-total">${(() => {
          const vals = weekDates.map(d => driverDsw.get(d)?.ilsPct).filter((v): v is number => v != null);
          if (!vals.length) return "&mdash;";
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          const cls = avg >= 100 ? "dsw-green" : avg >= 99 ? "dsw-amber" : "dsw-red";
          return `<span class="${cls}">${avg.toFixed(1)}%</span>`;
        })()}</td>
        <td></td><td></td>
      </tr>`;
    }

    return rows;
  }).join("");
}

function generateHTML(data: {
  weekData: PayrollWeekData;
  weekDates: string[];
  weekLabel: string;
  dswByDriverDate: Map<string, Map<string, DswDayRow>>;
  printDate: string;
  activeDrivers: PayrollDriverRow[];
  terminatedDrivers: PayrollDriverRow[];
}): string {
  const { weekData, weekDates, weekLabel, dswByDriverDate, printDate, activeDrivers, terminatedDrivers } = data;
  const colSpan = weekDates.length + 4;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: 11in 8.5in; margin: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    background: #f1f5f9; color: #0f172a; font-size: 10px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .pg-header { background: #0a0f1e; color: white; padding: 10px 28px; display: table; width: 100%; }
  .pg-header-left  { display: table-cell; vertical-align: middle; }
  .pg-header-right { display: table-cell; vertical-align: middle; text-align: right; white-space: nowrap; }
  .eyebrow      { font-size: 7.5px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: #6366f1; margin-bottom: 2px; }
  .report-title { font-size: 22px; font-weight: 900; color: white; line-height: 1; letter-spacing: -0.5px; }
  .report-sub   { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.45); margin-top: 3px; }
  .report-date  { font-size: 8.5px; color: rgba(255,255,255,0.32); margin-top: 2px; }
  .stat-box { display: inline-block; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.10); border-radius: 6px; padding: 5px 10px; text-align: center; min-width: 48px; margin-left: 3px; vertical-align: middle; }
  .stat-num   { display: block; font-size: 15px; font-weight: 800; color: white; line-height: 1; }
  .stat-label { display: block; font-size: 7px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: rgba(255,255,255,0.30); margin-top: 2px; }
  .content { padding: 12px 28px; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; }
  thead th { background: #0f172a; color: rgba(255,255,255,0.55); font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; padding: 6px 8px; text-align: center; }
  thead th.th-name  { text-align: left; padding-left: 12px; min-width: 160px; }
  thead th.th-notes { text-align: left; min-width: 120px; }
  td { padding: 5px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; font-size: 9.5px; }
  .driver-row td { background: white; }
  .dsw-row td    { background: #f0f4f8; }
  .td-name     { padding-left: 12px; font-weight: 600; font-size: 10px; color: #0f172a; vertical-align: top; padding-top: 7px; }
  .td-day      { text-align: center; min-width: 52px; }
  .td-total    { text-align: center; font-weight: 800; font-size: 11px; color: #0f172a; min-width: 40px; }
  .td-notes    { font-size: 8.5px; color: #64748b; padding-right: 12px; }
  .td-dsw-label { padding-left: 20px; font-size: 7px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
  .deduction { font-size: 8px; font-weight: 700; color: #dc2626; margin-top: 1px; }
  .term-note { font-size: 8px; color: #94a3b8; font-style: italic; margin-top: 1px; }
  .day-dash  { color: #e2e8f0; font-size: 10px; }
  .dot-work  { color: #34d399; font-size: 8px; }
  .half-day  { font-size: 11px; font-weight: 900; color: #f59e0b; }
  .badge     { display: inline-block; font-size: 7px; font-weight: 800; padding: 1px 4px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.3px; }
  .badge-cut { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
  .badge-out { background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; }
  .badge-hol { background: #f5f3ff; color: #7c3aed; border: 1px solid #ddd6fe; }
  .badge-t   { background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; }
  .bg-out  { background: #fff5f5 !important; }
  .bg-half { background: #fffbeb !important; }
  .bg-cut  { background: #f8fafc !important; }
  .bg-hol  { background: #faf5ff !important; }
  .bg-t    { background: #eff6ff !important; }
  .trainee-total { color: #3b82f6; font-weight: 800; }
  .dsw-cell   { display: flex; flex-direction: column; align-items: center; gap: 1px; }
  .dsw-green  { font-size: 8.5px; font-weight: 800; color: #16a34a; }
  .dsw-amber  { font-size: 8.5px; font-weight: 800; color: #d97706; }
  .dsw-red    { font-size: 8.5px; font-weight: 800; color: #dc2626; }
  .dsw-impact  { font-size: 7px; font-weight: 700; color: #dc2626; }
  .dsw-code27  { font-size: 7.5px; font-weight: 800; color: #dc2626; letter-spacing: -0.2px; }
  .bg-green-cell { background: #f0fdf4 !important; }
  .dsw-dash   { color: #e2e8f0; }
  .section-sep td { padding: 5px 12px; background: #f8fafc; border-top: 2px solid #e2e8f0; }
  .section-label { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; }
  .dimmed td { opacity: 0.55; }
  .legend-bar { padding: 6px 28px; border-top: 1px solid #e2e8f0; margin-top: 6px; font-size: 7.5px; color: #94a3b8; display: table; width: 100%; }
  .legend-left  { display: table-cell; }
  .legend-right { display: table-cell; text-align: right; color: #cbd5e1; }
  .legend-item  { margin-right: 12px; }
</style>
</head>
<body>

<div class="pg-header">
  <div class="pg-header-left">
    <div class="eyebrow">MyGroundOps &middot; Payroll Report</div>
    <div class="report-title">Payroll</div>
    <div class="report-sub">${weekLabel}</div>
    <div class="report-date">Generated ${printDate}</div>
  </div>
  <div class="pg-header-right">
    <div class="stat-box"><span class="stat-num">${activeDrivers.length}</span><span class="stat-label">Active</span></div>
    ${terminatedDrivers.length > 0 ? `<div class="stat-box"><span class="stat-num">${terminatedDrivers.length}</span><span class="stat-label">Terminated</span></div>` : ""}
  </div>
</div>

<div class="content">
  <table>
    <thead>
      <tr>
        <th class="th-name">Driver</th>
        ${weekDates.map(date => {
          const d = new Date(date + "T00:00:00");
          return `<th>${DAY_ABBREVS[d.getDay()]}<br><span style="font-weight:400;opacity:0.55">${formatShortDate(date)}</span></th>`;
        }).join("")}
        <th>Days</th>
        <th>T</th>
        <th class="th-notes">Notes</th>
      </tr>
    </thead>
    <tbody>
      ${buildDriverRows(activeDrivers, weekDates, dswByDriverDate, weekData.deductionAmount)}
      ${terminatedDrivers.length > 0 ? `
        <tr class="section-sep"><td colspan="${colSpan}"><span class="section-label">Terminated</span></td></tr>
        ${buildDriverRows(terminatedDrivers, weekDates, dswByDriverDate, weekData.deductionAmount, true)}
      ` : ""}
    </tbody>
  </table>
</div>

<div class="legend-bar">
  <div class="legend-left">
    <span class="legend-item"><span style="color:#34d399">&#11044;</span> Work</span>
    <span class="legend-item"><span style="color:#f59e0b;font-weight:900">&frac12;</span> Half Day</span>
    <span class="legend-item"><span style="background:#f1f5f9;color:#64748b;padding:0 3px;border:1px solid #e2e8f0">CUT</span> Cut</span>
    <span class="legend-item"><span style="background:#fef2f2;color:#ef4444;padding:0 3px;border:1px solid #fecaca">OUT</span> Called Out</span>
    <span class="legend-item"><span style="background:#eff6ff;color:#3b82f6;padding:0 3px;border:1px solid #bfdbfe">T</span> Trainee</span>
    <span class="legend-item"><span style="background:#f5f3ff;color:#7c3aed;padding:0 3px;border:1px solid #ddd6fe">HOL</span> Holiday</span>
  </div>
  <div class="legend-right">MyGroundOps &middot; Payroll &middot; ${weekLabel} &middot; ${printDate}</div>
</div>

</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const payWeekStartStr = await getSetting("pay_week_start", "6");
  const payWeekStart = parseInt(payWeekStartStr, 10);
  const { weekStart, weekEnd } = getPayWeekBounds(offset, payWeekStart);

  const printDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const weekLabel = `${formatShortDate(weekStart)} \u2013 ${formatShortDate(weekEnd)}`;
  const weekDates = getWeekDates(weekStart);

  const [weekData, dswRows] = await Promise.all([
    getPayrollWeek(weekStart, weekEnd),
    getDswDataForRange(weekStart, weekEnd),
  ]);

  const dswByDriverDate = new Map<string, Map<string, DswDayRow>>();
  for (const driver of weekData.drivers) {
    const driverDsw = new Map<string, DswDayRow>();
    for (const row of dswRows) {
      if (matchDswName(driver.name, row.driverNameRaw)) {
        driverDsw.set(row.date, row);
      }
    }
    if (driverDsw.size > 0) dswByDriverDate.set(driver.driverId, driverDsw);
  }

  const activeDrivers     = weekData.drivers.filter(d => !d.isTerminated);
  const terminatedDrivers = weekData.drivers.filter(d => d.isTerminated);

  const html = generateHTML({ weekData, weekDates, weekLabel, dswByDriverDate, printDate, activeDrivers, terminatedDrivers });

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
        "Content-Disposition": `attachment; filename="payroll-${weekStart}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
