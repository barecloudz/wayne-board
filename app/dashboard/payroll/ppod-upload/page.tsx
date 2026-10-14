export const dynamic = "force-dynamic";
import AppShell from "@/components/app-shell";
import PpodUploadClient from "./upload-client";

export default function PpodUploadPage() {
  return (
    <AppShell>
      <PpodUploadClient />
    </AppShell>
  );
}
