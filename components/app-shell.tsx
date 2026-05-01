import Sidebar from "./sidebar";
import MobileHeader from "./mobile-header";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader />
        {children}
      </div>
    </div>
  );
}
