"use client";

import { useFleetTelemetry } from "@/hooks/use-fleet-telemetry";
import { Truck, Users, ClipboardCheck, AlertTriangle, Gauge, TrendingUp, type LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  truck: Truck,
  users: Users,
  clipboard: ClipboardCheck,
  alert: AlertTriangle,
  gauge: Gauge,
  trending: TrendingUp,
};

interface FleetKpiCardProps {
  label: string;
  value: string | number;
  icon: string;
  trend?: { direction: "up" | "down" | "flat"; label: string };
  accent?: "emerald" | "amber" | "red" | "blue" | "indigo" | "slate";
  dark?: boolean;
  onClick?: () => void;
}

const ACCENT_MAP = {
  emerald: { text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/25" },
  amber:   { text: "text-amber-400",   bg: "bg-amber-500/15",   border: "border-amber-500/25"   },
  red:     { text: "text-red-400",     bg: "bg-red-500/15",     border: "border-red-500/25"     },
  blue:    { text: "text-blue-400",    bg: "bg-blue-500/15",    border: "border-blue-500/25"    },
  indigo:  { text: "text-indigo-400",  bg: "bg-indigo-500/15",  border: "border-indigo-500/25"  },
  slate:   { text: "text-slate-300",   bg: "bg-slate-500/15",   border: "border-slate-500/25"   },
};

export default function FleetKpiCard({
  label,
  value,
  icon,
  trend,
  accent = "slate",
  dark = true,
  onClick,
}: FleetKpiCardProps) {
  const Icon = ICON_MAP[icon] ?? Gauge;
  const { ref, cardStyle, glowStyle, handlers } = useFleetTelemetry<HTMLDivElement>({
    maxTilt: 6,
    perspective: 900,
    glowOpacity: dark ? 0.18 : 0.1,
    easing: 0.09,
  });

  const a = ACCENT_MAP[accent];
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      // @ts-expect-error — polymorphic ref on div/button
      ref={ref}
      style={cardStyle}
      {...handlers}
      onClick={onClick}
      className={[
        "group overflow-hidden rounded-2xl border transition-colors duration-200",
        dark
          ? "bg-slate-800/70 border-white/[0.07] hover:border-white/[0.14] backdrop-blur-sm"
          : "bg-white border-slate-200/80 hover:border-slate-300",
        onClick ? "cursor-pointer active:scale-[0.97] w-full text-left" : "",
      ].join(" ")}
    >
      {/* Cursor spotlight */}
      <div style={glowStyle} className="absolute inset-0 pointer-events-none z-10 rounded-2xl" />

      <div className="relative z-20 px-5 py-4 flex flex-col gap-3">
        {/* Icon + label */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {label}
          </p>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${a.bg} border ${a.border}`}>
            <Icon className={`w-4 h-4 ${a.text}`} />
          </div>
        </div>

        {/* Value */}
        <span className={`text-[32px] font-black leading-none tracking-tight tabular-nums ${dark ? "text-white" : "text-slate-900"}`}>
          {value}
        </span>

        {/* Trend */}
        {trend && (
          <p className={`text-[11px] font-semibold ${
            trend.direction === "up"   ? "text-emerald-400" :
            trend.direction === "down" ? "text-red-400"     :
            "text-slate-500"
          }`}>
            {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} {trend.label}
          </p>
        )}
      </div>
    </Tag>
  );
}
