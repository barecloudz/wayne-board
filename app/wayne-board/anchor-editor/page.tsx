import AppShell from "@/components/app-shell";
import AnchorEditorClient from "./anchor-editor-client";

export const dynamic = "force-dynamic";

export default function AnchorEditorPage() {
  return (
    <AppShell>
      <AnchorEditorClient />
    </AppShell>
  );
}
