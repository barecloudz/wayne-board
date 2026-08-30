import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import AutoDroClient from "./auto-dro-client";

export const metadata: Metadata = { title: "Auto DRO" };

export const dynamic = "force-dynamic";

export default function AutoDROPage() {
  return (
    <AppShell>
      <AutoDroClient />
    </AppShell>
  );
}
