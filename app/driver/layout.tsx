import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "742 Logistics Driver Portal",
  description: "Driver portal for 742 Logistics. View your Ryde scores, milestones, maintenance requests, and gate codes.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "742 App",
  },
  openGraph: {
    title: "742 Logistics Driver Portal",
    description: "Driver portal for 742 Logistics. View your Ryde scores, milestones, maintenance requests, and gate codes.",
    images: [{ url: "/banner.png", width: 1024, height: 1024, alt: "742 Logistics" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "742 Logistics Driver Portal",
    description: "Driver portal for 742 Logistics.",
    images: ["/banner.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
