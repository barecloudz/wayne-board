export default async function MgopsLayout({ children }: { children: React.ReactNode }) {
  // Auth is checked per-page, layout just provides the shell
  return (
    <div className="min-h-screen" style={{ background: "#0A0F1E", color: "#F8FAFC" }}>
      {children}
    </div>
  );
}
