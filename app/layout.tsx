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
  metadataBase: new URL("https://wayneboard.netlify.app"),
  title: "742 Logistics Driver Portal",
  description:
    "Driver portal for 742 Logistics. View Ryde scores, gate codes, milestones, route info, and more.",
  openGraph: {
    title: "742 Logistics Driver Portal",
    description:
      "Driver portal for 742 Logistics. View Ryde scores, gate codes, milestones, route info, and more.",
    images: [{ url: "/742-logo.png", width: 1024, height: 1024, alt: "742 Logistics" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "742 Logistics Driver Portal",
    description: "Driver portal for 742 Logistics.",
    images: ["/742-logo.png"],
  },
  icons: { icon: "/742-favicon.png", apple: "/742-logo.png" },
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
