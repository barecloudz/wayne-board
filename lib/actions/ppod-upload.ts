"use server";

import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { ppodDays, ppodNameMappings, drivers } from "@/lib/schema";
import { eq, and, count, desc, isNull, gte, lte, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

function parseDateFromFilename(filename: string): string | null {
  // Try YYYY-MM-DD anywhere in filename
  const m = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // Try MM/DD/YYYY or MM-DD-YYYY
  const m2 = filename.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (m2) return `${m2[3]}-${m2[1]}-${m2[2]}`;
  return null;
}

function parsePpodPct(val: unknown): number | null {
  if (val == null || val === "") return null;
  const s = String(val).replace("%", "").trim();
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  // If stored as fraction (0–1 range), convert to percentage
  if (n > 0 && n <= 1) return n * 100;
  return n;
}

// Extract FedEx employee ID from "A. HALBACH (5595484)" → "5595484"
function extractFedexId(raw: string): string | null {
  const m = raw.match(/\((\d{5,8})\)\s*$/);
  return m ? m[1] : null;
}

// Handles both "LAST,FIRST" and "A. LAST (ID)" formats
function normalizePpodName(raw: string): string {
  if (!raw) return "";
  const stripped = raw.replace(/\s*\(\d+\)\s*$/, "").trim();
  if (stripped.includes(",")) {
    const [last, ...rest] = stripped.split(",");
    const first = rest.join(" ").trim();
    const display = first ? `${first} ${last}`.trim() : last.trim();
    return display.toLowerCase().trim().replace(/\s+/g, " ");
  }
  return stripped.toLowerCase().trim().replace(/\s+/g, " ");
}

function autoMatchDriver(
  raw: string,
  driverByName: Record<string, string>,
  driverById: Record<string, string>,
): string | null {
  // Primary: FedEx ID match — exact and reliable
  const fedexId = extractFedexId(raw);
  if (fedexId && driverById[fedexId]) return driverById[fedexId];

  const normalized = normalizePpodName(raw);
  if (!normalized) return null;
  if (driverByName[normalized]) return driverByName[normalized];

  const parts = normalized.replace(/\./g, "").split(" ").filter(Boolean);
  if (parts.length > 2) {
    const firstLast = `${parts[0]} ${parts[parts.length - 1]}`;
    if (driverByName[firstLast]) return driverByName[firstLast];
  }
  const significant = parts.filter((p) => p.length > 1);
  if (significant.length >= 2) {
    const hit = Object.entries(driverByName).find(([k]) => {
      const kWords = k.split(" ");
      return significant.filter((w) => kWords.includes(w)).length >= 2;
    });
    if (hit) return hit[1];
    const hit2 = Object.entries(driverByName).find(([k]) => {
      const kWords = k.split(" ");
      let matches = 0;
      for (const w of significant) {
        if (kWords.some((kw) => kw === w || (w.length >= 3 && kw.startsWith(w)) || (kw.length >= 3 && w.startsWith(kw)))) matches++;
      }
      return matches >= 2;
    });
    if (hit2) return hit2[1];
  }
  return null;
}

// ── Batch multi-file upload ───────────────────────────────────────────────────

export async function uploadPpodBatch(formData: FormData): Promise<{
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
  const locationId = locationIdStr ? parseInt(locationIdStr, 10) || null : null;

  const ppodFiles = formData.getAll("ppod") as File[];

  // Load drivers for auto-match
  const allDrivers = await db
    .select({ driverId: drivers.driverId, name: drivers.name })
    .from(drivers)
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.active, true)));
  const driverByName: Record<string, string> = {};
  const driverById: Record<string, string> = {};
  for (const d of allDrivers) {
    driverByName[d.name.toLowerCase().trim().replace(/\s+/g, " ")] = d.driverId;
    driverById[d.driverId] = d.driverId;
  }

  // Load saved name mappings
  const savedMappings = await db
    .select({ ppodName: ppodNameMappings.ppodName, driverId: ppodNameMappings.driverId })
    .from(ppodNameMappings)
    .where(eq(ppodNameMappings.organizationId, orgId));
  const mappingLookup = new Map(savedMappings.map((m) => [m.ppodName, m.driverId]));

  const results: Array<{
    fileName: string;
    date?: string;
    rowsInserted?: number;
    unmatchedNames?: string[];
    success: boolean;
    error?: string;
  }> = [];

  const manualDateRaw = formData.get("manualDate") as string | null;
  const manualDate = manualDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(manualDateRaw.trim()) ? manualDateRaw.trim() : null;

  for (const file of ppodFiles) {
    const fileName = file.name;
    try {
      const date = manualDate ?? parseDateFromFilename(fileName);
      if (!date) {
        results.push({ fileName, success: false, error: `Could not parse date from filename: ${fileName}. Name should contain YYYY-MM-DD, or enter a Week Ending Date above.` });
        continue;
      }

      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];

      // Row 0 = header, data starts at row 1
      const dataRows = rows.slice(1);

      let rowsInserted = 0;
      const unmatchedNames: string[] = [];

      for (const row of dataRows) {
        const r = row as unknown[];
        const driverNameRaw = String(r[0] ?? "").trim();
        if (!driverNameRaw || driverNameRaw.toLowerCase().startsWith("total") || driverNameRaw.toLowerCase().startsWith("applied filters")) continue;

        // Col layout from PPOD resource export:
        // [0] RESOURCE "A. HALBACH (5595484)"
        // [1] TOTAL CLASSIFICATIONS (photo group)
        // [2] GOOD % (photo quality) ← ppodPct
        // [3] NO PKG VISIBLE %
        // [4] SENSITIVE INFO %
        // [5] OTHER %
        // [6] TOTAL CLASSIFICATIONS (location group)
        // [7] GOOD % (location)
        // [8] POOR %
        // [9] OVER 1 MILE %
        // [10] TOTAL APPLIED
        // [11] DTC %
        const ppodPct         = parsePpodPct(r[2]);
        const photoTotal      = parseInt(String(r[1] ?? ""), 10) || null;
        const photoNoPkgPct   = parsePpodPct(r[3]);
        const photoSensitivePct = parsePpodPct(r[4]);
        const photoOtherPct   = parsePpodPct(r[5]);
        const locTotal        = parseInt(String(r[6] ?? ""), 10) || null;
        const locGoodPct      = parsePpodPct(r[7]);
        const locPoorPct      = parsePpodPct(r[8]);
        const locOverMilePct  = parsePpodPct(r[9]);
        const locTotalApplied = parseInt(String(r[10] ?? ""), 10) || null;
        const dtcPct          = parsePpodPct(r[11]);

        const resolvedDriverId =
          mappingLookup.get(driverNameRaw) ?? autoMatchDriver(driverNameRaw, driverByName, driverById);
        if (!resolvedDriverId && !unmatchedNames.includes(driverNameRaw)) {
          unmatchedNames.push(driverNameRaw);
        }

        const newFields = {
          ...(ppodPct          != null ? { ppodPct }          : {}),
          ...(photoTotal       != null ? { photoTotal }       : {}),
          ...(photoNoPkgPct    != null ? { photoNoPkgPct }    : {}),
          ...(photoSensitivePct != null ? { photoSensitivePct } : {}),
          ...(photoOtherPct    != null ? { photoOtherPct }    : {}),
          ...(locTotal         != null ? { locTotal }         : {}),
          ...(locGoodPct       != null ? { locGoodPct }       : {}),
          ...(locPoorPct       != null ? { locPoorPct }       : {}),
          ...(locOverMilePct   != null ? { locOverMilePct }   : {}),
          ...(locTotalApplied  != null ? { locTotalApplied }  : {}),
          ...(dtcPct           != null ? { dtcPct }           : {}),
          ...(locationId       != null ? { locationId }       : {}),
        };

        await db
          .insert(ppodDays)
          .values({
            organizationId: orgId,
            date,
            driverNameRaw,
            driverId: resolvedDriverId ?? undefined,
            ...newFields,
          })
          .onConflictDoUpdate({
            target: [ppodDays.organizationId, ppodDays.date, ppodDays.driverNameRaw],
            set: {
              driverId: resolvedDriverId ?? undefined,
              ...newFields,
              syncedAt: new Date(),
            },
          });

        rowsInserted++;
      }

      results.push({ fileName, success: true, date, rowsInserted, unmatchedNames });
    } catch (err) {
      results.push({
        fileName,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  revalidatePath("/dashboard/payroll");
  revalidatePath("/dashboard/payroll/ppod-upload");

  return { results };
}

// ── Save a PPOD name → driver mapping and retroactively patch existing rows ───

export async function savePpodNameMapping(
  ppodName: string,
  driverId: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  await db
    .insert(ppodNameMappings)
    .values({ organizationId: orgId, ppodName, driverId })
    .onConflictDoUpdate({
      target: [ppodNameMappings.organizationId, ppodNameMappings.ppodName],
      set: { driverId },
    });

  // Retroactively patch existing ppodDays rows for this name
  await db
    .update(ppodDays)
    .set({ driverId })
    .where(
      and(
        eq(ppodDays.organizationId, orgId),
        eq(ppodDays.driverNameRaw, ppodName),
      ),
    );

  revalidatePath("/dashboard/payroll");
  return { success: true };
}

// ── Get uploaded dates with row counts ────────────────────────────────────────

export async function getUploadedPpodDatesWithCounts(): Promise<Array<{ date: string; rowCount: number }>> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const rows = await db
    .select({ date: ppodDays.date, rowCount: count() })
    .from(ppodDays)
    .where(eq(ppodDays.organizationId, orgId))
    .groupBy(ppodDays.date)
    .orderBy(desc(ppodDays.date))
    .limit(60);

  return rows.map((r) => ({
    date: typeof r.date === "string" ? r.date.slice(0, 10) : (r.date as Date).toISOString().slice(0, 10),
    rowCount: Number(r.rowCount),
  }));
}

// ── Delete all PPOD data for a given date ─────────────────────────────────────

export async function deletePpodDay(date: string): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  await db
    .delete(ppodDays)
    .where(and(eq(ppodDays.organizationId, orgId), eq(ppodDays.date, date)));

  revalidatePath("/dashboard/payroll");
  revalidatePath("/dashboard/payroll/ppod-upload");

  return { success: true };
}

// ── Get all PPOD rows with no matched driverId ────────────────────────────────

export async function getUnmatchedPpodNames(): Promise<Array<{ driverNameRaw: string; rowCount: number; dates: string[] }>> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const rows = await db
    .select({
      driverNameRaw: ppodDays.driverNameRaw,
      rowCount: count(),
      dates: sql<string>`string_agg(${ppodDays.date}::text, ',' ORDER BY ${ppodDays.date} DESC)`,
    })
    .from(ppodDays)
    .where(and(eq(ppodDays.organizationId, orgId), isNull(ppodDays.driverId)))
    .groupBy(ppodDays.driverNameRaw)
    .orderBy(count());

  return rows.map((r) => ({
    driverNameRaw: r.driverNameRaw,
    rowCount: Number(r.rowCount),
    dates: typeof r.dates === "string" ? r.dates.split(",").map((d) => d.slice(0, 10)) : [],
  }));
}

// ── Get PPOD data for a date range ────────────────────────────────────────────

export async function getPpodDataForRange(
  startDate: string,
  endDate: string,
): Promise<Array<{ driverId: string | null; driverNameRaw: string; date: string; ppodPct: number | null; totalPkgs: number | null; podCaptured: number | null; locationId: number | null }>> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const rows = await db
    .select({
      driverId: ppodDays.driverId,
      driverNameRaw: ppodDays.driverNameRaw,
      date: ppodDays.date,
      ppodPct: ppodDays.ppodPct,
      totalPkgs: ppodDays.totalPkgs,
      podCaptured: ppodDays.podCaptured,
      locationId: ppodDays.locationId,
    })
    .from(ppodDays)
    .where(
      and(
        eq(ppodDays.organizationId, orgId),
        gte(ppodDays.date, startDate),
        lte(ppodDays.date, endDate),
      ),
    );

  return rows.map((r) => ({
    driverId: r.driverId,
    driverNameRaw: r.driverNameRaw,
    date: typeof r.date === "string" ? r.date.slice(0, 10) : (r.date as Date).toISOString().slice(0, 10),
    ppodPct: r.ppodPct,
    totalPkgs: r.totalPkgs,
    podCaptured: r.podCaptured,
    locationId: r.locationId,
  }));
}

// ── List all saved PPOD name mappings for the org ─────────────────────────────

export async function getPpodNameMappings(): Promise<Array<{ id: number; ppodName: string; driverId: string; driverName: string }>> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const rows = await db
    .select({
      id:         ppodNameMappings.id,
      ppodName:   ppodNameMappings.ppodName,
      driverId:   ppodNameMappings.driverId,
      driverName: drivers.name,
    })
    .from(ppodNameMappings)
    .leftJoin(drivers, eq(drivers.driverId, ppodNameMappings.driverId))
    .where(eq(ppodNameMappings.organizationId, orgId));

  return rows
    .map((r) => ({ id: r.id, ppodName: r.ppodName, driverId: r.driverId, driverName: r.driverName ?? r.driverId }))
    .sort((a, b) => a.ppodName.localeCompare(b.ppodName));
}

// ── Delete a PPOD name mapping ────────────────────────────────────────────────

export async function deletePpodNameMapping(id: number): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  await db
    .delete(ppodNameMappings)
    .where(and(eq(ppodNameMappings.id, id), eq(ppodNameMappings.organizationId, orgId)));

  revalidatePath("/dashboard/payroll/ppod-upload");
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
