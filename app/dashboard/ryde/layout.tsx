import type { Metadata } from "next";
export const metadata: Metadata = { title: "Ryde Scores" };
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
