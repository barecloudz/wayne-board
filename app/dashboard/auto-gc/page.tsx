import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import AutoGcClient from "./auto-gc-client";

export const metadata: Metadata = { title: "Auto GC" };

export default function AutoGcPage() {
  return (
    <AppShell>
      <AutoGcClient />
    </AppShell>
  );
}
