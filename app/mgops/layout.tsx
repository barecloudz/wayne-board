import MgopsShell from "@/components/mgops-shell";

export default function MgopsLayout({ children }: { children: React.ReactNode }) {
  return <MgopsShell>{children}</MgopsShell>;
}
