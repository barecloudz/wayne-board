import type { Metadata } from "next";
import MgopsShell from "@/components/mgops-shell";

export const metadata: Metadata = { title: "Super Admin" };

export default function MgopsLayout({ children }: { children: React.ReactNode }) {
  return <MgopsShell>{children}</MgopsShell>;
}
