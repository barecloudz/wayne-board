"use server";

import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { dswRouteDays, dswNameMappings, drivers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
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

  // --- Parse DSW ---
  const dswBuffer = await dswFile.arrayBuffer();
  const dswWb = XLSX.read(new Uint8Array(dswBuffer), { type: "array" });
  const dswWs = dswWb.Sheets[dswWb.SheetNames[0]];
  const dswRows = XLSX.utils.sheet_to_json(dswWs, { header: 1, defval: "" }) as unknown[][];

  const titleRow = String(dswRows[0]?.[0] ?? "");
  const date = parseDateFromTitle(titleRow);
  if (!date) return { success: false, error: "Could not parse date from DSW file title: " + titleRow };

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

  // Delete existing rows for this org+date before inserting fresh
  await db
    .delete(dswRouteDays)
    .where(and(eq(dswRouteDays.organizationId, orgId), eq(dswRouteDays.date, date)));

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

    // Resolve driverId from saved mappings
    const resolvedDriverId = mappingLookup.get(driverNameRaw) ?? null;
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

  return { success: true, date, rowsInserted, unmatchedNames };
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

// ── Get distinct uploaded dates (most recent 30) ─────────────────────────────

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
