/**
 * MMR PDF generator — stamps data onto the official FedEx blank form.
 * No AcroForm fields — plain drawText on top of the blank, same as filling by hand.
 *
 * Usage:
 *   node scripts/gen-mmr.mjs                    → all units, default month (2026-07)
 *   node scripts/gen-mmr.mjs all 2026-07        → all units, specified month
 *   node scripts/gen-mmr.mjs 206127 2026-07     → single unit
 *
 * Output:
 *   MMR_ALL_YYYY-MM.pdf   (all units)
 *   MMR_206127_YYYY-MM.pdf (single unit)
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { createRequire } from "module";

const require   = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ─────────────────────────────────────────────────────────────────────
const BLANK_PATH = path.join(__dirname, "../lib/mmr-blank.pdf");
const EXCEL_PATH = "C:/Users/Blake/Downloads/Maintenance Order Tracker.xlsx";

const UNIT_CONFIGS = [
  { unit: "206127", station: "0259" },
  { unit: "206129", station: "0259" },
  { unit: "206543", station: "0259" },
  { unit: "473141", station: "0267" },
  { unit: "479036", station: "0259" },
  { unit: "479632", station: "0259" },
  { unit: "504191", station: "0259" },
  { unit: "532095", station: "0259" },
  { unit: "532096", station: "0259" },
  { unit: "537362", station: "0259" },
  { unit: "537366", station: "0259" },
  { unit: "537367", station: "0259" },
  { unit: "537369", station: "0259" },
  { unit: "537372", station: "0259" },
  { unit: "538564", station: "0259" },
  { unit: "538565", station: "0259" },
  { unit: "538566", station: "0259" },
];

const MILEAGE_LOOKUP = {
  "206127-2026-07": "52,822",
  "206129-2026-07": "62,681",
  "206543-2026-07": "18,724",
  "473141-2026-07": "69,992",
  "479036-2026-07": "62,852",
  "479632-2026-07": "103,310",
  "504191-2026-07": "41,055",
  "532095-2026-07": "43,028",
  "532096-2026-07": "37,738",
  "537362-2026-07": "22,507",
  "537366-2026-07": "26,567",
  "537367-2026-07": "20,294",
  "537369-2026-07": "18,810",
  "537372-2026-07": "18,713",
  "538564-2026-07": "",
  "538565-2026-07": "20,725",
  "538566-2026-07": "18,908",
};

// Units that were genuinely out of service this month (no maintenance AND unavailable).
// All others with no maintenance rows are assumed in-service → outOfService = No.
const OUT_OF_SERVICE_UNITS = new Set([
  // e.g. "538564"
]);

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ── Stamp coordinates (PDF points, origin = bottom-left) ───────────────────────
// Page dimensions: 2343 x 3093 pts (high-DPI scan — NOT standard Letter).
// Calibrated via scripts/mmr-calibrate.mjs against lib/mmr-blank.pdf.
const TEXT_SIZE = 22;
const CB_SIZE   = 30;

const COORDS = {
  monthYear:     { x: 117,  y: 2413 },
  station:       { x: 1054, y: 2413 },
  company:       { x: 117,  y: 2196 },
  mileage:       { x: 1054, y: 2196 },
  unitNum:       { x: 117,  y: 1980 },
  repairsYes:    { x: 1593, y: 1794 },
  repairsNo:     { x: 1827, y: 1794 },
  outSvcYes:     { x: 1593, y: 1670 },
  outSvcNo:      { x: 1827, y: 1670 },
  declaration:   { x: 94,   y: 742  },
  signature:     { x: 117,  y: 278  },
  dateCompleted: { x: 1406, y: 278  },
  tableRows: [
    { date: { x: 117, y: 1392 }, desc: { x: 539, y: 1392 } },
    { date: { x: 117, y: 1268 }, desc: { x: 539, y: 1268 } },
    { date: { x: 117, y: 1144 }, desc: { x: 539, y: 1144 } },
    { date: { x: 117, y: 1052 }, desc: { x: 539, y: 1052 } },
    { date: { x: 117, y: 928  }, desc: { x: 539, y: 928  } },
  ],
};

// ── Args ───────────────────────────────────────────────────────────────────────
const unitArg = process.argv[2];
const month   = process.argv[3] ?? "2026-07";

const monthMatch = /^(\d{4})-(\d{2})$/.exec(month);
if (!monthMatch) { console.error("Invalid month format; expected YYYY-MM"); process.exit(1); }
const year     = parseInt(monthMatch[1], 10);
const monthNum = parseInt(monthMatch[2], 10);

const unitsToGenerate = (!unitArg || unitArg === "all")
  ? UNIT_CONFIGS
  : UNIT_CONFIGS.filter(c => c.unit === unitArg);

if (!unitsToGenerate.length) {
  console.error(`Unknown unit: ${unitArg}`);
  process.exit(1);
}

const isMulti    = unitsToGenerate.length > 1;
const monthLabel = `${MONTH_NAMES[monthNum - 1]} of ${year}`;

// ── Excel parsing ──────────────────────────────────────────────────────────────
function getMmrRows(unit, year, monthNum) {
  try {
    const xlsx = require("xlsx");
    const wb   = xlsx.readFile(EXCEL_PATH);
    const ws   = wb.Sheets[unit];
    if (!ws) return [];

    const rows    = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const results = [];

    for (let i = 3; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;

      const dateVal = row[0];
      let date;
      if (typeof dateVal === "number") {
        date = new Date((dateVal - 25569) * 86400 * 1000);
      } else if (typeof dateVal === "string" && dateVal.trim()) {
        date = new Date(dateVal);
      } else {
        continue;
      }

      if (isNaN(date.getTime())) continue;
      if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== monthNum) continue;

      const description = String(row[4] ?? "").trim();
      if (!description) continue;

      const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(date.getUTCDate()).padStart(2, "0");
      results.push({ date: `${mm}/${dd}/${date.getUTCFullYear()}`, description });
    }

    return results;
  } catch (err) {
    console.warn(`  [${unit}] Excel read error: ${err.message}`);
    return [];
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, "0"); }
function todayMDY() {
  const d = new Date();
  return `${pad2(d.getMonth()+1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
}

// ── Stamp one unit onto a fresh copy of the blank ─────────────────────────────
async function stampUnit(blankBytes, { unit, station, mileage, rows, dateCompleted }) {
  const doc  = await PDFDocument.load(blankBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.getPages()[0];
  const black = rgb(0, 0, 0);

  const text = (str, x, y, size = TEXT_SIZE) => {
    if (!str) return;
    page.drawText(String(str), { x, y, size, font, color: black });
  };

  const checkmark = (x, y) => {
    page.drawText("X", { x, y, size: CB_SIZE, font, color: black });
  };

  // Header fields
  text(monthLabel,         COORDS.monthYear.x,     COORDS.monthYear.y);
  text(station,            COORDS.station.x,       COORDS.station.y);
  text("Apparo Group INC", COORDS.company.x,       COORDS.company.y);
  text(mileage,            COORDS.mileage.x,       COORDS.mileage.y);
  text(unit,               COORDS.unitNum.x,       COORDS.unitNum.y);

  // Checkbox logic per FedEx requirement:
  //   YES → check top Yes only
  //   NO  → check top No + must also answer out-of-service question
  const hasRows  = rows.length > 0;
  const outOfSvc = OUT_OF_SERVICE_UNITS.has(unit);

  if (hasRows) {
    checkmark(COORDS.repairsYes.x, COORDS.repairsYes.y);
    // Out-of-service row is N/A when repairs were performed — leave blank
  } else {
    checkmark(COORDS.repairsNo.x, COORDS.repairsNo.y);
    // Must also check the out-of-service question
    if (outOfSvc) {
      checkmark(COORDS.outSvcYes.x, COORDS.outSvcYes.y);
    } else {
      checkmark(COORDS.outSvcNo.x, COORDS.outSvcNo.y);
    }
  }

  // Maintenance table rows
  for (let i = 0; i < COORDS.tableRows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    text(row.date,        COORDS.tableRows[i].date.x, COORDS.tableRows[i].date.y);
    text(row.description, COORDS.tableRows[i].desc.x, COORDS.tableRows[i].desc.y);
  }

  // Declaration + signature
  checkmark(COORDS.declaration.x,  COORDS.declaration.y);
  text("Blake Nardoni",  COORDS.signature.x,     COORDS.signature.y);
  text(dateCompleted,    COORDS.dateCompleted.x, COORDS.dateCompleted.y);

  return doc;
}

// ── Main ───────────────────────────────────────────────────────────────────────
const dateCompleted = todayMDY();
const blankBytes    = readFileSync(BLANK_PATH);

console.log(`\nGenerating ${unitsToGenerate.length} MMR(s) for ${monthLabel}...`);

const output = await PDFDocument.create();

for (const { unit, station } of unitsToGenerate) {
  const mileage = MILEAGE_LOOKUP[`${unit}-${month}`] ?? "";
  const rows    = getMmrRows(unit, year, monthNum);
  const repairs = rows.length > 0 ? "YES" : "NO";
  console.log(`  ${unit} | station ${station} | mileage: ${mileage || "(blank)"} | rows: ${rows.length} | repairs: ${repairs}`);

  const unitDoc = await stampUnit(blankBytes, { unit, station, mileage, rows, dateCompleted });
  const [copiedPage] = await output.copyPages(unitDoc, [0]);
  output.addPage(copiedPage);
}

const prefix  = isMulti ? "MMR_ALL" : `MMR_${unitsToGenerate[0].unit}`;
const outPath = path.resolve(__dirname, `../${prefix}_${month}.pdf`);
writeFileSync(outPath, await output.save());

console.log(`\nSaved (${output.getPageCount()} page${output.getPageCount() > 1 ? "s" : ""}): ${outPath}`);
