"use server";

import { db } from "@/lib/db";
import { inspections, inspectionResults } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export type ItemResult = {
  componentId: number;
  status: string;
  notes?: string;
  dateRepaired?: string;
};

export async function saveInspection(data: {
  vehicleId: number;
  inspectorName: string;
  inspectorId: string;
  stationName: string;
  stationNumber: string;
  inspectionDate: string;
  outOfService: boolean;
  outOfServiceDocs?: string;
  results: ItemResult[];
  notificationDate?: string;
  notifiedAOBCName?: string;
  agreedRepairDate?: string;
}) {
  const orgId = await requireOrg();
  const hasDefects = data.results.some((r) => r.status === "Repair Needed");
  const status = data.outOfService
    ? "Out of Service"
    : hasDefects
    ? "Defects Pending Repair"
    : "Complete";

  const [inspection] = await db
    .insert(inspections)
    .values({
      organizationId:   orgId,
      vehicleId:        data.vehicleId,
      inspectorName:    data.inspectorName,
      inspectorId:      data.inspectorId,
      stationName:      data.stationName,
      stationNumber:    data.stationNumber,
      inspectionDate:   data.inspectionDate,
      outOfService:     data.outOfService,
      outOfServiceDocs: data.outOfServiceDocs,
      notificationDate: data.notificationDate,
      notifiedAOBCName: data.notifiedAOBCName,
      agreedRepairDate: data.agreedRepairDate,
      status,
    })
    .returning({ id: inspections.id });

  if (data.results.length > 0) {
    await db.insert(inspectionResults).values(
      data.results.map((r) => ({
        inspectionId: inspection.id,
        componentId:  r.componentId,
        status:       r.status,
        notes:        r.notes,
        dateRepaired: r.dateRepaired,
      }))
    );
  }

  return { inspectionId: inspection.id, status };
}

export async function deleteInspection(inspectionId: number) {
  const orgId = await requireOrg();
  await db.delete(inspectionResults).where(eq(inspectionResults.inspectionId, inspectionId));
  await db.delete(inspections).where(and(eq(inspections.id, inspectionId), eq(inspections.organizationId, orgId)));
}

export async function updateRepairDetails(
  resultId: number,
  repairInstructions: string | null,
  repairCost: number | null
) {
  const orgId = await requireOrg();
  const [result] = await db.select({ inspectionId: inspectionResults.inspectionId })
    .from(inspectionResults).where(eq(inspectionResults.id, resultId)).limit(1);
  if (!result) throw new Error("Not found");
  const [insp] = await db.select({ id: inspections.id }).from(inspections)
    .where(and(eq(inspections.id, result.inspectionId), eq(inspections.organizationId, orgId))).limit(1);
  if (!insp) throw new Error("Not found");
  await db
    .update(inspectionResults)
    .set({ repairInstructions, repairCost })
    .where(eq(inspectionResults.id, resultId));
}

const VALID_INSPECTION_STATUSES = ["Draft", "Complete", "Defects Pending Repair", "Out of Service"] as const;
export type InspectionStatus = typeof VALID_INSPECTION_STATUSES[number];

export async function updateInspectionStatus(
  inspectionId: number,
  patch: {
    outOfService?: boolean;
    outOfServiceDocs?: string | null;
    notificationDate?: string | null;
    notifiedAOBCName?: string | null;
    agreedRepairDate?: string | null;
    status?: string;
  }
) {
  if (patch.status !== undefined && !(VALID_INSPECTION_STATUSES as readonly string[]).includes(patch.status)) {
    throw new Error("Invalid status");
  }
  const orgId = await requireOrg();
  await db.update(inspections).set(patch).where(and(eq(inspections.id, inspectionId), eq(inspections.organizationId, orgId)));
}
