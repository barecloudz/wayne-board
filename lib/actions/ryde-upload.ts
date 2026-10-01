"use server";

import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { rydeReviews, drivers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

function toISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil((((d.getTime() - new Date(Date.UTC(year, 0, 1)).getTime()) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function serialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

export async function uploadRydeFile(
  formData: FormData
): Promise<{ inserted: number; skipped: number; unmatched: string[]; error?: string }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const file = formData.get("ryde") as File | null;
  if (!file) return { inserted: 0, skipped: 0, unmatched: [], error: "No file provided" };

  let wb: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  } catch {
    return { inserted: 0, skipped: 0, unmatched: [], error: "Failed to parse Excel file" };
  }

  // Use "Export" sheet or fall back to first sheet
  const sheetName = wb.SheetNames.includes("Export") ? "Export" : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as (unknown[])[];

  // Load all active drivers for this org to build FedEx ID lookup
  const orgDrivers = await db
    .select({ driverId: drivers.driverId, id: drivers.id })
    .from(drivers)
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.active, true)));

  const fedExIdToDriverId = new Map<string, string>();
  for (const d of orgDrivers) {
    fedExIdToDriverId.set(d.driverId, d.driverId);
  }

  let inserted = 0;
  let skipped = 0;
  const unmatched: string[] = [];

  // Skip header row (index 0)
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const trackId = row[0] != null ? String(row[0]).trim() : null;
    const delvDateRaw = row[1];
    const resourceRaw = row[6] != null ? String(row[6]).trim() : null;
    const starRaw = row[7];
    const whyContent = row[8] != null ? String(row[8]).trim() : null;
    const problemRaw = row[9] != null ? String(row[9]).trim() : null;
    const selectedRaw = row[10] != null ? String(row[10]).trim() : null;
    const commentsRaw = row[11] != null ? String(row[11]).trim() : null;

    // Skip rows without a star rating
    if (starRaw == null || starRaw === "" || starRaw === 0) {
      skipped++;
      continue;
    }

    const stars = typeof starRaw === "number" ? starRaw : parseInt(String(starRaw), 10);
    if (isNaN(stars) || stars === 0) {
      skipped++;
      continue;
    }

    // Parse delivery date
    let week: string | null = null;
    if (delvDateRaw != null && typeof delvDateRaw === "number") {
      const d = serialToDate(delvDateRaw);
      week = toISOWeek(d);
    } else if (delvDateRaw != null && typeof delvDateRaw === "string" && delvDateRaw.trim()) {
      const d = new Date(delvDateRaw);
      if (!isNaN(d.getTime())) week = toISOWeek(d);
    }

    // Extract FedEx ID from Resource field
    let matchedDriverId: string | null = null;
    if (resourceRaw) {
      const m = resourceRaw.match(/\((\d+)\)/);
      if (m) {
        const fedExId = m[1];
        matchedDriverId = fedExIdToDriverId.get(fedExId) ?? null;
        if (!matchedDriverId && !unmatched.includes(resourceRaw)) {
          unmatched.push(resourceRaw);
        }
      } else if (!unmatched.includes(resourceRaw)) {
        unmatched.push(resourceRaw);
      }
    }

    // Determine type
    let type: string;
    if (stars >= 4) type = "positive";
    else if (stars <= 2) type = "negative";
    else type = "neutral";

    const atFault = problemRaw === "Yes" && stars <= 2;
    const content = (whyContent && whyContent.length > 0 ? whyContent : commentsRaw) ?? "";
    const category = selectedRaw && selectedRaw.length > 0 ? selectedRaw : null;

    // Use matched driverId or fall back to raw resource string (storing as-is)
    const driverIdValue = matchedDriverId ?? (resourceRaw ?? "unknown");

    const result = await db
      .insert(rydeReviews)
      .values({
        organizationId: orgId,
        driverId: driverIdValue,
        type,
        stars,
        category,
        content,
        week,
        improvement: null,
        atFault,
        customerInitials: null,
        source: "ryde_upload",
        trackId,
      })
      .onConflictDoNothing()
      .returning({ id: rydeReviews.id });

    if (result.length > 0) inserted++;
    else skipped++;
  }

  revalidatePath("/dashboard/payroll/ryde-upload");
  return { inserted, skipped, unmatched };
}

export async function getUploadedRydeDates(): Promise<string[]> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const rows = await db
    .selectDistinct({ week: rydeReviews.week })
    .from(rydeReviews)
    .where(
      and(
        eq(rydeReviews.organizationId, orgId),
        eq(rydeReviews.source, "ryde_upload")
      )
    )
    .orderBy(rydeReviews.week);

  return rows
    .map(r => r.week ?? "")
    .filter(Boolean)
    .reverse()
    .slice(0, 20);
}
