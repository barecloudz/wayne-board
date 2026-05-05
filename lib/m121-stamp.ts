import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import path from "path";
import fs from "fs";
import { INSPECTION_COMPONENTS } from "./inspection-components";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StampInspection = {
  inspectorName: string;
  inspectorId: string;
  stationName: string;
  stationNumber: string;
  inspectionDate: string;
  outOfService: boolean;
  outOfServiceDocs: string | null;
  notificationDate: string | null;
  notifiedAOBCName: string | null;
  agreedRepairDate: string | null;
  status: string;
};

export type StampResult = {
  componentId: number;
  status: string;
  dateRepaired: string | null;
  notes: string | null;
};

export type StampVehicle = {
  unitNumber: string;
  make: string;
  model: string;
  year: number;
};

// ── Coordinates (extracted from PDF content stream) ───────────────────────────
//
// Page size: 792 × 612 pts (landscape). Origin = bottom-left. Y increases up.
//
// Header field underlines (both pages) — text sits just above the underline:
//   Employee value:   x=122,  y=530  (underline y=527)
//   Station value:    x=366,  y=530
//   Vehicle Unit:     x=567,  y=530
//   Date:             x=695,  y=530
//
// Page 2 header underlines are 6pt higher (y=533), so values at y=536.
//
// Table column dividers (both pages):
//   Component/OK:        x=617
//   OK/RepairNeeded:     x=647
//   RepairNeeded/Date:   x=689
//   Right edge:          x=774
//
// Column centers for marks:
//   OK:             x=632  (617–647)
//   Repair Needed:  x=668  (647–689)
//   Date Repaired:  x=691  (left-align in 689–774)
//
// ── Page 1 row ranges (bottom, top) → center y ──────────────────────────────
// Row 1  Lighting         (310.1, 275.2) → 292.7
// Row 2  Horn             (275.2, 260.3) → 267.8
// Row 3  Windshield       (260.3, 225.4) → 242.9
// Row 4  Verify Periodic  (225.4, 210.4) → 217.9
// Row 5  Fire Ext         (210.4, 195.4) → 202.9
// Row 6  Warning Triangles(195.4, 180.4) → 187.9
// Row 7  Seat Belt        (180.4, 165.4) → 172.9
// Row 8  Tire Tread       (165.4, 141.0) → 153.2
// Row 9  Wheels           (141.0, 126.0) → 133.5
// Row 10 Fluid Leaks      (126.0, 101.5) → 113.8
// Row 11 Antifreeze       (101.5,  86.6) →  94.1
// Row 12 Fuel System       (86.6,  62.1) →  74.4
//
// ── Page 2 row ranges (bottom, top) → center y ──────────────────────────────
// Row 13 Rear Mirrors     (482.2, 457.7) → 470.0
// Row 14 Hood Latch       (457.7, 433.3) → 445.5
// Row 15 Required Markings(433.3, 389.6) → 411.5
// Row 16 Emergency Guide  (389.6, 374.7) → 382.2
// Row 17 Haz Mat Envelope (374.7, 359.7) → 367.2
// Row 18 ELD              (359.7, 314.3) → 337.0
// Row 19 Conspicuity Tape (314.3, 299.3) → 306.8
// Row 20 Crossmember      (299.3, 253.8) → 276.6
//
// ── Notification fields (page 2) ─────────────────────────────────────────────
// Date AO/BC notified:         x=108, y=217  (underline y=215.3)
// Name of AO/BC notified:      x=108, y=172  (underline y=169.9)
// Date repairs completed:      x=108, y=110  (underline y=107.3)

const ROW_Y: Record<number, number> = {
  1: 292,  2: 268,  3: 243,  4: 218,  5: 203,
  6: 188,  7: 173,  8: 153,  9: 134,  10: 114,
  11: 94,  12: 74,
  13: 470, 14: 446, 15: 412, 16: 382, 17: 367,
  18: 337, 19: 307, 20: 277,
};

// Column x for mark characters
const X_OK     = 628;
const X_REPAIR = 661;
const X_DATE   = 691;

// Field value x positions (both pages)
const FIELD_EMPLOYEE_X = 122;
const FIELD_STATION_X  = 366;
const FIELD_UNIT_X     = 567;
const FIELD_DATE_X     = 695;

// Header value y (above underline)
const FIELD_Y_P1 = 530; // page 1 underlines at y=527
const FIELD_Y_P2 = 536; // page 2 underlines at y=533

// Notification field values (page 2)
const NOTIF_X      = 108;
const NOTIF_DATE_Y = 217;
const NOTIF_NAME_Y = 172;
const NOTIF_REP_Y  = 110;

// ── Main stamping function ────────────────────────────────────────────────────

export async function stampM121(
  inspection: StampInspection,
  vehicle: StampVehicle,
  results: StampResult[]
): Promise<Uint8Array> {
  const blankPath = path.join(process.cwd(), "lib", "m121-blank.pdf");
  const blankBytes = fs.readFileSync(blankPath);
  const doc = await PDFDocument.load(blankBytes);

  const font     = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black    = rgb(0, 0, 0);

  const [page1, page2] = doc.getPages();

  // ── Helper ──────────────────────────────────────────────────────────────────

  function text(
    page: typeof page1,
    value: string,
    x: number,
    y: number,
    opts?: { bold?: boolean; size?: number }
  ) {
    if (!value) return;
    page.drawText(value, {
      x, y,
      size: opts?.size ?? 7,
      font: opts?.bold ? fontBold : font,
      color: black,
    });
  }

  // ── Page 1 header fields ────────────────────────────────────────────────────

  const employeeLabel = inspection.inspectorId
    ? `${inspection.inspectorName} / ${inspection.inspectorId}`
    : inspection.inspectorName;

  text(page1, employeeLabel, FIELD_EMPLOYEE_X, FIELD_Y_P1, { bold: true, size: 8 });
  text(page1, `${inspection.stationName} #${inspection.stationNumber}`, FIELD_STATION_X, FIELD_Y_P1, { bold: true, size: 8 });
  text(page1, vehicle.unitNumber, FIELD_UNIT_X, FIELD_Y_P1, { bold: true, size: 8 });
  text(page1, inspection.inspectionDate, FIELD_DATE_X, FIELD_Y_P1, { bold: true, size: 8 });

  // ── Page 2 header fields (same values) ─────────────────────────────────────

  text(page2, employeeLabel, FIELD_EMPLOYEE_X, FIELD_Y_P2, { bold: true, size: 8 });
  text(page2, `${inspection.stationName} #${inspection.stationNumber}`, FIELD_STATION_X, FIELD_Y_P2, { bold: true, size: 8 });
  text(page2, vehicle.unitNumber, FIELD_UNIT_X, FIELD_Y_P2, { bold: true, size: 8 });
  text(page2, inspection.inspectionDate, FIELD_DATE_X, FIELD_Y_P2, { bold: true, size: 8 });

  // ── Component rows ──────────────────────────────────────────────────────────

  for (const component of INSPECTION_COMPONENTS) {
    const result = results.find((r) => r.componentId === component.id);
    const status = result?.status ?? "";
    const rowY   = ROW_Y[component.id];
    if (!rowY) continue;

    const page = component.id <= 12 ? page1 : page2;
    const markY = rowY - 3; // small downward offset so mark sits in cell center

    if (status === "OK") {
      text(page, "X", X_OK, markY, { bold: true, size: 9 });
    } else if (status === "Repair Needed") {
      text(page, "X", X_REPAIR, markY, { bold: true, size: 9 });
    } else if (status === "N/A") {
      text(page, "N/A", X_OK - 2, markY, { size: 7 });
    } else if (status === "A/D") {
      text(page, "A/D", X_OK - 2, markY, { size: 7 });
    }

    // Date repaired
    if (result?.dateRepaired) {
      text(page, result.dateRepaired, X_DATE, markY, { size: 7 });
    }
  }

  // ── Out of service (page 1, checkbox area) ───────────────────────────────────
  // The OOS checkbox is in the right-side box around x=718, y=462 (the box area)
  // From the form, the checkbox is at the right side of the OOS box
  if (inspection.outOfService) {
    text(page1, "X", 718, 462, { bold: true, size: 9 });
  }

  // ── Notification section (page 2) ───────────────────────────────────────────

  if (inspection.notificationDate) {
    text(page2, inspection.notificationDate, NOTIF_X, NOTIF_DATE_Y, { bold: true, size: 8 });
  }
  if (inspection.notifiedAOBCName) {
    text(page2, inspection.notifiedAOBCName, NOTIF_X, NOTIF_NAME_Y, { bold: true, size: 8 });
  }
  if (inspection.agreedRepairDate) {
    text(page2, inspection.agreedRepairDate, NOTIF_X, NOTIF_REP_Y, { bold: true, size: 8 });
  }

  return doc.save();
}
