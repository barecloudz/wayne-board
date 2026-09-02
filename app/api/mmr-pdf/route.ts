import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { getMmrRows, getMileage, UNIT_CONFIGS } from "@/lib/mmr-data";
import { getSession } from "@/lib/session";

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
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function padDate(n: number): string {
  return String(n).padStart(2, "0");
}

function todayMDY(): string {
  const d = new Date();
  return `${padDate(d.getMonth() + 1)}/${padDate(d.getDate())}/${d.getFullYear()}`;
}

function generateHTML(params: {
  unit: string;
  station: string;
  mileage: string;
  monthLabel: string;
  dateCompleted: string;
  hasRows: boolean;
  tableRows: string;
}): string {
  const { unit, station, mileage, monthLabel, dateCompleted, hasRows, tableRows } = params;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: letter; margin: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    padding: 0.55in 0.6in 0.4in 0.6in;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Title */
  .title-box {
    border: 2px solid #000;
    text-align: center;
    padding: 6px 12px;
    margin-bottom: 6px;
  }
  .title { font-size: 15pt; font-weight: bold; }

  /* Form revision date - right aligned */
  .form-date { text-align: right; font-size: 9pt; margin-bottom: 6px; }

  /* Compliance paragraph */
  .compliance { font-size: 8.5pt; line-height: 1.4; margin-bottom: 10px; }

  /* Field groups */
  .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; margin-bottom: 6px; }
  .field-grid-half { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; margin-bottom: 6px; }

  .field-label { font-size: 8.5pt; font-weight: bold; margin-bottom: 1px; }
  .field-value {
    border: 1px solid #000;
    padding: 2px 5px;
    font-size: 9.5pt;
    min-height: 18px;
    display: block;
  }
  .field-note { font-size: 7.5pt; line-height: 1.3; color: #000; margin-top: 2px; }

  /* Vehicle unit row - unit # left half, note right half */
  .unit-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; margin-bottom: 8px; }

  /* Checkbox questions */
  .checkbox-row { display: flex; align-items: flex-start; margin-bottom: 5px; font-size: 9pt; }
  .checkbox-q { flex: 1; padding-top: 1px; line-height: 1.3; }
  .checkbox-options { display: flex; align-items: center; gap: 6px; white-space: nowrap; padding-left: 12px; }
  .cb-box {
    display: inline-block;
    width: 11px; height: 11px;
    border: 1px solid #000;
    text-align: center; line-height: 11px;
    font-size: 9pt; font-weight: bold;
    flex-shrink: 0;
  }
  .cb-label { font-size: 9pt; }

  /* Instructions */
  .instructions { margin: 7px 0; }
  .instructions p { font-size: 8.5pt; line-height: 1.4; margin-bottom: 4px; }

  /* Maintenance table */
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  thead th {
    border: 1.5px solid #000;
    padding: 3px 6px;
    font-size: 9pt;
    font-weight: bold;
    text-align: left;
    background: #fff;
  }
  tbody td {
    border: 1px solid #000;
    padding: 3px 6px;
    font-size: 9pt;
    height: 18px;
  }
  .col-date { width: 140px; }

  /* Declaration */
  .declaration { display: flex; gap: 6px; margin-bottom: 10px; }
  .decl-box {
    width: 12px; height: 12px; min-width: 12px;
    border: 1px solid #000;
    text-align: center; line-height: 12px;
    font-size: 9pt; font-weight: bold;
    margin-top: 1px;
  }
  .decl-text { font-size: 8.5pt; line-height: 1.4; }

  /* Signature row */
  .sig-row { display: grid; grid-template-columns: 1fr auto; gap: 20px; margin-bottom: 10px; align-items: end; }
  .sig-label { font-size: 9pt; font-weight: bold; margin-bottom: 2px; }
  .sig-box {
    border: 1px solid #000;
    height: 40px;
    display: flex; align-items: center;
    padding: 0 8px;
    overflow: hidden;
  }
  .sig-name {
    font-family: 'Brush Script MT', 'Segoe Script', cursive;
    font-size: 26pt;
    line-height: 1;
    color: #000;
  }
  .date-box { min-width: 200px; }
  .date-val { font-size: 18pt; font-weight: bold; text-align: center; }

  /* Footer */
  .footer-note { font-style: italic; font-size: 7.5pt; line-height: 1.4; border-top: 1px solid #000; padding-top: 5px; margin-bottom: 4px; }
  .footer-bar { display: flex; justify-content: space-between; font-size: 8pt; }
</style>
</head>
<body>

<div class="title-box">
  <span class="title">U.S. Monthly Maintenance Record, MGBA-355</span>
</div>

<div class="form-date">14 May 2025</div>

<div class="compliance">
  To comply with U.S. Federal Regulations, this form must be completed, signed, and submitted to FedEx by the 20th of the
  month following the month for which repairs, or maintenance were performed on any service provider-owned or
  -leased equipment. Submit one record for each piece of equipment, even if not regularly providing services.
</div>

<div class="field-grid" style="margin-bottom:6px">
  <div>
    <div class="field-label">Maintenance Record for the Month and Year of:</div>
    <div class="field-value">${monthLabel}</div>
  </div>
  <div>
    <div class="field-label">Domicile Station/Hub:</div>
    <div class="field-value">${station}</div>
  </div>
</div>

<div class="field-grid" style="margin-bottom:6px">
  <div>
    <div class="field-label">Service Provider Company Name:</div>
    <div class="field-value">MyGroundOps INC</div>
  </div>
  <div>
    <div class="field-label">Current Mileage* (Odometer Reading)</div>
    <div class="field-value">${mileage}</div>
  </div>
</div>

<div class="unit-row">
  <div>
    <div class="field-label">Vehicle Unit #:</div>
    <div class="field-value">${unit}</div>
  </div>
  <div>
    <div class="field-note">*If reading has decreased due to odometer repair/replacement, proof should also be provided. If unit is undergoing repair and unavailable, &ldquo;N/A&rdquo; may be utilized for current mileage.</div>
  </div>
</div>

<div class="checkbox-row">
  <div class="checkbox-q">Were any repairs, or preventative maintenance performed on this unit?</div>
  <div class="checkbox-options">
    <span class="cb-box">${hasRows ? "&#10003;" : ""}</span><span class="cb-label">Yes</span>
    <span class="cb-box">${!hasRows ? "&#10003;" : ""}</span><span class="cb-label">No</span>
  </div>
</div>

<div class="checkbox-row">
  <div class="checkbox-q">If &ldquo;no&rdquo; maintenance was performed, was the unit out of service and unable to provide service (i.e., awaiting repair, on litigation hold, etc.)?</div>
  <div class="checkbox-options">
    <span class="cb-box"></span><span class="cb-label">Yes</span>
    <span class="cb-box"></span><span class="cb-label">No</span>
  </div>
</div>

<div class="instructions">
  <p>All repairs/replacements, or maintenance performed in conformance with a vehicle&#8217;s Maintenance Interval Form or any other major vehicle system must be reported on an MMR with detailed notations or attached receipts.</p>
  <p>All notations must provide enough detail for a DOT official to determine what component(s), location(s), and type of work was performed (e.g., replace, repair, adjust, etc.).</p>
  <p>Annual Federal/State and Pre/Post trip inspections must not be reported on the MMR, however repairs and maintenance of components that resulted from these inspections must be reported on an MMR.</p>
  <p>General maintenance (e.g., oil/filter changes, lubrication, adjustments) should be reported with adequate detail to clearly convey what components were repaired or maintained. Abbreviations such as &#8220;LOF&#8221; or &#8220;PM&#8221; cannot be used, as these do not provide adequate details.</p>
</div>

<table>
  <thead>
    <tr>
      <th class="col-date">Date of Maintenance</th>
      <th>Specific Description of Maintenance Performed</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
</table>

<div class="declaration">
  <div class="decl-box">&#9632;</div>
  <div class="decl-text">By checking this box, I declare that this record is true and correct. Unless otherwise clearly indicated as &#8220;out of service&#8221; on this record, I confirm that the equipment on this record is in compliance with the Federal Motor Carrier Safety Regulations 49 C.F.R. 396.3(a)(1) and 396.7 (a) and is in safe operating condition and meets all federal, state and local motor vehicle laws. Furthermore, I confirm that preventative maintenance is consistent with the interval schedule per 396.3(b)(2).</div>
</div>

<div class="sig-row">
  <div>
    <div class="sig-label">Signature of Authorized Officer or Business Contact:</div>
    <div class="sig-box"><span class="sig-name">Blake Nardoni</span></div>
  </div>
  <div class="date-box">
    <div class="sig-label">Date Completed:</div>
    <div class="sig-box" style="justify-content:center"><span class="date-val">${dateCompleted}</span></div>
  </div>
</div>

<div class="footer-note">
  * The Monthly Maintenance Record (MMR) is FedEx&#8217;s systematic method of obtaining vehicle maintenance records for service provider-owned vehicles in compliance with the Federal Motor Carrier Safety Regulations which require motor carriers to have a systematic method of causing vehicles operating under their motor carrier operating authority to be repaired and maintained. Therefore, if FedEx does not receive records for a vehicle by the 20th of the month following the month in which maintenance or repairs, were performed, packages will not be made available to this vehicle.
</div>
<div class="footer-bar">
  <span>This form for service providers is accessed through mybizaccount.fedex.com</span>
  <span>Page 1 of 1</span>
</div>

</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = req.nextUrl;
  const unit = searchParams.get("unit");
  const month = searchParams.get("month"); // "YYYY-MM"
  const mileageOverride = searchParams.get("mileage");

  if (!unit || !month) {
    return NextResponse.json({ error: "Missing required params: unit, month" }, { status: 400 });
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(month);
  if (!monthMatch) {
    return NextResponse.json({ error: "Invalid month format; expected YYYY-MM" }, { status: 400 });
  }

  const year = parseInt(monthMatch[1], 10);
  const monthNum = parseInt(monthMatch[2], 10);

  if (monthNum < 1 || monthNum > 12) {
    return NextResponse.json({ error: "Month out of range" }, { status: 400 });
  }

  // Look up station
  const config = UNIT_CONFIGS.find((c) => c.unit === unit);
  const station = config?.station ?? "";

  // Look up mileage
  const mileage = mileageOverride ?? getMileage(unit, month);

  // Get maintenance rows from Excel
  const rows = getMmrRows(unit, year, monthNum);
  const hasRows = rows.length > 0;

  // Build table rows, padded to at least 5
  const dataRows = rows.map(
    (r) => `<tr><td>${r.date}</td><td>${r.description}</td></tr>`
  );
  const padCount = Math.max(0, 5 - dataRows.length);
  const padRows = Array(padCount).fill(`<tr><td>&nbsp;</td><td>&nbsp;</td></tr>`);
  const tableRows = [...dataRows, ...padRows].join("\n    ");

  // Month label: "July of 2026"
  const monthLabel = `${MONTH_NAMES[monthNum - 1]} of ${year}`;

  // Date completed
  const dateCompleted = todayMDY();

  const html = generateHTML({
    unit,
    station,
    mileage,
    monthLabel,
    dateCompleted,
    hasRows,
    tableRows,
  });

  const browser = await getBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 850, height: 1100, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });

    const pdfBuffer = await page.pdf({
      format: "Letter",
      landscape: false,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="MMR_${unit}_${month}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
