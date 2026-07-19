import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import UpdateBanner from "@/components/update-banner";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://742logistics.com"),
  title: "742 Logistics Driver Portal",
  description:
    "Driver portal for 742 Logistics. View Ryde scores, gate codes, milestones, route info, and more.",
  openGraph: {
    title: "742 Logistics Driver Portal",
    description:
      "Driver portal for 742 Logistics. View Ryde scores, gate codes, milestones, route info, and more.",
    images: [{ url: "/banner.png", width: 1200, height: 630, alt: "742 Logistics" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "742 Logistics Driver Portal",
    description: "Driver portal for 742 Logistics.",
    images: ["/banner.png"],
  },
  icons: { icon: "/742-favicon.png", apple: "/banner.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} font-sans antialiased bg-[#F7F8FA] text-slate-900 min-h-screen`}>
        {children}
        <UpdateBanner />
      </body>
    </html>
  );
}
