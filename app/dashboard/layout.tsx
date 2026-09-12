import { LocationProvider } from "@/components/location-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <LocationProvider>{children}</LocationProvider>;
}
