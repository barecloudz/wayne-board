export const dynamic = "force-dynamic";
import AppShell from "@/components/app-shell";
import UploadClient from "./upload-client";

export default function UploadPage() {
  return (
    <AppShell>
      <UploadClient />
    </AppShell>
  );
}
