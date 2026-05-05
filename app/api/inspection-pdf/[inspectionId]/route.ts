import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { inspections, inspectionResults, vehicles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { M121Document } from "@/lib/m121-pdf";
import React from "react";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(
    React.createElement(M121Document, { inspection, vehicle, results }) as any
  );

  const filename = `M121_${vehicle.unitNumber.replace(/\s+/g, "_")}_${inspection.inspectionDate}.pdf`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
