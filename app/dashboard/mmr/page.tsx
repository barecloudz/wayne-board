import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import MmrClient from "./mmr-client";

export const metadata: Metadata = { title: "MMR Generator" };

export default function MmrPage() {
  return (
    <AppShell>
      <MmrClient />
    </AppShell>
  );
}
