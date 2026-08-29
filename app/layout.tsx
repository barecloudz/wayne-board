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
  metadataBase: new URL("https://mygroundops.com"),
  title: "MyGroundOps — FedEx Ground Contractor Platform",
  description:
    "Fleet management, driver scores, route ops, and compliance tools built for FedEx Ground ISPs.",
  openGraph: {
    title: "MyGroundOps",
    description: "Fleet management, driver scores, route ops, and compliance tools built for FedEx Ground ISPs.",
    images: [{ url: "/logo-full.png", width: 1500, height: 500, alt: "MyGroundOps" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MyGroundOps",
    description: "Fleet management, driver scores, route ops, and compliance tools built for FedEx Ground ISPs.",
    images: ["/logo-full.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
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
