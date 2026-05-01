import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Wayne Board Operations Suite",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wayne Board - FedEx Operations Suite",
    description:
      "Operations reporting prototype for FedEx Ground contractors.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/wayne-logo.png",
    apple: "/wayne-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${geistMono.variable} antialiased bg-slate-50 text-slate-900 min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
