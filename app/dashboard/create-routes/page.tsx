import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import CreateRoutesClient from "./create-routes-client";

export const metadata: Metadata = { title: "Create Routes" };

export const dynamic = "force-dynamic";

export default function CreateRoutesPage() {
  return (
    <AppShell>
      <CreateRoutesClient />
    </AppShell>
  );
}
