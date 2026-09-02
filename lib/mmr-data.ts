export type UnitConfig = { unit: string; station: string };

export const UNIT_CONFIGS: UnitConfig[] = [
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

// Key: "UNIT-YYYY-MM", value: mileage string (e.g. "52,822")
const MILEAGE_LOOKUP: Record<string, string> = {
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

export function getMileage(unit: string, yearMonth: string): string {
  return MILEAGE_LOOKUP[`${unit}-${yearMonth}`] ?? "";
}

export type MmrRow = { date: string; description: string }; // date = "MM/DD/YYYY"

export function getMmrRows(unit: string, year: number, month: number): MmrRow[] {
  const trackerPath = process.env.MAINTENANCE_TRACKER_PATH;
  if (!trackerPath) return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const xlsx = require("xlsx") as typeof import("xlsx");
    const fs = require("fs") as typeof import("fs");

    if (!fs.existsSync(trackerPath)) return [];

    const workbook = xlsx.readFile(trackerPath);
    const sheet = workbook.Sheets[unit];
    if (!sheet) return [];

    const raw = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
    }) as unknown[][];

    const rows: MmrRow[] = [];

    // Data starts at row index 3 (skip 3 header rows)
    for (let i = 3; i < raw.length; i++) {
      const row = raw[i];
      if (!Array.isArray(row)) continue;

      const serial = row[0];
      const description = row[4];

      if (typeof description !== "string" || description.trim() === "") continue;
      if (typeof serial !== "number" || isNaN(serial)) continue;

      // Convert Excel serial date to JS Date (UTC)
      const d = new Date((serial - 25569) * 86400 * 1000);
      const rowYear = d.getUTCFullYear();
      const rowMonth = d.getUTCMonth() + 1; // 1-based

      if (rowYear !== year || rowMonth !== month) continue;

      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const yyyy = String(d.getUTCFullYear());
      const dateStr = `${mm}/${dd}/${yyyy}`;

      rows.push({ date: dateStr, description: description.trim() });
    }

    return rows;
  } catch {
    return [];
  }
}
