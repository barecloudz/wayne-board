"use server";

import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { dswRouteDays } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";

function parseDateFromTitle(title: string): string | null {
  // Matches MM/DD/YYYY at end of title
  const m = title.match(/(\d{2})\/(\d{2})\/(\d{4})\s*$/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

function parseIlsPct(val: unknown): number | null {
  if (!val && val !== 0) return null;
  const s = String(val).replace("%", "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export async function uploadDswFile(
  formData: FormData
): Promise<{ success: boolean; date?: string; rowsInserted?: number; error?: string }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const dswFile = formData.get("dsw") as File | null;
  const pldFile = formData.get("pld") as File | null;

  if (!dswFile) return { success: false, error: "DSW file is required" };

  // --- Parse DSW ---
  const dswBuffer = await dswFile.arrayBuffer();
  const dswWb = XLSX.read(new Uint8Array(dswBuffer), { type: "array" });
  const dswWs = dswWb.Sheets[dswWb.SheetNames[0]];
  const dswRows = XLSX.utils.sheet_to_json(dswWs, { header: 1, defval: "" }) as unknown[][];

  const titleRow = String(dswRows[0]?.[0] ?? "");
  const date = parseDateFromTitle(titleRow);
  if (!date) return { success: false, error: "Could not parse date from DSW file title: " + titleRow };

  // --- Parse PLD (optional) — build code breakdown map by WA# ---
  const codeMap = new Map<string, Record<string, number>>();

  if (pldFile) {
    const pldBuffer = await pldFile.arrayBuffer();
    const pldWb = XLSX.read(new Uint8Array(pldBuffer), { type: "array" });
    const pldWs = pldWb.Sheets[pldWb.SheetNames[0]];
    const pldRows = XLSX.utils.sheet_to_json(pldWs, { header: 1, defval: "" }) as unknown[][];
    // Row 2 = headers, row 3+ = data
    for (let r = 3; r < pldRows.length; r++) {
      const row = pldRows[r];
      const wa = String(row[2] ?? "").trim().replace(/^0+/, ""); // strip leading zeros
      const starCode = String(row[10] ?? "").trim();
      if (!wa || !starCode || starCode === "0" || starCode === "") continue;
      if (!codeMap.has(wa)) codeMap.set(wa, {});
      const codes = codeMap.get(wa)!;
      const codeStr = starCode.padStart(2, "0");
      codes[codeStr] = (codes[codeStr] ?? 0) + 1;
    }
  }

  // Delete existing rows for this org+date before inserting fresh
  await db
    .delete(dswRouteDays)
    .where(and(eq(dswRouteDays.organizationId, orgId), eq(dswRouteDays.date, date)));

  // --- Insert DSW rows (data starts at row index 4) ---
  let rowsInserted = 0;
  for (let r = 4; r < dswRows.length; r++) {
    const row = dswRows[r];
    const driverNameRaw = String(row[3] ?? "").trim();
    if (!driverNameRaw) continue; // skip empty rows

    const waNumber = String(row[4] ?? "").trim();
    const waName = String(row[1] ?? "").trim();
    const ilsPct = parseIlsPct(row[13]);
    const vscanPkgs = parseInt(String(row[5] ?? ""), 10) || null;
    const delStpsPlanned = parseInt(String(row[6] ?? ""), 10) || null;
    const actDelStps = parseInt(String(row[9] ?? ""), 10) || null;
    const actDelPkgs = parseInt(String(row[10] ?? ""), 10) || null;
    const ilsImpactPkgs = parseInt(String(row[14] ?? ""), 10) || null;
    const nonDelvdStps = parseInt(String(row[15] ?? ""), 10) || null;
    const code85 = parseInt(String(row[16] ?? ""), 10) || null;
    const allStatusCodePkgs = parseInt(String(row[17] ?? ""), 10) || null;
    const dna = parseInt(String(row[19] ?? ""), 10) || null;
    const miles = parseInt(String(row[24] ?? ""), 10) || null;
    const onRoadHours = String(row[25] ?? "").trim() || null;
    const onDutyHours = String(row[26] ?? "").trim() || null;

    // Get code breakdown from PLD for this WA#
    const waKey = waNumber.replace(/^0+/, "");
    const breakdown = codeMap.get(waKey) ?? null;
    const codeBreakdown = breakdown ? JSON.stringify(breakdown) : null;

    await db.insert(dswRouteDays).values({
      organizationId: orgId,
      date,
      driverNameRaw,
      waName,
      waNumber,
      ...(ilsPct != null ? { ilsPct } : {}),
      ...(vscanPkgs != null ? { vscanPkgs } : {}),
      ...(delStpsPlanned != null ? { delStpsPlanned } : {}),
      ...(actDelStps != null ? { actDelStps } : {}),
      ...(actDelPkgs != null ? { actDelPkgs } : {}),
      ...(ilsImpactPkgs != null ? { ilsImpactPkgs } : {}),
      ...(nonDelvdStps != null ? { nonDelvdStps } : {}),
      ...(code85 != null ? { code85 } : {}),
      ...(allStatusCodePkgs != null ? { allStatusCodePkgs } : {}),
      ...(dna != null ? { dna } : {}),
      ...(miles != null ? { miles } : {}),
      ...(onRoadHours != null ? { onRoadHours } : {}),
      ...(onDutyHours != null ? { onDutyHours } : {}),
      codeBreakdown,
    });

    rowsInserted++;
  }

  return { success: true, date, rowsInserted };
}
