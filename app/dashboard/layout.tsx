import { LocationProvider } from "@/components/location-context";
import TaskFloatingSheet from "@/components/task-floating-sheet";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LocationProvider>
      {children}
      <TaskFloatingSheet />
    </LocationProvider>
  );
}
