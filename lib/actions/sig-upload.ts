"use server";

import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { sigCompliance, drivers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type SigRow = {
  id: number;
  driverId: string | null;
  driverNameRaw: string;
  fedexId: string;
  periodLabel: string;
  sigCompliancePct: number | null;
  sigRequiredStops: number | null;
  sigFailures: number | null;
  sigInvalid: number | null;
  sigInvalidDriverRelease: number | null;
  alcoholCompliancePct: number | null;
  alcoholRequiredStops: number | null;
  alcoholFailures: number | null;
  alcoholSigInvalid: number | null;
  alcoholInvalidDriverRelease: number | null;
};

export async function uploadSigCompliance(
  formData: FormData
): Promise<{ success: boolean; inserted: number; unmatched: string[]; error?: string }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const file = formData.get("file") as File;
  const periodLabel = (formData.get("periodLabel") as string)?.trim();
  if (!file || !periodLabel) return { success: false, inserted: 0, unmatched: [], error: "Missing file or period label" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];

  // Skip header row (row 0) and skip rows where Resource is "Total" or empty or filter text
  const dataRows = rows.slice(1).filter((row) => {
    const resource = String((row as unknown[])[0] ?? "").trim();
    return resource && resource !== "Total" && !resource.startsWith("Applied filters");
  });

  // Get org drivers for matching by FedEx ID
  const orgDrivers = await db
    .select({ driverId: drivers.driverId })
    .from(drivers)
    .where(and(eq(drivers.organizationId, orgId), eq(drivers.active, true)));
  const driverIdSet = new Set(orgDrivers.map((d) => d.driverId));

  // Delete existing data for this period (overwrite semantics)
  await db.delete(sigCompliance).where(
    and(eq(sigCompliance.organizationId, orgId), eq(sigCompliance.periodLabel, periodLabel))
  );

  const unmatched: string[] = [];
  let inserted = 0;

  for (const rawRow of dataRows) {
    const row = rawRow as unknown[];
    const driverNameRaw = String(row[0] ?? "").trim();
    const m = driverNameRaw.match(/\((\d+)\)/);
    if (!m) continue;
    const fedexId = m[1];
    const driverId = driverIdSet.has(fedexId) ? fedexId : null;
    if (!driverId) unmatched.push(driverNameRaw);

    await db.insert(sigCompliance).values({
      organizationId:              orgId,
      driverId,
      driverNameRaw,
      fedexId,
      periodLabel,
      sigCompliancePct:            typeof row[2] === "number" ? row[2] : null,
      sigRequiredStops:            parseInt(String(row[3] ?? ""), 10) || null,
      sigFailures:                 parseInt(String(row[4] ?? ""), 10) || null,
      sigInvalid:                  parseInt(String(row[5] ?? ""), 10) || null,
      sigInvalidDriverRelease:     parseInt(String(row[6] ?? ""), 10) || null,
      alcoholCompliancePct:        typeof row[7] === "number" ? row[7] : null,
      alcoholRequiredStops:        parseInt(String(row[8] ?? ""), 10) || null,
      alcoholFailures:             parseInt(String(row[9] ?? ""), 10) || null,
      alcoholSigInvalid:           parseInt(String(row[10] ?? ""), 10) || null,
      alcoholInvalidDriverRelease: parseInt(String(row[11] ?? ""), 10) || null,
    });
    inserted++;
  }

  revalidatePath("/dashboard/payroll/sig-upload");
  return { success: true, inserted, unmatched };
}

export async function getSigComplianceData(periodLabel: string): Promise<SigRow[]> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const rows = await db
    .select()
    .from(sigCompliance)
    .where(and(eq(sigCompliance.organizationId, orgId), eq(sigCompliance.periodLabel, periodLabel)));

  // Sort worst first (lowest compliance % at top, nulls last)
  return rows.sort((a, b) => {
    const ap = a.sigCompliancePct ?? 1;
    const bp = b.sigCompliancePct ?? 1;
    return ap - bp;
  });
}

export async function getSigPeriods(): Promise<string[]> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const rows = await db
    .selectDistinct({ periodLabel: sigCompliance.periodLabel })
    .from(sigCompliance)
    .where(eq(sigCompliance.organizationId, orgId));

  return rows.map((r) => r.periodLabel).sort().reverse();
}

export async function deleteSigPeriod(periodLabel: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  await db.delete(sigCompliance).where(
    and(eq(sigCompliance.organizationId, orgId), eq(sigCompliance.periodLabel, periodLabel))
  );
  revalidatePath("/dashboard/payroll/sig-upload");
}

export async function linkSigDriver(fedexId: string, driverDbId: number): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const orgId = session.organizationId;

  const [driver] = await db
    .select({ driverId: drivers.driverId })
    .from(drivers)
    .where(and(eq(drivers.id, driverDbId), eq(drivers.organizationId, orgId)))
    .limit(1);
  if (!driver) return;

  await db
    .update(sigCompliance)
    .set({ driverId: driver.driverId })
    .where(and(eq(sigCompliance.organizationId, orgId), eq(sigCompliance.fedexId, fedexId)));

  revalidatePath("/dashboard/payroll/sig-upload");
}
