import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The 742 App - Driver Portal",
  description: "Driver portal for 742 Logistics. View your Ryde scores, milestones, maintenance requests, and gate codes.",
  openGraph: {
    title: "The 742 App - Driver Portal",
    description: "Driver portal for 742 Logistics. View your Ryde scores, milestones, maintenance requests, and gate codes.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The 742 App - Driver Portal",
    description: "Driver portal for 742 Logistics.",
  },
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
