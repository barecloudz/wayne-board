import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { settings, vehicles } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import DoneClient from "./done-client";

export default async function OnboardingDone() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const orgId = session.organizationId;

  // Gather summary data
  const [gcRow] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.organizationId, orgId), eq(settings.key, "gc_username")))
    .limit(1);

  const gcConnected = !!gcRow?.value;

  const vehicleRows = await db
    .select({ unitNumber: vehicles.unitNumber })
    .from(vehicles)
    .where(eq(vehicles.organizationId, orgId));

  // Try to read locations · table may not exist yet if locations agent hasn't run
  let locationNames: string[] = [];
  try {
    const locRows = await db.execute(
      sql`SELECT name FROM locations WHERE organization_id = ${orgId} ORDER BY created_at ASC LIMIT 5`
    );
    locationNames = (locRows.rows as { name: string }[]).map((r) => r.name);
  } catch {
    // locations table doesn't exist yet · that's fine
  }

  return (
    <DoneClient
      gcConnected={gcConnected}
      vehicleCount={vehicleRows.length}
      locationNames={locationNames}
    />
  );
}
