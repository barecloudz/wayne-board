import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import AutoDswClient from "./auto-dsw-client";

export const metadata: Metadata = { title: "Auto DSW" };

export default function AutoDswPage() {
  return (
    <AppShell>
      <AutoDswClient />
    </AppShell>
  );
}
