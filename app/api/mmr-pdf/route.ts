import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { db } from "@/lib/db";
import { vehicles, locations, vehicleMaintenanceRecords, organizations } from "@/lib/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { recordMmrGeneration } from "@/lib/actions/mmr";

export const dynamic = "force-dynamic";

const CHROMIUM_PACK =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

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

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function todayMDY(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function generateVehiclePage(p: {
  unit: string; station: string; mileage: string; companyName: string;
  monthLabel: string; dateCompleted: string; hasRows: boolean; tableRows: string;
}): string {
  const topYes = p.hasRows ? "&#10003;" : "";
  const topNo  = p.hasRows ? "" : "&#10003;";
  const botNo  = p.hasRows ? "" : "&#10003;";
  return `
<div style="page-break-after:always;font-family:Arial,Helvetica,sans-serif;font-size:10pt;padding:0.55in 0.6in 0.4in 0.6in;color:#000;box-sizing:border-box;width:8.5in;min-height:11in;">
  <div style="border:2px solid #000;text-align:center;padding:6px 12px;margin-bottom:6px;">
    <span style="font-size:15pt;font-weight:bold;">U.S. Monthly Maintenance Record, MGBA-355</span>
  </div>
  <div style="text-align:right;font-size:9pt;margin-bottom:6px;">14 May 2025</div>
  <div style="font-size:8.5pt;line-height:1.4;margin-bottom:10px;">To comply with U.S. Federal Regulations, this form must be completed, signed, and submitted to FedEx by the 20th of the month following the month for which repairs, or maintenance were performed on any service provider-owned or -leased equipment. Submit one record for each piece of equipment, even if not regularly providing services.</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;margin-bottom:6px;">
    <div><div style="font-size:8.5pt;font-weight:bold;margin-bottom:1px;">Maintenance Record for the Month and Year of:</div><div style="border:1px solid #000;padding:2px 5px;font-size:9.5pt;min-height:18px;">${p.monthLabel}</div></div>
    <div><div style="font-size:8.5pt;font-weight:bold;margin-bottom:1px;">Domicile Station/Hub:</div><div style="border:1px solid #000;padding:2px 5px;font-size:9.5pt;min-height:18px;">${p.station}</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;margin-bottom:6px;">
    <div><div style="font-size:8.5pt;font-weight:bold;margin-bottom:1px;">Service Provider Company Name:</div><div style="border:1px solid #000;padding:2px 5px;font-size:9.5pt;min-height:18px;">${p.companyName}</div></div>
    <div><div style="font-size:8.5pt;font-weight:bold;margin-bottom:1px;">Current Mileage* (Odometer Reading)</div><div style="border:1px solid #000;padding:2px 5px;font-size:9.5pt;min-height:18px;">${p.mileage}</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;margin-bottom:8px;">
    <div><div style="font-size:8.5pt;font-weight:bold;margin-bottom:1px;">Vehicle Unit #:</div><div style="border:1px solid #000;padding:2px 5px;font-size:9.5pt;min-height:18px;">${p.unit}</div></div>
    <div style="font-size:7.5pt;line-height:1.3;padding-top:14px;">*If reading has decreased due to odometer repair/replacement, proof should also be provided. If unit is undergoing repair and unavailable, &ldquo;N/A&rdquo; may be utilized for current mileage.</div>
  </div>
  <div style="display:flex;align-items:flex-start;margin-bottom:5px;font-size:9pt;">
    <div style="flex:1;padding-top:1px;line-height:1.3;">Were any repairs, or preventative maintenance performed on this unit?</div>
    <div style="display:flex;align-items:center;gap:6px;white-space:nowrap;padding-left:12px;">
      <span style="display:inline-block;width:11px;height:11px;border:1px solid #000;text-align:center;line-height:11px;font-size:9pt;font-weight:bold;">${topYes}</span><span>Yes</span>
      <span style="display:inline-block;width:11px;height:11px;border:1px solid #000;text-align:center;line-height:11px;font-size:9pt;font-weight:bold;">${topNo}</span><span>No</span>
    </div>
  </div>
  <div style="display:flex;align-items:flex-start;margin-bottom:10px;font-size:9pt;">
    <div style="flex:1;padding-top:1px;line-height:1.3;">If &ldquo;no&rdquo; maintenance was performed, was the unit out of service and unable to provide service (i.e., awaiting repair, on litigation hold, etc.)?</div>
    <div style="display:flex;align-items:center;gap:6px;white-space:nowrap;padding-left:12px;">
      <span style="display:inline-block;width:11px;height:11px;border:1px solid #000;text-align:center;line-height:11px;font-size:9pt;font-weight:bold;"></span><span>Yes</span>
      <span style="display:inline-block;width:11px;height:11px;border:1px solid #000;text-align:center;line-height:11px;font-size:9pt;font-weight:bold;">${botNo}</span><span>No</span>
    </div>
  </div>
  <div style="margin:7px 0;">
    <p style="font-size:8.5pt;line-height:1.4;margin-bottom:4px;">All repairs/replacements, or maintenance performed in conformance with a vehicle&#8217;s Maintenance Interval Form or any other major vehicle system must be reported on an MMR with detailed notations or attached receipts.</p>
    <p style="font-size:8.5pt;line-height:1.4;margin-bottom:4px;">All notations must provide enough detail for a DOT official to determine what component(s), location(s), and type of work was performed (e.g., replace, repair, adjust, etc.).</p>
    <p style="font-size:8.5pt;line-height:1.4;margin-bottom:4px;">Annual Federal/State and Pre/Post trip inspections must not be reported on the MMR, however repairs and maintenance of components that resulted from these inspections must be reported on an MMR.</p>
    <p style="font-size:8.5pt;line-height:1.4;margin-bottom:4px;">General maintenance (e.g., oil/filter changes, lubrication, adjustments) should be reported with adequate detail to clearly convey what components were repaired or maintained. Abbreviations such as &#8220;LOF&#8221; or &#8220;PM&#8221; cannot be used, as these do not provide adequate details.</p>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
    <thead><tr>
      <th style="border:1.5px solid #000;padding:3px 6px;font-size:9pt;font-weight:bold;text-align:left;width:140px;">Date of Maintenance</th>
      <th style="border:1.5px solid #000;padding:3px 6px;font-size:9pt;font-weight:bold;text-align:left;">Specific Description of Maintenance Performed</th>
    </tr></thead>
    <tbody>${p.tableRows}</tbody>
  </table>
  <div style="display:flex;gap:6px;margin-bottom:10px;">
    <div style="width:12px;height:12px;min-width:12px;border:1px solid #000;text-align:center;line-height:12px;font-size:9pt;font-weight:bold;margin-top:1px;">&#9632;</div>
    <div style="font-size:8.5pt;line-height:1.4;">By checking this box, I declare that this record is true and correct. Unless otherwise clearly indicated as &#8220;out of service&#8221; on this record, I confirm that the equipment on this record is in compliance with the Federal Motor Carrier Safety Regulations 49 C.F.R. 396.3(a)(1) and 396.7 (a) and is in safe operating condition and meets all federal, state and local motor vehicle laws. Furthermore, I confirm that preventative maintenance is consistent with the interval schedule per 396.3(b)(2).</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr auto;gap:20px;margin-bottom:10px;align-items:end;">
    <div>
      <div style="font-size:9pt;font-weight:bold;margin-bottom:2px;">Signature of Authorized Officer or Business Contact:</div>
      <div style="border:1px solid #000;height:40px;display:flex;align-items:center;padding:0 8px;overflow:hidden;">
        <span style="font-family:'Brush Script MT','Segoe Script',cursive;font-size:26pt;line-height:1;">Blake Nardoni</span>
      </div>
    </div>
    <div style="min-width:200px;">
      <div style="font-size:9pt;font-weight:bold;margin-bottom:2px;">Date Completed:</div>
      <div style="border:1px solid #000;height:40px;display:flex;align-items:center;justify-content:center;padding:0 8px;">
        <span style="font-size:18pt;font-weight:bold;">${p.dateCompleted}</span>
      </div>
    </div>
  </div>
  <div style="font-style:italic;font-size:7.5pt;line-height:1.4;border-top:1px solid #000;padding-top:5px;margin-bottom:4px;">* The Monthly Maintenance Record (MMR) is FedEx&#8217;s systematic method of obtaining vehicle maintenance records for service provider-owned vehicles in compliance with the Federal Motor Carrier Safety Regulations which require motor carriers to have a systematic method of causing vehicles operating under their motor carrier operating authority to be repaired and maintained. Therefore, if FedEx does not receive records for a vehicle by the 20th of the month following the month in which maintenance or repairs, were performed, packages will not be made available to this vehicle.</div>
  <div style="display:flex;justify-content:space-between;font-size:8pt;">
    <span>This form for service providers is accessed through mybizaccount.fedex.com</span>
    <span>Page 1 of 1</span>
  </div>
</div>`;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { vehicleIds: number[]; monthYear: string };
  const { vehicleIds, monthYear } = body;

  if (!Array.isArray(vehicleIds) || !vehicleIds.length) {
    return NextResponse.json({ error: "vehicleIds must be a non-empty array of positive integers" }, { status: 400 });
  }

  if (vehicleIds.some((id) => typeof id !== "number" || !Number.isInteger(id) || id <= 0)) {
    return NextResponse.json({ error: "vehicleIds must be a non-empty array of positive integers" }, { status: 400 });
  }

  if (!monthYear) {
    return NextResponse.json({ error: "Missing monthYear" }, { status: 400 });
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(monthYear);
  if (!monthMatch) {
    return NextResponse.json({ error: "Invalid monthYear; expected YYYY-MM" }, { status: 400 });
  }

  const year = parseInt(monthMatch[1], 10);
  const monthNum = parseInt(monthMatch[2], 10);

  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const requestedDate = new Date(year, monthNum - 1, 1);
  if (requestedDate > cutoff) {
    return NextResponse.json({ error: "Cannot generate for current or future months" }, { status: 400 });
  }

  const firstDay = `${monthYear}-01`;
  const lastDay = new Date(year, monthNum, 0).toISOString().slice(0, 10);
  const orgId = session.organizationId;

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const companyName = org?.name ?? "MyGroundOps";

  const vehicleRows = await db
    .select({ id: vehicles.id, unitNumber: vehicles.unitNumber, mileage: vehicles.mileage, stationCode: locations.terminalId })
    .from(vehicles)
    .leftJoin(locations, eq(vehicles.locationId, locations.id))
    .where(and(eq(vehicles.organizationId, orgId), eq(vehicles.active, true)));

  const vehicleMap = new Map(vehicleRows.map((v) => [v.id, v]));

  const maintRows = await db
    .select({ vehicleId: vehicleMaintenanceRecords.vehicleId, serviceDate: vehicleMaintenanceRecords.serviceDate, description: vehicleMaintenanceRecords.description })
    .from(vehicleMaintenanceRecords)
    .where(and(eq(vehicleMaintenanceRecords.organizationId, orgId), gte(vehicleMaintenanceRecords.serviceDate, firstDay), lte(vehicleMaintenanceRecords.serviceDate, lastDay)))
    .orderBy(vehicleMaintenanceRecords.serviceDate);

  const maintByVehicle = new Map<number, { serviceDate: string; description: string }[]>();
  for (const r of maintRows) {
    if (r.vehicleId === null) continue;
    const list = maintByVehicle.get(r.vehicleId) ?? [];
    list.push({ serviceDate: r.serviceDate, description: r.description });
    maintByVehicle.set(r.vehicleId, list);
  }

  const monthLabel = `${MONTH_NAMES[monthNum - 1]} of ${year}`;
  const dateCompleted = todayMDY();
  const pages: string[] = [];
  const generationEntries: { vehicleId: number; monthYear: string; mileageSnapshot: string; maintenanceRowCount: number }[] = [];

  const sortedVehicleIds = [...vehicleIds].sort((a, b) => {
    const ua = vehicleMap.get(a)?.unitNumber ?? "";
    const ub = vehicleMap.get(b)?.unitNumber ?? "";
    return ua.localeCompare(ub, undefined, { numeric: true, sensitivity: "base" });
  });

  for (const vehicleId of sortedVehicleIds) {
    const v = vehicleMap.get(vehicleId);
    if (!v) continue;
    const rows = maintByVehicle.get(vehicleId) ?? [];
    const dataRows = rows.map((r) => {
      const d = new Date(r.serviceDate + "T00:00:00");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `<tr><td style="border:1px solid #000;padding:3px 6px;font-size:9pt;height:18px;">${mm}/${dd}/${d.getFullYear()}</td><td style="border:1px solid #000;padding:3px 6px;font-size:9pt;height:18px;">${escHtml(r.description)}</td></tr>`;
    });
    const padCount = Math.max(0, 5 - dataRows.length);
    const padRows = Array(padCount).fill(`<tr><td style="border:1px solid #000;padding:3px 6px;font-size:9pt;height:18px;">&nbsp;</td><td style="border:1px solid #000;padding:3px 6px;font-size:9pt;height:18px;">&nbsp;</td></tr>`);
    const mileageStr = v.mileage ? v.mileage.toLocaleString("en-US") : "N/A";
    pages.push(generateVehiclePage({ unit: v.unitNumber, station: v.stationCode ?? "", mileage: mileageStr, companyName, monthLabel, dateCompleted, hasRows: rows.length > 0, tableRows: [...dataRows, ...padRows].join("") }));
    generationEntries.push({ vehicleId, monthYear, mileageSnapshot: mileageStr, maintenanceRowCount: rows.length });
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0;padding:0;}@page{size:letter;margin:0;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}</style></head><body>${pages.join("")}</body></html>`;

  const browser = await getBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({ format: "Letter", landscape: false, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    await recordMmrGeneration(generationEntries).catch(console.error);
    const isSingle = vehicleIds.length === 1;
    const unitLabel = isSingle ? (vehicleMap.get(vehicleIds[0])?.unitNumber ?? "vehicle") : "All";
    const filename = isSingle ? `MMR_${unitLabel}_${monthYear}.pdf` : `MMR_${monthYear}_All.pdf`;
    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
    });
  } finally {
    await browser.close();
  }
}
