"use server";

import { db } from "@/lib/db";
import { inspections, inspectionResults } from "@/lib/schema";
import { eq } from "drizzle-orm";

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
  const hasDefects = data.results.some((r) => r.status === "Repair Needed");
  const status = data.outOfService
    ? "Out of Service"
    : hasDefects
    ? "Defects Pending Repair"
    : "Complete";

  const [inspection] = await db
    .insert(inspections)
    .values({
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
  await db.delete(inspectionResults).where(eq(inspectionResults.inspectionId, inspectionId));
  await db.delete(inspections).where(eq(inspections.id, inspectionId));
}

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
  await db.update(inspections).set(patch).where(eq(inspections.id, inspectionId));
}
