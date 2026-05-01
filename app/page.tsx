"use client";

import Image from "next/image";
import {
  Truck,
  DollarSign,
  Users,
  Map,
  UserPlus,
  Shield,
  Building2,
} from "lucide-react";

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

function StatDot({ color }: { color: "green" | "yellow" | "red" | "zinc" }) {
  const colors = {
    green: "bg-green-400",
    yellow: "bg-yellow-400",
    red: "bg-red-400",
    zinc: "bg-zinc-500",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[color]} mr-2 flex-shrink-0 mt-1.5`}
    />
  );
}

function SubStat({
  dot,
  text,
}: {
  dot: "green" | "yellow" | "red" | "zinc";
  text: string;
}) {
  return (
    <li className="flex items-start text-sm text-zinc-400">
      <StatDot color={dot} />
      <span>{text}</span>
    </li>
  );
}

function MainCard({
  icon: Icon,
  title,
  metric,
  stats,
}: {
  icon: React.ElementType;
  title: string;
  metric: string;
  stats: { dot: "green" | "yellow" | "red" | "zinc"; text: string }[];
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-4 hover:border-yellow-400/50 transition-colors duration-200 group">
      <div className="flex items-center gap-3">
        <Icon className="text-yellow-400 w-6 h-6 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
          {title}
        </h2>
      </div>
      <p className="text-3xl font-bold text-zinc-100 leading-tight">{metric}</p>
      <ul className="flex flex-col gap-2">
        {stats.map((s, i) => (
          <SubStat key={i} dot={s.dot} text={s.text} />
        ))}
      </ul>
      <button className="mt-auto w-full py-2 px-4 rounded-lg border border-zinc-700 text-zinc-400 text-sm font-medium hover:border-yellow-400 hover:text-yellow-400 transition-colors duration-200">
        View Details
      </button>
    </div>
  );
}

function SecondaryCard({
  icon: Icon,
  title,
  stat,
}: {
  icon: React.ElementType;
  title: string;
  stat: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 hover:border-yellow-400/50 transition-colors duration-200">
      <div className="flex items-center gap-2">
        <Icon className="text-yellow-400 w-5 h-5 flex-shrink-0" />
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          {title}
        </h3>
      </div>
      <p className="text-base font-semibold text-zinc-200">{stat}</p>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/wayne-logo.png"
              alt="Wayne Logo"
              width={40}
              height={40}
              className="object-contain"
              priority
            />
            <div className="flex flex-col">
              <span className="text-lg font-bold text-zinc-100 leading-tight">
                Wayne Board
              </span>
              <span className="text-xs text-zinc-500 leading-tight">
                FedEx Operations Suite
              </span>
            </div>
          </div>
          <span className="bg-yellow-400 text-black text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            Demo
          </span>
        </div>
      </header>

      {/* Hero strip */}
      <div className="bg-zinc-900/50 border-b border-zinc-800/50 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <p className="text-base font-semibold text-zinc-200">
            742 Logistics — Operations Dashboard
          </p>
          <p className="text-xs text-zinc-500">{today}</p>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 px-4 sm:px-6 py-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-6">
          {/* 4 main cards — 2x2 grid on desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MainCard
              icon={Truck}
              title="Fleet & Maintenance"
              metric="12 Vehicles Active"
              stats={[
                { dot: "yellow", text: "3 PMs due this week" },
                { dot: "zinc", text: "Last FedEx report: Nov 1" },
                { dot: "zinc", text: "Next report due: Dec 1" },
              ]}
            />
            <MainCard
              icon={DollarSign}
              title="Payroll & Performance"
              metric="Avg 108 stops/driver/day"
              stats={[
                { dot: "zinc", text: "Weekly payroll: $14,280" },
                { dot: "green", text: "ILS this week: 99.2%" },
                { dot: "zinc", text: "12 drivers on payroll" },
              ]}
            />
            <MainCard
              icon={Users}
              title="Drivers"
              metric="12 Active Drivers"
              stats={[
                { dot: "green", text: "10 top performers (ILS 99%+)" },
                { dot: "yellow", text: "1 in training" },
                { dot: "green", text: "0 call-outs today" },
              ]}
            />
            <MainCard
              icon={Map}
              title="Routes & Coverage"
              metric="12 of 12 Routes Covered"
              stats={[
                { dot: "green", text: "All routes assigned" },
                { dot: "zinc", text: "2 backup drivers available" },
                { dot: "green", text: "On-time dispatch: 100%" },
              ]}
            />
          </div>

          {/* 3 secondary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SecondaryCard
              icon={UserPlus}
              title="Recruiting Pipeline"
              stat="3 candidates in pipeline"
            />
            <SecondaryCard
              icon={Shield}
              title="Safety Meetings"
              stat="Last meeting: 4 days ago"
            />
            <SecondaryCard
              icon={Building2}
              title="FedEx Terminal"
              stat="Next review: Friday"
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto text-center text-xs text-zinc-600">
          Built by Blake Nardoni —{" "}
          <span className="text-zinc-500">Nardoni Digital</span>
        </div>
      </footer>
    </div>
  );
}
