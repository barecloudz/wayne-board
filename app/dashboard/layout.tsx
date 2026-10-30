import { LocationProvider } from "@/components/location-context";
import TaskFloatingSheet from "@/components/task-floating-sheet";
import NotificationBar from "@/components/notification-bar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LocationProvider>
      <NotificationBar />
      {children}
      <TaskFloatingSheet />
    </LocationProvider>
  );
}
