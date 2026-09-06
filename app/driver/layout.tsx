import type { Metadata, Viewport } from "next";
import PwaInstallPrompt from "@/components/pwa-install-prompt";

export const metadata: Metadata = {
  title: "MyGroundOps Driver Portal",
  description: "Driver portal for MyGroundOps. View your Ryde scores, milestones, maintenance requests, and gate codes.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MyGroundOps",
  },
  openGraph: {
    title: "MyGroundOps Driver Portal",
    description: "Driver portal for MyGroundOps. View your Ryde scores, milestones, maintenance requests, and gate codes.",
    images: [{ url: "/logo-full.png", width: 960, height: 540, alt: "MyGroundOps" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MyGroundOps Driver Portal",
    description: "Driver portal for MyGroundOps.",
    images: ["/logo-full.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PwaInstallPrompt />
    </>
  );
}
