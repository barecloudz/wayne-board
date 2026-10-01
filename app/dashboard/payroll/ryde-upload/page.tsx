export const dynamic = "force-dynamic";

import AppShell from "@/components/app-shell";
import RydeUploadClient from "./ryde-upload-client";

export default function RydeUploadPage() {
  return (
    <AppShell>
      <RydeUploadClient />
    </AppShell>
  );
}
