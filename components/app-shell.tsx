import Sidebar from "./sidebar";
import MobileDrawer from "./mobile-drawer";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <MobileDrawer />
        {children}
      </div>
    </div>
  );
}
