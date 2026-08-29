import AppShell from "@/components/app-shell";
import dynamic from "next/dynamic";

const TiresClient = dynamic(() => import("./tires-client"), { ssr: false });

export default function TiresPage() {
  return (
    <AppShell>
      <TiresClient />
    </AppShell>
  );
}
