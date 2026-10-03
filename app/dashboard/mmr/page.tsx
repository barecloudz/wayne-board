export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import MmrClient from "./mmr-client";
import { getVehiclesForMmrDashboard, getOrgName } from "@/lib/actions/mmr";

export const metadata: Metadata = { title: "MMR Generator" };

function getPreviousMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export default async function MmrPage() {
  const defaultMonth = getPreviousMonth();
  const [initialVehicles, orgName] = await Promise.all([
    getVehiclesForMmrDashboard(defaultMonth),
    getOrgName(),
  ]);
  return (
    <AppShell>
      <MmrClient initialVehicles={initialVehicles} defaultMonth={defaultMonth} orgName={orgName} />
    </AppShell>
  );
}
