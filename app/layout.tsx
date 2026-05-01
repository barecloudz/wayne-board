import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://wayneboard.netlify.app"),
  title: "Wayne Board - FedEx Operations Suite",
  description:
    "Operations reporting prototype for FedEx Ground contractors. Fleet maintenance, payroll, driver performance, and route coverage in one clean place.",
  openGraph: {
    title: "Wayne Board - FedEx Operations Suite",
    description:
      "Operations reporting prototype for FedEx Ground contractors. Fleet maintenance, payroll, driver performance, and route coverage in one clean place.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Wayne Board" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wayne Board - FedEx Operations Suite",
    description: "Operations reporting prototype for FedEx Ground contractors.",
    images: ["/og-image.png"],
  },
  icons: { icon: "/wayne-logo.png", apple: "/wayne-logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} font-sans antialiased bg-[#F7F8FA] text-slate-900 min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
