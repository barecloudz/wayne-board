import AppShell from "@/components/app-shell";
import CreateRoutesClient from "./create-routes-client";

export const dynamic = "force-dynamic";

export default function CreateRoutesPage() {
  return (
    <AppShell>
      <CreateRoutesClient />
    </AppShell>
  );
}
