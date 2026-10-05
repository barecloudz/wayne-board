"use server";

import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { dswRouteDays, dswNameMappings, drivers } from "@/lib/schema";
import { eq, and, count, desc } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

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

// ── Private helper: process a single DSW+PLD pair ────────────────────────────

async function processDswPair(
  dswFile: File,
  pldFile: File | null,
  orgId: number,
  locationId: number | null,
): Promise<{ success: boolean; fileName: string; date?: string; rowsInserted?: number; unmatchedNames?: string[]; error?: string }> {
  const fileName = dswFile.name;

  // --- Parse DSW ---
  const dswBuffer = await dswFile.arrayBuffer();
  const dswWb = XLSX.read(new Uint8Array(dswBuffer), { type: "array" });
  const dswWs = dswWb.Sheets[dswWb.SheetNames[0]];
  const dswRows = XLSX.utils.sheet_to_json(dswWs, { header: 1, defval: "" }) as unknown[][];

  const titleRow = String(dswRows[0]?.[0] ?? "");
  const date = parseDateFromTitle(titleRow);
  if (!date) return { success: false, fileName, error: "Could not parse date from DSW file title: " + titleRow };

  // Wipe existing rows for this date+org so re-uploads replace rather than duplicate
  await db.delete(dswRouteDays).where(and(eq(dswRouteDays.organizationId, orgId), eq(dswRouteDays.date, date)));

  // --- Parse PLD (optional) — build per-WA# breakdown, impact, and ghost counts ---
  // Columns (0-indexed): 0=PkgCnt, 1=AddlInfo, 2=WAName, 3=WA#, 4=PSA, 5=ServiceProvider,
  //   6=VisionLabel, 7=TrackingID, 8=DestAddr, 9=Vehicle#, 10=VSACode, 11=STARCode, 12=STARScanTime
  //
  // ILS impact logic (confirmed by Blake):
  //   effectiveCode = VSA if VSA≠0, else STAR
  //   counts against ILS if: effectiveCode===27 OR (VSA===0 AND STAR===0) [ghost/Code85]

  const codeMap    = new Map<string, Record<string, number>>(); // WA# -> {code: count}
  const impactMap  = new Map<string, number>(); // WA# -> impact pkg count
  const ghostMap   = new Map<string, number>(); // WA# -> ghost (0/0) pkg count

  if (pldFile) {
    const pldBuffer = await pldFile.arrayBuffer();
    const pldWb = XLSX.read(new Uint8Array(pldBuffer), { type: "array" });
    const pldWs = pldWb.Sheets[pldWb.SheetNames[0]];
    const pldRows = XLSX.utils.sheet_to_json(pldWs, { header: 1, defval: "" }) as unknown[][];
    // Row 0 = title, Row 1 = blank, Row 2 = headers, Row 3+ = data
    for (let r = 3; r < pldRows.length; r++) {
      const row = pldRows[r];
      const waRaw = String(row[3] ?? "").trim(); // WA# is col index 3
      const wa = waRaw.replace(/^0+/, ""); // strip leading zeros for key
      if (!wa) continue;

      const vsaCode  = parseInt(String(row[10] ?? "0").trim(), 10) || 0;
      const starCode = parseInt(String(row[11] ?? "0").trim(), 10) || 0;

      // Build code breakdown (effective code for display)
      const effectiveCode = vsaCode !== 0 ? vsaCode : starCode;
      if (!codeMap.has(wa)) codeMap.set(wa, {});
      const codes = codeMap.get(wa)!;
      const codeStr = String(effectiveCode).padStart(2, "0");
      codes[codeStr] = (codes[codeStr] ?? 0) + 1;

      // Determine if this package counts against ILS
      const isGhost  = vsaCode === 0 && starCode === 0;
      const isImpact = effectiveCode === 27 || isGhost;

      if (isImpact) impactMap.set(wa, (impactMap.get(wa) ?? 0) + 1);
      if (isGhost)  ghostMap.set(wa,  (ghostMap.get(wa)  ?? 0) + 1);
    }
  }

  // --- Load saved name mappings for this org ---
  const savedMappings = await db
    .select({ dswName: dswNameMappings.dswName, driverId: dswNameMappings.driverId })
    .from(dswNameMappings)
    .where(eq(dswNameMappings.organizationId, orgId));
  const mappingLookup = new Map(savedMappings.map((m) => [m.dswName, m.driverId]));

  // Load drivers for auto-match fallback
  const allDrivers = await db
    .select({ driverId: drivers.driverId, name: drivers.name })
    .from(drivers)
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.active, true)));
  const driverByName: Record<string, string> = {};
  for (const d of allDrivers) {
    driverByName[d.name.toLowerCase().trim().replace(/\s+/g, " ")] = d.driverId;
  }

  function normalizeDswName(raw: string): string {
    if (!raw) return "";
    const [last, ...rest] = raw.split(",");
    const first = rest.join(" ").trim();
    const display = first ? `${first} ${last}`.trim() : last.trim();
    return display.toLowerCase().trim().replace(/\s+/g, " ");
  }

  function autoMatchDriver(raw: string): string | null {
    const normalized = normalizeDswName(raw);
    if (!normalized) return null;
    if (driverByName[normalized]) return driverByName[normalized];
    const parts = normalized.split(" ");
    if (parts.length > 2) {
      const firstLast = `${parts[0]} ${parts[parts.length - 1]}`;
      if (driverByName[firstLast]) return driverByName[firstLast];
    }
    const significant = parts.filter(p => p.length > 1);
    if (significant.length >= 2) {
      const hit = Object.entries(driverByName).find(([k]) => {
        const kWords = k.split(" ");
        return significant.filter(w => kWords.includes(w)).length >= 2;
      });
      if (hit) return hit[1];
    }
    return null;
  }

  // --- Insert DSW rows (data starts at row index 4) ---
  let rowsInserted = 0;
  const unmatchedNames: string[] = [];

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

    // Get PLD data for this WA#
    const waKey = waNumber.replace(/^0+/, "");
    const breakdown = codeMap.get(waKey) ?? null;
    const codeBreakdown = breakdown ? JSON.stringify(breakdown) : null;
    const pldImpactPkgs = impactMap.get(waKey) ?? null;
    const pldGhostPkgs  = ghostMap.get(waKey)  ?? null;

    // Resolve driverId from saved mappings, then auto-match fallback
    const resolvedDriverId = mappingLookup.get(driverNameRaw) ?? autoMatchDriver(driverNameRaw);
    if (!resolvedDriverId && !unmatchedNames.includes(driverNameRaw)) {
      unmatchedNames.push(driverNameRaw);
    }

    await db.insert(dswRouteDays).values({
      organizationId: orgId,
      date,
      driverNameRaw,
      driverId: resolvedDriverId ?? undefined,
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
      ...(pldImpactPkgs != null ? { pldImpactPkgs } : {}),
      ...(pldGhostPkgs  != null ? { pldGhostPkgs }  : {}),
      ...(locationId    != null ? { locationId }     : {}),
    });

    rowsInserted++;
  }

  return { success: true, fileName, date, rowsInserted, unmatchedNames };
}

// ── Single-file upload (backwards-compatible) ────────────────────────────────

export async function uploadDswFile(
  formData: FormData
): Promise<{ success: boolean; date?: string; rowsInserted?: number; unmatchedNames?: string[]; error?: string }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const dswFile = formData.get("dsw") as File | null;
  const pldFile = formData.get("pld") as File | null;
  const locationIdStr = formData.get("locationId") as string | null;
  const locationId = locationIdStr ? (parseInt(locationIdStr, 10) || null) : null;

  if (!dswFile) return { success: false, error: "DSW file is required" };

  const result = await processDswPair(dswFile, pldFile, orgId, locationId);
  // Strip fileName from the returned shape to keep the original signature
  const { fileName: _f, ...rest } = result;
  void _f;
  return rest;
}

// ── Batch multi-file upload ───────────────────────────────────────────────────

export async function uploadDswBatch(formData: FormData): Promise<{
  results: Array<{
    fileName: string;
    date?: string;
    rowsInserted?: number;
    unmatchedNames?: string[];
    success: boolean;
    error?: string;
  }>;
}> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const locationIdStr = formData.get("locationId") as string | null;
  const locationId = locationIdStr ? (parseInt(locationIdStr, 10) || null) : null;

  const dswFiles = formData.getAll("dsw") as File[];
  const pldFiles = formData.getAll("pld") as File[];

  // Build a date → PLD File map by parsing each PLD file's title row
  const pldByDate = new Map<string, File>();
  for (const pldFile of pldFiles) {
    try {
      const buf = await pldFile.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
      const title = String(rows[0]?.[0] ?? "");
      const date = parseDateFromTitle(title);
      if (date) pldByDate.set(date, pldFile);
    } catch {
      // If we can't parse a PLD date, skip — it will simply be unmatched
    }
  }

  const results: Array<{
    fileName: string;
    date?: string;
    rowsInserted?: number;
    unmatchedNames?: string[];
    success: boolean;
    error?: string;
  }> = [];

  for (const dswFile of dswFiles) {
    try {
      // Peek at DSW date so we can look up the matching PLD
      const buf = await dswFile.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
      const title = String(rows[0]?.[0] ?? "");
      const dswDate = parseDateFromTitle(title);

      const matchedPld = dswDate ? (pldByDate.get(dswDate) ?? null) : null;

      // Re-construct a File from the already-read buffer so processDswPair can arrayBuffer() it again
      const dswFileClone = new File([buf], dswFile.name, { type: dswFile.type });
      const result = await processDswPair(dswFileClone, matchedPld, orgId, locationId);
      results.push(result);
    } catch (err) {
      results.push({
        fileName: dswFile.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  revalidatePath("/dashboard/payroll");
  revalidatePath("/dashboard/payroll/upload");

  return { results };
}

// ── Get uploaded dates with row counts (most recent 60) ──────────────────────

export async function getUploadedDswDatesWithCounts(): Promise<Array<{ date: string; rowCount: number }>> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const rows = await db
    .select({ date: dswRouteDays.date, rowCount: count() })
    .from(dswRouteDays)
    .where(eq(dswRouteDays.organizationId, orgId))
    .groupBy(dswRouteDays.date)
    .orderBy(desc(dswRouteDays.date))
    .limit(60);

  return rows.map(r => ({
    date: typeof r.date === "string" ? r.date.slice(0, 10) : (r.date as Date).toISOString().slice(0, 10),
    rowCount: Number(r.rowCount),
  }));
}

// ── Delete all DSW data for a given date ─────────────────────────────────────

export async function deleteDswDay(date: string): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  await db
    .delete(dswRouteDays)
    .where(and(eq(dswRouteDays.organizationId, orgId), eq(dswRouteDays.date, date)));

  revalidatePath("/dashboard/payroll");
  revalidatePath("/dashboard/payroll/upload");

  return { success: true };
}

// ── Save a DSW name → driver mapping and retroactively patch existing rows ────

export async function saveDswNameMapping(
  dswName: string,
  driverId: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  // Upsert the mapping
  await db
    .insert(dswNameMappings)
    .values({ organizationId: orgId, dswName, driverId })
    .onConflictDoUpdate({
      target: [dswNameMappings.organizationId, dswNameMappings.dswName],
      set: { driverId },
    });

  // Retroactively patch all existing dswRouteDays rows for this name
  await db
    .update(dswRouteDays)
    .set({ driverId })
    .where(
      and(
        eq(dswRouteDays.organizationId, orgId),
        eq(dswRouteDays.driverNameRaw, dswName),
      )
    );

  revalidatePath("/dashboard/payroll");
  return { success: true };
}

// ── Get distinct uploaded dates (most recent 30) — kept for backwards compat ──

export async function getUploadedDswDates(): Promise<string[]> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const rows = await db
    .selectDistinct({ date: dswRouteDays.date })
    .from(dswRouteDays)
    .where(eq(dswRouteDays.organizationId, orgId))
    .orderBy(dswRouteDays.date);

  return rows.map(r => (typeof r.date === "string" ? r.date.slice(0, 10) : (r.date as Date).toISOString().slice(0, 10))).reverse().slice(0, 30);
}

// ── List all saved DSW name mappings for the org ─────────────────────────────

export async function getDswNameMappings(): Promise<Array<{ id: number; dswName: string; driverId: string; driverName: string }>> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const rows = await db
    .select({
      id:         dswNameMappings.id,
      dswName:    dswNameMappings.dswName,
      driverId:   dswNameMappings.driverId,
      driverName: drivers.name,
    })
    .from(dswNameMappings)
    .leftJoin(drivers, eq(drivers.driverId, dswNameMappings.driverId))
    .where(eq(dswNameMappings.organizationId, orgId));

  return rows
    .map(r => ({ id: r.id, dswName: r.dswName, driverId: r.driverId, driverName: r.driverName ?? r.driverId }))
    .sort((a, b) => a.dswName.localeCompare(b.dswName));
}

// ── Delete a DSW name mapping ─────────────────────────────────────────────────

export async function deleteDswNameMapping(id: number): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  await db
    .delete(dswNameMappings)
    .where(and(eq(dswNameMappings.id, id), eq(dswNameMappings.organizationId, orgId)));

  revalidatePath("/dashboard/payroll/upload");
}

// ── Get active drivers for the org (for mapping dropdown) ────────────────────

export async function getActiveDriversForOrg(): Promise<Array<{ driverId: string; name: string }>> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const rows = await db
    .select({ driverId: drivers.driverId, name: drivers.name })
    .from(drivers)
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.active, true)));

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
