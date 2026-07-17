import { NextRequest, NextResponse } from "next/server";
import { dro } from "@/lib/dro-client";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { action, payload = {} } = await req.json() as { action: string; payload: Record<string, unknown> };

    let result: unknown;

    switch (action) {
      // Schedule
      case "getSchedule":
        result = await dro.getSchedule();
        break;
      case "saveSchedule":
        result = await dro.saveSchedule(payload.body);
        break;

      // Plans
      case "getPlans":
        result = await dro.getPlans();
        break;
      case "copyPlan":
        result = await dro.copyPlan(payload.planId as number, payload.newName as string);
        break;
      case "deletePlan":
        result = await dro.deletePlan(payload.planId as number);
        break;

      // Vehicles
      case "getVehicleSet":
        result = await dro.getVehicleSet(payload.planId as number);
        break;
      case "getAdvancedVehicleSet":
        result = await dro.getAdvancedVehicleSet(payload.planId as number);
        break;
      case "addVehicles":
        result = await dro.addVehicles(payload.planId as number, payload.vehicles as unknown[]);
        break;
      case "removeVehicles":
        result = await dro.removeVehicles(payload.planId as number, payload.vehicleSetIds as number[]);
        break;

      // Anchor areas
      case "getAvailableAnchors":
        result = await dro.getAvailableAnchors(
          payload.planId as number,
          payload.vehicleSetId as number
        );
        break;
      case "updateVehicleAnchors":
        result = await dro.updateVehicleAnchors(payload.planId as number, payload.vehicleData);
        break;

      // Fleet
      case "getFleet":
        result = await dro.getFleet();
        break;
      case "updateFleetVehicle":
        result = await dro.updateFleetVehicle(payload.vehicle);
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
