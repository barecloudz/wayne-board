/**
 * MMR Coordinate Calibration Script
 *
 * Run with: node scripts/mmr-calibrate.mjs
 * Opens mmr-calibration-output.pdf — check field placement and adjust coordinates below.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const blankPath = path.join(__dirname, "../lib/mmr-blank.pdf");
const outPath = path.join(__dirname, "../mmr-calibration-output.pdf");

const blankBytes = fs.readFileSync(blankPath);
const doc = await PDFDocument.load(blankBytes);

const font = await doc.embedFont(StandardFonts.Helvetica);
const red = rgb(0.9, 0, 0);

const [page] = doc.getPages();
const { width, height } = page.getSize();
console.log(`Page size: ${width} x ${height} pts`);

// Page is a high-DPI scan: 2343 x 3093 pts (not standard Letter).
// All coordinates are absolute PDF points (origin = bottom-left).
// Font size scaled up proportionally (~26pt ≈ readable 7pt on Letter).

function label(text, x, y) {
  page.drawText(text, { x, y, size: 26, font, color: red });
}

// ── Header fields ──────────────────────────────────────────────────────────────
label("[MONTH/YEAR]",        117, 2413);
label("[DOMICILE STATION]", 1054, 2413);
label("[SERVICE PROVIDER]",  117, 2196);
label("[MILEAGE]",          1054, 2196);
label("[UNIT #]",            117, 1980);

// ── Checkboxes ─────────────────────────────────────────────────────────────────
// "Were any repairs performed?" — Yes / No
label("X", 1593, 1794);   // Yes
label("X", 1827, 1794);   // No

// "Was unit out of service?" — Yes / No
label("X", 1593, 1670);   // Yes
label("X", 1827, 1670);   // No

// ── Maintenance table (5 rows) ─────────────────────────────────────────────────
// Date col x=117, Description col x=539
const TABLE_ROWS = [1392, 1268, 1144, 1052, 928];
for (let i = 0; i < TABLE_ROWS.length; i++) {
  label(`[DATE ${i + 1}]`,  117, TABLE_ROWS[i]);
  label(`[DESC ${i + 1}]`,  539, TABLE_ROWS[i]);
}

// ── Declaration checkbox ───────────────────────────────────────────────────────
label("X", 94, 742);

// ── Signature / Date Completed ─────────────────────────────────────────────────
label("[SIGNATURE]",      117, 278);
label("[DATE COMPLETED]", 1406, 278);

fs.writeFileSync(outPath, await doc.save());
console.log(`Written: ${outPath}`);
console.log("Open it and compare each label to the form's blank fields.");
console.log("Adjust coordinates in this script, then update lib/mmr-stamp.ts.");
