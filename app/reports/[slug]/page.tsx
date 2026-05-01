"use client";

import Link from "next/link";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppShell from "@/components/app-shell";
import { notFound } from "next/navigation";
import { use } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type BadgeColor = "green" | "yellow" | "slate" | "blue" | "red";

function Badge({
  color,
  children,
}: {
  color: BadgeColor;
  children: React.ReactNode;
}) {
  const styles: Record<BadgeColor, string> = {
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-100 text-blue-700",
    red: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[color]}`}
    >
      {children}
    </span>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        {label}
      </span>
      <span className="text-2xl font-bold text-slate-900">{value}</span>
    </div>
  );
}

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
        {children}
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="bg-slate-50 text-slate-700 font-medium text-left py-3 px-4 border-b border-slate-200 whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({
  children,
  alt,
}: {
  children: React.ReactNode;
  alt?: boolean;
}) {
  return (
    <td
      className={`py-3 px-4 border-b border-slate-100 text-slate-700 ${alt ? "bg-slate-50/50" : "bg-white"}`}
    >
      {children}
    </td>
  );
}

// ─── Fleet Report ─────────────────────────────────────────────────────────────

function FleetReport() {
  const vehicles = [
    { id: "VH-01", lastPM: "Oct 3, 2025", nextPM: "Nov 3, 2025", mileage: "82,140", status: "On Track" as BadgeColor },
    { id: "VH-02", lastPM: "Oct 10, 2025", nextPM: "Nov 10, 2025", mileage: "91,320", status: "On Track" as BadgeColor },
    { id: "VH-03", lastPM: "Sep 18, 2025", nextPM: "Oct 18, 2025", mileage: "103,500", status: "Overdue" as BadgeColor },
    { id: "VH-04", lastPM: "Oct 22, 2025", nextPM: "Nov 22, 2025", mileage: "74,800", status: "On Track" as BadgeColor },
    { id: "VH-05", lastPM: "Oct 28, 2025", nextPM: "Nov 28, 2025", mileage: "68,410", status: "Due Soon" as BadgeColor },
    { id: "VH-06", lastPM: "Oct 15, 2025", nextPM: "Nov 15, 2025", mileage: "88,720", status: "On Track" as BadgeColor },
    { id: "VH-07", lastPM: "Oct 5, 2025", nextPM: "Nov 5, 2025", mileage: "79,100", status: "Due Soon" as BadgeColor },
    { id: "VH-08", lastPM: "Oct 19, 2025", nextPM: "Nov 19, 2025", mileage: "95,650", status: "On Track" as BadgeColor },
  ];

  const statusColor: Record<string, BadgeColor> = {
    "On Track": "green",
    "Due Soon": "yellow",
    "Overdue": "red",
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pb-6 border-b border-slate-200">
        <StatBlock label="Total Vehicles" value="12" />
        <StatBlock label="PMs This Month" value="4" />
        <StatBlock label="Inspections Passed" value="12 / 12" />
        <StatBlock label="Avg Mileage" value="84,200" />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-slate-900">Vehicle Status</h3>
        <TableWrapper>
          <thead>
            <tr>
              <Th>Vehicle #</Th>
              <Th>Last PM</Th>
              <Th>Next PM Due</Th>
              <Th>Mileage</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v, i) => (
              <tr key={v.id}>
                <Td alt={i % 2 !== 0}>{v.id}</Td>
                <Td alt={i % 2 !== 0}>{v.lastPM}</Td>
                <Td alt={i % 2 !== 0}>{v.nextPM}</Td>
                <Td alt={i % 2 !== 0}>{v.mileage}</Td>
                <Td alt={i % 2 !== 0}>
                  <Badge color={statusColor[v.status]}>{v.status}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      </div>
    </div>
  );
}

// ─── Payroll Report ───────────────────────────────────────────────────────────

function PayrollReport() {
  const drivers = [
    { name: "M. Carter", days: 5, stops: 545, rate: "$210", total: "$1,050" },
    { name: "J. Reyes", days: 5, stops: 530, rate: "$210", total: "$1,050" },
    { name: "T. Williams", days: 4, stops: 420, rate: "$210", total: "$840" },
    { name: "A. Patel", days: 5, stops: 560, rate: "$210", total: "$1,050" },
    { name: "D. Brooks", days: 5, stops: 510, rate: "$210", total: "$1,050" },
    { name: "R. Nguyen", days: 5, stops: 540, rate: "$210", total: "$1,050" },
    { name: "K. Johnson", days: 5, stops: 525, rate: "$210", total: "$1,050" },
    { name: "L. Martinez", days: 5, stops: 555, rate: "$210", total: "$1,050" },
    { name: "B. Thompson", days: 4, stops: 400, rate: "$210", total: "$840" },
    { name: "C. Davis", days: 5, stops: 535, rate: "$210", total: "$1,050" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pb-6 border-b border-slate-200">
        <StatBlock label="Total Weekly Payroll" value="$14,280" />
        <StatBlock label="Drivers Paid" value="12" />
        <StatBlock label="Avg Stops / Day" value="108" />
        <StatBlock label="Period" value="Nov 18–24" />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-slate-900">Driver Payroll Breakdown</h3>
        <TableWrapper>
          <thead>
            <tr>
              <Th>Driver</Th>
              <Th>Days Worked</Th>
              <Th>Total Stops</Th>
              <Th>Daily Rate</Th>
              <Th>Weekly Total</Th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d, i) => (
              <tr key={d.name}>
                <Td alt={i % 2 !== 0}>{d.name}</Td>
                <Td alt={i % 2 !== 0}>{d.days}</Td>
                <Td alt={i % 2 !== 0}>{d.stops}</Td>
                <Td alt={i % 2 !== 0}>{d.rate}</Td>
                <Td alt={i % 2 !== 0}>{d.total}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      </div>
    </div>
  );
}

// ─── Drivers Report ───────────────────────────────────────────────────────────

function DriversReport() {
  const drivers = [
    { name: "M. Carter", ils: "99.6%", safety: "100%", attendance: "100%", customer: "99%", status: "Top Performer" },
    { name: "J. Reyes", ils: "99.4%", safety: "100%", attendance: "100%", customer: "98%", status: "Top Performer" },
    { name: "T. Williams", ils: "98.1%", safety: "96%", attendance: "80%", customer: "95%", status: "Coaching" },
    { name: "A. Patel", ils: "99.8%", safety: "100%", attendance: "100%", customer: "100%", status: "Top Performer" },
    { name: "D. Brooks", ils: "99.2%", safety: "100%", attendance: "100%", customer: "97%", status: "Top Performer" },
    { name: "R. Nguyen", ils: "99.5%", safety: "100%", attendance: "100%", customer: "99%", status: "Top Performer" },
    { name: "K. Johnson", ils: "99.0%", safety: "98%", attendance: "100%", customer: "96%", status: "Standard" },
    { name: "L. Martinez", ils: "99.7%", safety: "100%", attendance: "100%", customer: "100%", status: "Top Performer" },
    { name: "B. Thompson", ils: "97.8%", safety: "94%", attendance: "80%", customer: "92%", status: "In Training" },
    { name: "C. Davis", ils: "99.3%", safety: "100%", attendance: "100%", customer: "98%", status: "Top Performer" },
  ];

  const statusColor: Record<string, BadgeColor> = {
    "Top Performer": "green",
    "Standard": "slate",
    "Coaching": "yellow",
    "In Training": "blue",
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pb-6 border-b border-slate-200">
        <StatBlock label="Active Drivers" value="12" />
        <StatBlock label="Avg ILS" value="99.2%" />
        <StatBlock label="Top Performers" value="10" />
        <StatBlock label="In Training" value="1" />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-slate-900">Driver Performance</h3>
        <TableWrapper>
          <thead>
            <tr>
              <Th>Driver</Th>
              <Th>ILS %</Th>
              <Th>Safety Score</Th>
              <Th>Attendance</Th>
              <Th>Customer Score</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d, i) => (
              <tr key={d.name}>
                <Td alt={i % 2 !== 0}>{d.name}</Td>
                <Td alt={i % 2 !== 0}>{d.ils}</Td>
                <Td alt={i % 2 !== 0}>{d.safety}</Td>
                <Td alt={i % 2 !== 0}>{d.attendance}</Td>
                <Td alt={i % 2 !== 0}>{d.customer}</Td>
                <Td alt={i % 2 !== 0}>
                  <Badge color={statusColor[d.status]}>{d.status}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      </div>
    </div>
  );
}

// ─── Routes Report ────────────────────────────────────────────────────────────

function RoutesReport() {
  const routes = [
    { route: "RT-01", driver: "M. Carter", stops: 112, status: "Active", coverage: "Primary" },
    { route: "RT-02", driver: "J. Reyes", stops: 108, status: "Active", coverage: "Primary" },
    { route: "RT-03", driver: "A. Patel", stops: 115, status: "Completed", coverage: "Primary" },
    { route: "RT-04", driver: "D. Brooks", stops: 104, status: "Active", coverage: "Primary" },
    { route: "RT-05", driver: "R. Nguyen", stops: 110, status: "Completed", coverage: "Primary" },
    { route: "RT-06", driver: "K. Johnson", stops: 106, status: "Active", coverage: "Primary" },
    { route: "RT-07", driver: "L. Martinez", stops: 118, status: "Active", coverage: "Primary" },
    { route: "RT-08", driver: "C. Davis", stops: 109, status: "Completed", coverage: "Primary" },
    { route: "RT-09", driver: "B. Thompson", stops: 98, status: "Active", coverage: "Backup Assigned" },
    { route: "RT-10", driver: "M. Carter (backup)", stops: 102, status: "Active", coverage: "Backup Assigned" },
    { route: "RT-11", driver: "T. Williams", stops: 105, status: "Active", coverage: "Primary" },
    { route: "RT-12", driver: "J. Reyes (backup)", stops: 101, status: "Active", coverage: "Primary" },
  ];

  const statusColor: Record<string, BadgeColor> = {
    Active: "blue",
    Completed: "green",
    "Backup Assigned": "yellow",
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pb-6 border-b border-slate-200">
        <StatBlock label="Total Routes" value="12" />
        <StatBlock label="Coverage Today" value="100%" />
        <StatBlock label="Avg Stops" value="108" />
        <StatBlock label="On-Time" value="100%" />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-slate-900">Route Assignments</h3>
        <TableWrapper>
          <thead>
            <tr>
              <Th>Route #</Th>
              <Th>Assigned Driver</Th>
              <Th>Stops Planned</Th>
              <Th>Status</Th>
              <Th>Coverage Type</Th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r, i) => (
              <tr key={r.route}>
                <Td alt={i % 2 !== 0}>{r.route}</Td>
                <Td alt={i % 2 !== 0}>{r.driver}</Td>
                <Td alt={i % 2 !== 0}>{r.stops}</Td>
                <Td alt={i % 2 !== 0}>
                  <Badge color={statusColor[r.status]}>{r.status}</Badge>
                </Td>
                <Td alt={i % 2 !== 0}>{r.coverage}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      </div>
    </div>
  );
}

// ─── Report config ────────────────────────────────────────────────────────────

const reportConfig: Record<
  string,
  { title: string; period: string; component: React.ReactNode }
> = {
  fleet: {
    title: "Fleet & Maintenance Report",
    period: "November 2025",
    component: <FleetReport />,
  },
  payroll: {
    title: "Payroll Report",
    period: "November 18–24, 2025",
    component: <PayrollReport />,
  },
  drivers: {
    title: "Driver Performance Report",
    period: "November 2025",
    component: <DriversReport />,
  },
  routes: {
    title: "Route Coverage Report",
    period: "November 25, 2025",
    component: <RoutesReport />,
  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const report = reportConfig[slug];

  if (!report) notFound();

  function handleExport() {
    alert("PDF export coming soon.");
  }

  function handlePrint() {
    alert("PDF export coming soon.");
  }

  return (
    <AppShell>
      <main className="flex-1 px-6 py-8 max-w-5xl w-full mx-auto flex flex-col gap-6">
        {/* Back link */}
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Reports
        </Link>

        {/* Report header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-1.5">
              742 Logistics · FedEx Ground
            </p>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{report.title}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{report.period}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="flex items-center gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </Button>
            <Button
              size="sm"
              onClick={handleExport}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <FileDown className="w-3.5 h-3.5" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Report content */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8
          shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.06)]">
          {report.component}
        </div>
      </main>

      <footer className="border-t border-slate-200 py-5 px-6">
        <p className="text-center text-xs text-slate-400">
          Wayne Board · Operations reporting prototype · Built by Blake Nardoni
        </p>
      </footer>
    </AppShell>
  );
}
