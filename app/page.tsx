import Link from "next/link";
import { Truck, DollarSign, Users, Map, ArrowRight } from "lucide-react";
import AppShell from "@/components/app-shell";

type Chip = { label: string; variant: "neutral" | "warning" | "success" | "info" };

const reports = [
  {
    slug: "fleet",
    title: "Fleet & Maintenance",
    subtitle: "Monthly vehicle PM status and FedEx compliance reporting.",
    icon: Truck,
    gradient: "from-blue-500 to-blue-700",
    accentLine: "from-blue-400 to-blue-600",
    chips: [
      { label: "12 Vehicles", variant: "neutral" },
      { label: "4 PMs Due", variant: "warning" },
      { label: "12/12 Passed", variant: "success" },
    ] as Chip[],
    lastGenerated: "Nov 1, 2025",
  },
  {
    slug: "payroll",
    title: "Payroll",
    subtitle: "Weekly driver payroll, stops-per-day, and labor cost breakdown.",
    icon: DollarSign,
    gradient: "from-amber-400 to-amber-600",
    accentLine: "from-amber-300 to-amber-500",
    chips: [
      { label: "$14,280 Payroll", variant: "neutral" },
      { label: "108 Avg Stops", variant: "info" },
      { label: "99.2% ILS", variant: "success" },
    ] as Chip[],
    lastGenerated: "Nov 24, 2025",
  },
  {
    slug: "drivers",
    title: "Driver Performance",
    subtitle: "ILS scores, safety, attendance, and terminal review metrics.",
    icon: Users,
    gradient: "from-blue-500 to-blue-700",
    accentLine: "from-blue-400 to-blue-600",
    chips: [
      { label: "12 Active", variant: "neutral" },
      { label: "10 Top Performers", variant: "success" },
      { label: "1 In Training", variant: "info" },
    ] as Chip[],
    lastGenerated: "Nov 24, 2025",
  },
  {
    slug: "routes",
    title: "Route Coverage",
    subtitle: "Daily route assignments, coverage status, and contingency planning.",
    icon: Map,
    gradient: "from-amber-400 to-amber-600",
    accentLine: "from-amber-300 to-amber-500",
    chips: [
      { label: "12/12 Covered", variant: "success" },
      { label: "2 Backup Drivers", variant: "neutral" },
      { label: "100% On-Time", variant: "success" },
    ] as Chip[],
    lastGenerated: "Nov 25, 2025",
  },
];

const chipStyles: Record<Chip["variant"], string> = {
  neutral: "bg-slate-50 border-slate-200 text-slate-600",
  warning: "bg-amber-50 border-amber-200 text-amber-700",
  success: "bg-emerald-50 border-emerald-200 text-emerald-700",
  info: "bg-blue-50 border-blue-200 text-blue-700",
};

export default function Home() {
  return (
    <AppShell>
      <main className="flex-1 px-6 py-10 max-w-5xl w-full mx-auto">
        {/* Page intro */}
        <div className="mb-10">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">
            742 Logistics · FedEx Ground
          </p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">
            Operations Reporting
          </h1>
          <p className="text-base text-slate-500 leading-relaxed max-w-lg">
            Generate clean, audit-ready reports for fleet maintenance, payroll,
            driver performance, and route coverage.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {reports.map((r) => {
            const Icon = r.icon;
            return (
              <Link
                key={r.slug}
                href={`/reports/${r.slug}`}
                className="group relative bg-white rounded-2xl border border-slate-200/80 p-7 flex flex-col gap-6 cursor-pointer overflow-hidden
                  shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.06)]
                  hover:shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)]
                  hover:-translate-y-1
                  transition-all duration-300"
              >
                {/* Top accent line */}
                <div
                  className={`absolute top-0 inset-x-0 h-[2.5px] bg-gradient-to-r ${r.accentLine} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
                />

                {/* Icon + title */}
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${r.gradient} flex items-center justify-center shadow-sm flex-shrink-0`}
                  >
                    <Icon className="w-5 h-5 text-white" strokeWidth={2} />
                  </div>
                  <div className="pt-0.5">
                    <h2 className="text-lg font-semibold text-slate-900 leading-snug">
                      {r.title}
                    </h2>
                    <p className="text-sm text-slate-500 leading-relaxed mt-1">
                      {r.subtitle}
                    </p>
                  </div>
                </div>

                {/* Stat chips */}
                <div className="flex flex-wrap gap-2">
                  {r.chips.map((chip) => (
                    <span
                      key={chip.label}
                      className={`border text-xs font-medium px-3 py-1.5 rounded-full ${chipStyles[chip.variant]}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                  <span className="text-xs text-slate-400">
                    Last generated: {r.lastGenerated}
                  </span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-blue-600 group-hover:text-blue-700 group-hover:gap-1.5 transition-all duration-150">
                    View report
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Prototype notice */}
        <p className="mt-12 text-center text-[11px] text-slate-400">
          This is a working prototype. Report data shown is illustrative.
        </p>
      </main>

      <footer className="border-t border-slate-200 py-5 px-6">
        <p className="text-center text-xs text-slate-400">
          Wayne Board · Operations reporting prototype · Built by Blake Nardoni
        </p>
      </footer>
    </AppShell>
  );
}
