import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import TraineesClient from "./trainees-client";

export const metadata: Metadata = { title: "Trainees" };

export default function TraineesPage() {
  return (
    <AppShell>
      <main className="flex-1 px-8 py-8 max-w-[900px] w-full mx-auto">
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Admin
          </p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
            Trainee Days
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Days recorded when routes are pushed — trainees scheduled and not on time off.
          </p>
        </div>
        <TraineesClient />
      </main>
    </AppShell>
  );
}
