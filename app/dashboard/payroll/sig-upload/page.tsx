export const dynamic = "force-dynamic";
import SigUploadClient from "./sig-upload-client";
import AppShell from "@/components/app-shell";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sig Compliance Upload" };

export default function SigUploadPage() {
  return (
    <AppShell>
      <SigUploadClient />
    </AppShell>
  );
}
