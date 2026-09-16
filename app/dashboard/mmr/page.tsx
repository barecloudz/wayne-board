import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import MmrClient from "./mmr-client";
import { getActiveVehiclesForMmr } from "@/lib/actions/vehicles";

export const metadata: Metadata = { title: "MMR Generator" };

export default async function MmrPage() {
  const vehicleList = await getActiveVehiclesForMmr();
  return (
    <AppShell>
      <MmrClient vehicleList={vehicleList} />
    </AppShell>
  );
}
