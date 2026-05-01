import Link from "next/link";
import { Truck, DollarSign, Users, Map } from "lucide-react";
import Header from "@/components/header";
import Footer from "@/components/footer";

const reports = [
  {
    slug: "fleet",
    title: "Fleet & Maintenance Report",
    description:
      "Monthly preventative maintenance status, vehicle inspection logs, and FedEx fleet compliance reporting.",
    icon: Truck,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    lastGenerated: "Nov 1, 2025",
  },
  {
    slug: "payroll",
    title: "Payroll Report",
    description:
      "Weekly driver payroll, stops-per-day metrics, and labor cost tracking against route revenue.",
    icon: DollarSign,
    iconBg: "bg-yellow-50",
    iconColor: "text-yellow-700",
    lastGenerated: "Nov 24, 2025",
  },
  {
    slug: "drivers",
    title: "Driver Performance Report",
    description:
      "ILS scores, safety records, attendance, and customer service metrics for terminal performance reviews.",
    icon: Users,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    lastGenerated: "Nov 24, 2025",
  },
  {
    slug: "routes",
    title: "Route Coverage Report",
    description:
      "Daily route assignments, coverage status, and contingency planning for uninterrupted service.",
    icon: Map,
    iconBg: "bg-yellow-50",
    iconColor: "text-yellow-700",
    lastGenerated: "Nov 25, 2025",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-6 py-10">
          {/* Page intro */}
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Operations Reporting
            </h1>
            <p className="text-base text-slate-600 leading-relaxed max-w-xl">
              Generate clean, consistent reports for fleet, payroll, drivers, and
              FedEx terminal reviews.
            </p>
          </div>

          {/* Report cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {reports.map((report) => {
              const Icon = report.icon;
              return (
                <Link
                  key={report.slug}
                  href={`/reports/${report.slug}`}
                  className="group bg-white border border-slate-200 rounded-xl p-8 flex flex-col gap-5 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                >
                  {/* Icon */}
                  <div
                    className={`w-12 h-12 rounded-lg ${report.iconBg} flex items-center justify-center flex-shrink-0`}
                  >
                    <Icon className={`w-6 h-6 ${report.iconColor}`} />
                  </div>

                  {/* Text content */}
                  <div className="flex-1 flex flex-col gap-1.5">
                    <h2 className="text-xl font-semibold text-slate-900">
                      {report.title}
                    </h2>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {report.description}
                    </p>
                  </div>

                  {/* Footer row */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-400">
                      Last generated: {report.lastGenerated}
                    </span>
                    <span className="text-sm text-blue-600 font-medium group-hover:text-blue-700 transition-colors">
                      Open report →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Prototype notice */}
          <p className="mt-10 text-center text-xs text-slate-400">
            This is a working prototype. Report data shown is illustrative.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
