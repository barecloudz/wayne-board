import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import AnchorEditorClient from "./anchor-editor-client";

export const metadata: Metadata = { title: "Anchor Editor" };

export const dynamic = "force-dynamic";

export default function AnchorEditorPage() {
  return (
    <AppShell>
      <AnchorEditorClient />
    </AppShell>
  );
}
