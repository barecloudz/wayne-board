import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inspections, inspectionResults, vehicles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { stampM121 } from "@/lib/m121-stamp";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> }
) {
  const { inspectionId } = await params;
  const id = parseInt(inspectionId);
  if (isNaN(id)) return new NextResponse("Invalid inspection ID", { status: 400 });

  const [inspection] = await db
    .select()
    .from(inspections)
    .where(eq(inspections.id, id))
    .limit(1);

  if (!inspection) return new NextResponse("Inspection not found", { status: 404 });

  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.id, inspection.vehicleId))
    .limit(1);

  if (!vehicle) return new NextResponse("Vehicle not found", { status: 404 });

  const results = await db
    .select()
    .from(inspectionResults)
    .where(eq(inspectionResults.inspectionId, id));

  const pdfBytes = await stampM121(
    {
      inspectorName:    inspection.inspectorName,
      inspectorId:      inspection.inspectorId ?? "",
      stationName:      inspection.stationName,
      stationNumber:    inspection.stationNumber,
      inspectionDate:   inspection.inspectionDate,
      outOfService:     inspection.outOfService ?? false,
      outOfServiceDocs: inspection.outOfServiceDocs ?? null,
      notificationDate: inspection.notificationDate ?? null,
      notifiedAOBCName: inspection.notifiedAOBCName ?? null,
      agreedRepairDate: inspection.agreedRepairDate ?? null,
      status:           inspection.status,
    },
    {
      unitNumber: vehicle.unitNumber,
      make:       vehicle.make,
      model:      vehicle.model,
      year:       vehicle.year,
    },
    results.map((r) => ({
      componentId:  r.componentId,
      status:       r.status,
      dateRepaired: r.dateRepaired ?? null,
      notes:        r.notes ?? null,
    }))
  );

  const filename = `M121_${vehicle.unitNumber.replace(/\s+/g, "_")}_${inspection.inspectionDate}.pdf`;

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
