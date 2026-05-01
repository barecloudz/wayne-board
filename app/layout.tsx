import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
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
    "Modern operations management dashboard for FedEx Ground contractors. Fleet, payroll, drivers, and routes — all in one place.",
  openGraph: {
    title: "Wayne Board - FedEx Operations Suite",
    description:
      "Modern operations management dashboard for FedEx Ground contractors. Fleet, payroll, drivers, and routes — all in one place.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Wayne Board Operations Dashboard",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wayne Board - FedEx Operations Suite",
    description:
      "Modern operations management dashboard for FedEx Ground contractors.",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-100 min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
