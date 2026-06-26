import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { vehicles, drivers } from "@/lib/schema";
import {
  renderToBuffer, Document, Page, View, Text, StyleSheet, Font,
} from "@react-pdf/renderer";

export const dynamic = "force-dynamic";

Font.registerHyphenationCallback((w) => [w]);

// ── Palette (liquid-glass approximation) ─────────────────────────────────────
const G = {
  pageBg:     "#8faabf",
  glassSheen: "#f2f7fd",
  glassEdgeB: "#ffffff",
  glassEdgeD: "#7a97b2",
  ink:        "#0d1c2e",
  inkSub:     "#2c4a66",
  inkMuted:   "#6a8eaa",
  accentBlue: "#1a6fe8",
  accentGlow: "#c8deff",
  overdue:    "#c8102e",
  warn:       "#b45309",
  ok:         "#1a5e35",
  rowBase:    "#e5eff9",
  rowAlt:     "#d0e2f2",
  headFill:   "#0d1c2e",
  headText:   "#7ab4e8",
};

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8.5,
    color: G.ink,
    backgroundColor: G.pageBg,
    paddingBottom: 20,
  },

  // ── Masthead ─────────────────────────────────────────────────────────────
  masthead: {
    backgroundColor: G.glassSheen,
    borderBottom: `1.5pt solid ${G.glassEdgeD}`,
    borderTop:    `1.5pt solid ${G.glassEdgeB}`,
    paddingTop: 18, paddingBottom: 15, paddingHorizontal: 28,
    flexDirection: "row", alignItems: "flex-end",
  },
  mastheadLeft:  { flex: 1 },
  eyebrow: {
    fontSize: 6.5, fontFamily: "Helvetica-Bold",
    color: G.accentBlue, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 5,
  },
  pageTitle: {
    fontSize: 34, fontFamily: "Helvetica-Bold",
    color: G.ink, letterSpacing: -2, lineHeight: 1,
  },
  pageTitleMuted: {
    fontSize: 34, fontFamily: "Helvetica-Bold",
    color: G.inkMuted, letterSpacing: -2, lineHeight: 1,
  },
  mastheadDate: { fontSize: 7.5, color: G.inkSub, marginTop: 7 },
  statBlock: { alignItems: "flex-end", marginLeft: 22 },
  statNum:   { fontSize: 20, fontFamily: "Helvetica-Bold", color: G.ink, textAlign: "right" },
  statLabel: {
    fontSize: 6.5, color: G.inkMuted, textAlign: "right",
    letterSpacing: 0.5, textTransform: "uppercase", marginTop: 1,
  },
  divider: { width: 0.75, backgroundColor: G.glassEdgeD, alignSelf: "stretch", marginHorizontal: 18 },

  // ── Alert card ────────────────────────────────────────────────────────────
  alertCard: {
    marginHorizontal: 28, marginTop: 12,
    backgroundColor: "#fce8eb",
    borderTop: `0.75pt solid #f9bac4`, borderBottom: `0.75pt solid #d47a87`,
    borderLeft: `2.5pt solid ${G.overdue}`, borderRight: `0.75pt solid #f9bac4`,
    padding: "7pt 12pt",
  },
  alertTitle: {
    fontSize: 7, fontFamily: "Helvetica-Bold", color: G.overdue,
    letterSpacing: 1, textTransform: "uppercase", marginBottom: 3,
  },
  alertBody: { fontSize: 7.5, color: "#7f1d1d", lineHeight: 1.7 },

  // ── Section ───────────────────────────────────────────────────────────────
  section: { marginTop: 14, paddingHorizontal: 28 },
  sectionHead: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  pill: {
    backgroundColor: G.accentGlow,
    borderTop: `0.5pt solid ${G.glassEdgeB}`, borderLeft: `0.5pt solid ${G.glassEdgeB}`,
    borderBottom: `0.5pt solid ${G.glassEdgeD}`, borderRight: `0.5pt solid ${G.glassEdgeD}`,
    paddingVertical: 2, paddingHorizontal: 8,
  },
  pillText: {
    fontSize: 6.5, fontFamily: "Helvetica-Bold",
    color: G.accentBlue, letterSpacing: 1, textTransform: "uppercase",
  },
  sectionCount: { fontSize: 7.5, color: G.inkMuted, marginLeft: 8 },
  sectionRule:  { flex: 1, height: 0.5, backgroundColor: G.glassEdgeD, marginLeft: 8 },

  // ── Table ─────────────────────────────────────────────────────────────────
  table: {
    width: "100%",
    borderTop: `0.75pt solid ${G.glassEdgeB}`, borderLeft: `0.75pt solid ${G.glassEdgeB}`,
    borderBottom: `0.75pt solid ${G.glassEdgeD}`, borderRight: `0.75pt solid ${G.glassEdgeD}`,
  },
  thead:   { flexDirection: "row", backgroundColor: G.headFill },
  th: {
    fontSize: 6.5, fontFamily: "Helvetica-Bold", color: G.headText,
    letterSpacing: 0.8, textTransform: "uppercase", padding: "5pt 5pt",
  },
  trow:    { flexDirection: "row", backgroundColor: G.rowBase, borderTop: `0.5pt solid ${G.glassEdgeD}` },
  trowAlt: { flexDirection: "row", backgroundColor: G.rowAlt,  borderTop: `0.5pt solid ${G.glassEdgeD}` },

  td:       { fontSize: 8.5, color: G.ink,      padding: "5pt 5pt" },
  tdBold:   { fontSize: 9,   fontFamily: "Helvetica-Bold", color: G.ink, padding: "5pt 5pt" },
  tdMut:    { fontSize: 8,   color: G.inkMuted,  padding: "5pt 5pt", fontStyle: "italic" },

  // Compliance cell — stacked lines, no padding on outer (we add per-line)
  compCell: { padding: "4pt 5pt", flexDirection: "column", gap: 1 },
  compLine: { flexDirection: "row", alignItems: "center" },
  compLabel:   { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: G.inkMuted,  width: 32, letterSpacing: 0.3 },
  compDate:    { fontSize: 8,   color: G.ink },
  compDateRed: { fontSize: 8,   color: G.overdue, fontFamily: "Helvetica-Bold" },
  compDateAmb: { fontSize: 8,   color: G.warn,    fontFamily: "Helvetica-Bold" },
  compDateMut: { fontSize: 8,   color: G.inkMuted },

  // Status pill in last column
  statusOk:  { fontSize: 7, color: G.ok,     fontFamily: "Helvetica-Bold", padding: "5pt 5pt" },
  statusWarn:{ fontSize: 7, color: G.warn,   fontFamily: "Helvetica-Bold", padding: "5pt 5pt" },
  statusBad: { fontSize: 7, color: G.overdue,fontFamily: "Helvetica-Bold", padding: "5pt 5pt" },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    flexDirection: "row", gap: 12, marginTop: 14,
    paddingTop: 7, paddingHorizontal: 28,
    borderTop: `0.5pt solid ${G.glassEdgeD}`,
  },
  footerText: { fontSize: 6.5, color: G.inkSub },

  // ── Columns — sum = 100% ─────────────────────────────────────────────────
  // Unit # | Vehicle | Own | Driver | Compliance (stacked) | Status
  cUnit:   { width: "9%" },
  cVeh:    { width: "23%" },
  cOwn:    { width: "8%" },
  cDriver: { width: "22%" },
  cComp:   { width: "28%" },   // stacked: Reg / Fed Insp / MMR
  cStatus: { width: "10%" },

  dimmed: { opacity: 0.5 },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d: string | null) {
  if (!d) return null;
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

type VehicleRow = {
  id: number; unitNumber: string; make: string; model: string; year: number;
  type: string; ownership: string; active: boolean;
  mmrDue: string | null; federalInspectionDue: string | null; registrationExpiry: string | null;
};
type DriverRow = { id: number; name: string; assignedVehicleId: number | null };

function statusOf(v: VehicleRow, today: string) {
  const soonDate = new Date(today);
  soonDate.setDate(soonDate.getDate() + 30);
  const soon = soonDate.toISOString().slice(0, 10);

  const overdue: string[] = [];
  if (v.registrationExpiry   && v.registrationExpiry   < today) overdue.push("Reg. Expired");
  if (v.federalInspectionDue && v.federalInspectionDue < today) overdue.push("Fed. Insp. Overdue");
  if (v.mmrDue               && v.mmrDue               < today) overdue.push("MMR Overdue");

  const warning: string[] = [];
  if (v.registrationExpiry   && v.registrationExpiry   >= today && v.registrationExpiry   <= soon) warning.push("Reg. Expiring");
  if (v.federalInspectionDue && v.federalInspectionDue >= today && v.federalInspectionDue <= soon) warning.push("Fed. Due Soon");
  if (v.mmrDue               && v.mmrDue               >= today && v.mmrDue               <= soon) warning.push("MMR Due Soon");

  return { overdue, warning };
}

function dateStyle(raw: string | null, today: string, soon: string) {
  if (!raw) return S.compDateMut;
  if (raw < today) return S.compDateRed;
  if (raw <= soon) return S.compDateAmb;
  return S.compDate;
}

// ── Table sub-components ──────────────────────────────────────────────────────
function THead() {
  return (
    <View style={S.thead}>
      <Text style={[S.th, S.cUnit]}>Unit #</Text>
      <Text style={[S.th, S.cVeh]}>Vehicle</Text>
      <Text style={[S.th, S.cOwn]}>Ownership</Text>
      <Text style={[S.th, S.cDriver]}>Assigned Driver</Text>
      <Text style={[S.th, S.cComp]}>Compliance Dates</Text>
      <Text style={[S.th, S.cStatus]}>Status</Text>
    </View>
  );
}

function TRow({ v, i, driverMap, today }: {
  v: VehicleRow; i: number; driverMap: Map<number, DriverRow>; today: string;
}) {
  const driver = driverMap.get(v.id);
  const { overdue, warning } = statusOf(v, today);

  const soonDate = new Date(today);
  soonDate.setDate(soonDate.getDate() + 30);
  const soon = soonDate.toISOString().slice(0, 10);

  const row = i % 2 === 0 ? S.trow : S.trowAlt;

  // Determine overall status for the last column
  const statusStyle = overdue.length > 0 ? S.statusBad : warning.length > 0 ? S.statusWarn : S.statusOk;
  const statusText  = overdue.length > 0
    ? `✗ ${overdue.length} Issue${overdue.length > 1 ? "s" : ""}`
    : warning.length > 0
      ? `⚠ ${warning.length} Due Soon`
      : "✓ Clear";

  return (
    <View style={row}>
      <Text style={[S.tdBold, S.cUnit]}>{v.unitNumber}</Text>
      <Text style={[S.td, S.cVeh]}>{v.year} {v.make} {v.model}</Text>
      <Text style={[S.td, S.cOwn]}>{v.ownership === "rental" ? "Rental" : "Owned"}</Text>
      <Text style={[driver ? S.td : S.tdMut, S.cDriver]}>{driver?.name ?? "Unassigned"}</Text>

      {/* Stacked compliance cell */}
      <View style={[S.cComp, S.compCell]}>
        {/* Line 1: Registration */}
        <View style={S.compLine}>
          <Text style={S.compLabel}>Reg.</Text>
          <Text style={dateStyle(v.registrationExpiry, today, soon)}>
            {fmt(v.registrationExpiry) ?? "—"}
          </Text>
        </View>
        {/* Line 2: Federal Inspection */}
        <View style={S.compLine}>
          <Text style={S.compLabel}>Fed. Insp.</Text>
          <Text style={dateStyle(v.federalInspectionDue, today, soon)}>
            {fmt(v.federalInspectionDue) ?? "—"}
          </Text>
        </View>
        {/* Line 3: MMR */}
        <View style={S.compLine}>
          <Text style={S.compLabel}>MMR</Text>
          <Text style={dateStyle(v.mmrDue, today, soon)}>
            {fmt(v.mmrDue) ?? "—"}
          </Text>
        </View>
      </View>

      <Text style={[statusStyle, S.cStatus]}>{statusText}</Text>
    </View>
  );
}

function Section({ label, rows, driverMap, today, dimmed }: {
  label: string; rows: VehicleRow[]; driverMap: Map<number, DriverRow>; today: string; dimmed?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={[S.section, dimmed ? S.dimmed : {}]}>
      <View style={S.sectionHead}>
        <View style={S.pill}><Text style={S.pillText}>{label}</Text></View>
        <Text style={S.sectionCount}>{rows.length} vehicle{rows.length !== 1 ? "s" : ""}</Text>
        <View style={S.sectionRule} />
      </View>
      <View style={S.table}>
        <THead />
        {rows.map((v, i) => <TRow key={v.id} v={v} i={i} driverMap={driverMap} today={today} />)}
      </View>
    </View>
  );
}

function Footer({ date }: { date: string }) {
  return (
    <View style={S.footer}>
      <Text style={S.footerText}>Red date = overdue / expired</Text>
      <Text style={S.footerText}>Amber date = due within 30 days</Text>
      <Text style={S.footerText}>— = date not on file</Text>
      <Text style={[S.footerText, { marginLeft: "auto" }]}>742 Logistics · Fleet Status · {date}</Text>
    </View>
  );
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET() {
  const today     = new Date().toISOString().slice(0, 10);
  const printDate = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const [allVehicles, allDrivers] = await Promise.all([
    db.select().from(vehicles).orderBy(vehicles.unitNumber),
    db.select({ id: drivers.id, name: drivers.name, assignedVehicleId: drivers.assignedVehicleId })
      .from(drivers),
  ]);

  const driverMap = new Map<number, DriverRow>(
    allDrivers.filter((d) => d.assignedVehicleId).map((d) => [d.assignedVehicleId!, d])
  );

  const active   = allVehicles.filter((v) => v.active);
  const inactive = allVehicles.filter((v) => !v.active);
  const owned    = active.filter((v) => v.ownership !== "rental");
  const rentals  = active.filter((v) => v.ownership === "rental");

  const totalOwned   = allVehicles.filter((v) => v.ownership !== "rental").length;
  const totalRentals = allVehicles.filter((v) => v.ownership === "rental").length;

  const issueVehicles = allVehicles.filter((v) => {
    const { overdue, warning } = statusOf(v as VehicleRow, today);
    return overdue.length > 0 || warning.length > 0;
  });

  const pdf = (
    <Document title="742 Logistics — Fleet Status Report">

      {/* ═══════════════════ PAGE 1 · ACTIVE ═══════════════════ */}
      <Page size="LETTER" orientation="landscape" style={S.page}>
        <View style={S.masthead}>
          <View style={S.mastheadLeft}>
            <Text style={S.eyebrow}>742 Logistics · Fleet Status Report</Text>
            <Text style={S.pageTitle}>ACTIVE</Text>
            <Text style={S.mastheadDate}>Generated {printDate}</Text>
          </View>
          <View style={S.statBlock}>
            <Text style={S.statNum}>{active.length}</Text>
            <Text style={S.statLabel}>Active</Text>
          </View>
          <View style={S.divider} />
          <View style={S.statBlock}>
            <Text style={S.statNum}>{totalOwned}</Text>
            <Text style={S.statLabel}>Owned</Text>
          </View>
          <View style={S.divider} />
          <View style={S.statBlock}>
            <Text style={S.statNum}>{totalRentals}</Text>
            <Text style={S.statLabel}>Rentals</Text>
          </View>
          <View style={S.divider} />
          <View style={S.statBlock}>
            <Text style={S.statNum}>{allVehicles.length}</Text>
            <Text style={S.statLabel}>Fleet Total</Text>
          </View>
        </View>

        {issueVehicles.length > 0 && (
          <View style={S.alertCard}>
            <Text style={S.alertTitle}>
              {issueVehicles.length} vehicle{issueVehicles.length !== 1 ? "s" : ""} require attention
            </Text>
            <Text style={S.alertBody}>
              {issueVehicles.map((v) => {
                const { overdue, warning } = statusOf(v as VehicleRow, today);
                const all = [...overdue, ...warning];
                return `${v.unitNumber}: ${all.join(", ")}`;
              }).join("    ·    ")}
            </Text>
          </View>
        )}

        <Section label="Owned Vehicles"  rows={owned}   driverMap={driverMap} today={today} />
        <Section label="Rental Vehicles" rows={rentals} driverMap={driverMap} today={today} />
        <Footer date={printDate} />
      </Page>

      {/* ═══════════════════ PAGE 2 · INACTIVE ═══════════════════ */}
      {inactive.length > 0 && (
        <Page size="LETTER" orientation="landscape" style={S.page}>
          <View style={S.masthead}>
            <View style={S.mastheadLeft}>
              <Text style={S.eyebrow}>742 Logistics · Fleet Status Report</Text>
              <Text style={S.pageTitleMuted}>INACTIVE</Text>
              <Text style={S.mastheadDate}>Generated {printDate}</Text>
            </View>
            <View style={S.statBlock}>
              <Text style={[S.statNum, { color: G.inkMuted }]}>{inactive.length}</Text>
              <Text style={S.statLabel}>Inactive</Text>
            </View>
          </View>

          <Section label="Inactive Fleet" rows={inactive} driverMap={driverMap} today={today} dimmed />
          <Footer date={printDate} />
        </Page>
      )}

    </Document>
  );

  const buffer = await renderToBuffer(pdf);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="fleet-status-${today}.pdf"`,
    },
  });
}
