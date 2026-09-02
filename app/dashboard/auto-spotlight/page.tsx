import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import AutoSpotlightClient from "./auto-spotlight-client";

export const metadata: Metadata = { title: "Spotlight" };

export default function AutoSpotlightPage() {
  return (
    <AppShell>
      <AutoSpotlightClient />
    </AppShell>
  );
}
