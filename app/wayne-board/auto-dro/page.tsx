import AppShell from "@/components/app-shell";
import AutoDroClient from "./auto-dro-client";

export const dynamic = "force-dynamic";

export default function AutoDROPage() {
  return (
    <AppShell>
      <AutoDroClient />
    </AppShell>
  );
}
