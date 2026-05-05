import { notFound } from "next/navigation";
import AppShell from "@/components/app-shell";
import { db } from "@/lib/db";
import { vehicles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import InspectionForm from "./inspection-form";

export default async function InspectPage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;
  const id = parseInt(vehicleId);
  if (isNaN(id)) notFound();

  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
  if (!vehicle) notFound();

  return (
    <AppShell>
      <InspectionForm vehicle={vehicle} />
    </AppShell>
  );
}
