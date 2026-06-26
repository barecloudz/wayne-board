import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { vehicles, drivers } from "@/lib/schema";
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

export const dynamic = "force-dynamic";

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:      { fontFamily: "Helvetica", fontSize: 9, color: "#0f172a", padding: "32pt 36pt" },
  header:    { marginBottom: 14, borderBottom: "2pt solid #0f172a", paddingBottom: 8 },
  title:     { fontSize: 16, fontFamily: "Helvetica-Bold", letterSpacing: -0.3 },
  subtitle:  { fontSize: 9, color: "#64748b", marginTop: 2 },
  section:   { marginBottom: 14 },
  sectionHdr:{ fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8, color: "#475569", marginBottom: 4, borderBottom: "1pt solid #e2e8f0", paddingBottom: 3 },
  table:     { width: "100%" },
  thead:     { flexDirection: "row", backgroundColor: "#f8fafc", borderBottom: "1pt solid #e2e8f0" },
  trow:      { flexDirection: "row", borderBottom: "0.5pt solid #f1f5f9" },
  trowAlt:   { flexDirection: "row", borderBottom: "0.5pt solid #f1f5f9", backgroundColor: "#f8fafc" },
  th:        { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, padding: "4pt 5pt" },
  td:        { fontSize: 8.5, color: "#334155", padding: "5pt 5pt" },
  tdBold:    { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#0f172a", padding: "5pt 5pt" },
  tdRed:     { fontSize: 8.5, color: "#dc2626", padding: "5pt 5pt" },
  tdMuted:   { fontSize: 8.5, color: "#94a3b8", padding: "5pt 5pt" },
  alertRed:  { fontSize: 7.5, color: "#dc2626", fontFamily: "Helvetica-Bold" },
  alertAmb:  { fontSize: 7.5, color: "#d97706", fontFamily: "Helvetica-Bold" },
  ok:        { fontSize: 7.5, color: "#16a34a" },
  legend:    { flexDirection: "row", gap: 16, marginTop: 12, borderTop: "0.5pt solid #e2e8f0", paddingTop: 8 },
  legendTxt: { fontSize: 7.5, color: "#64748b" },
  dimmed:    { opacity: 0.55 },
  // column widths
  cUnit:   { width: "9%" },
  cVeh:    { width: "21%" },
  cType:   { width: "8%" },
  cOwn:    { width: "7%" },
  cDriver: { width: "17%" },
  cMMR:    { width: "10%" },
  cFed:    { width: "10%" },
  cReg:    { width: "10%" },
  cAlert:  { width: "8%" },
});

function fmt(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function statusOf(v: VehicleRow, today: string) {
  const issues: string[] = [];
  if (v.mmrDue && v.mmrDue < today) issues.push("MMR Overdue");
  if (v.federalInspectionDue && v.federalInspectionDue < today) issues.push("Fed Insp. Overdue");
  if (v.registrationExpiry && v.registrationExpiry < today) issues.push("Reg. Expired");
  const warning: string[] = [];
  const soon = new Date(today); soon.setDate(soon.getDate() + 30);
  const soonStr = soon.toISOString().slice(0, 10);
  if (v.mmrDue && v.mmrDue >= today && v.mmrDue <= soonStr) warning.push("MMR Due Soon");
  if (v.federalInspectionDue && v.federalInspectionDue >= today && v.federalInspectionDue <= soonStr) warning.push("Fed Due Soon");
  if (v.registrationExpiry && v.registrationExpiry >= today && v.registrationExpiry <= soonStr) warning.push("Reg. Expiring");
  return { issues, warning };
}

type VehicleRow = {
  id: number; unitNumber: string; make: string; model: string; year: number;
  type: string; ownership: string; active: boolean;
  mmrDue: string | null; federalInspectionDue: string | null; registrationExpiry: string | null;
};
type DriverRow = { id: number; name: string; assignedVehicleId: number | null; };

function TableSection({
  title, rows, driverMap, today, dimmed,
}: {
  title: string; rows: VehicleRow[]; driverMap: Map<number, DriverRow>; today: string; dimmed?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={S.section}>
      <Text style={S.sectionHdr}>{title} — {rows.length} vehicle{rows.length !== 1 ? "s" : ""}</Text>
      <View style={[S.table, dimmed ? S.dimmed : {}]}>
        {/* Header */}
        <View style={S.thead}>
          {[
            { label: "Unit #",   style: S.cUnit },
            { label: "Vehicle",  style: S.cVeh },
            { label: "Type",     style: S.cType },
            { label: "Own.",     style: S.cOwn },
            { label: "Assigned Driver", style: S.cDriver },
            { label: "MMR Due",  style: S.cMMR },
            { label: "Fed Insp.", style: S.cFed },
            { label: "Reg. Exp.", style: S.cReg },
            { label: "Alerts",   style: S.cAlert },
          ].map((col) => (
            <Text key={col.label} style={[S.th, col.style]}>{col.label}</Text>
          ))}
        </View>
        {/* Rows */}
        {rows.map((v, i) => {
          const driver = driverMap.get(v.id);
          const { issues, warning } = statusOf(v, today);
          const allAlerts = [...issues, ...warning];
          const rowStyle = i % 2 === 0 ? S.trow : S.trowAlt;

          const mmrColor  = v.mmrDue && v.mmrDue < today ? S.tdRed : S.td;
          const fedColor  = v.federalInspectionDue && v.federalInspectionDue < today ? S.tdRed : S.td;
          const regColor  = v.registrationExpiry && v.registrationExpiry < today ? S.tdRed : S.td;

          return (
            <View key={v.id} style={rowStyle}>
              <Text style={[S.tdBold, S.cUnit]}>{v.unitNumber}</Text>
              <Text style={[S.td, S.cVeh]}>{v.year} {v.make} {v.model}</Text>
              <Text style={[S.td, S.cType, { textTransform: "capitalize" }]}>{v.type}</Text>
              <Text style={[S.td, S.cOwn]}>{v.ownership === "rental" ? "Rental" : "Owned"}</Text>
              <Text style={[driver ? S.td : S.tdMuted, S.cDriver]}>{driver ? driver.name : "Unassigned"}</Text>
              <Text style={[mmrColor, S.cMMR]}>{fmt(v.mmrDue)}</Text>
              <Text style={[fedColor, S.cFed]}>{fmt(v.federalInspectionDue)}</Text>
              <Text style={[regColor, S.cReg]}>{fmt(v.registrationExpiry)}</Text>
              <View style={S.cAlert}>
                {allAlerts.length === 0
                  ? <Text style={S.ok}>✓ OK</Text>
                  : allAlerts.map((a, ai) => (
                    <Text key={ai} style={issues.includes(a) ? S.alertRed : S.alertAmb}>{a}</Text>
                  ))
                }
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const printDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

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
    const { issues, warning } = statusOf(v as VehicleRow, today);
    return issues.length > 0 || warning.length > 0;
  });

  const pdfDoc = (
    <Document title="742 Logistics — Fleet Status Report">
      <Page size="LETTER" orientation="landscape" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <Text style={S.title}>742 Logistics — Fleet Status Report</Text>
          <Text style={S.subtitle}>Generated {printDate}  ·  {allVehicles.length} total vehicles  ·  {active.length} active / {inactive.length} inactive  ·  {totalOwned} owned / {totalRentals} rentals</Text>
        </View>

        {/* Compliance alerts summary */}
        {issueVehicles.length > 0 && (
          <View style={{ marginBottom: 10, padding: "6pt 8pt", backgroundColor: "#fef2f2", border: "1pt solid #fecaca" }}>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#dc2626", marginBottom: 3 }}>
              {issueVehicles.length} vehicle{issueVehicles.length !== 1 ? "s" : ""} require attention
            </Text>
            <Text style={{ fontSize: 8, color: "#dc2626" }}>
              {issueVehicles.map((v) => {
                const { issues, warning } = statusOf(v as VehicleRow, today);
                return `${v.unitNumber}: ${[...issues, ...warning].join(", ")}`;
              }).join("  ·  ")}
            </Text>
          </View>
        )}

        <TableSection title="Owned (Active)" rows={owned}   driverMap={driverMap} today={today} />
        <TableSection title="Rentals (Active)" rows={rentals} driverMap={driverMap} today={today} />
        <TableSection title="Inactive" rows={inactive} driverMap={driverMap} today={today} dimmed />

        {/* Legend */}
        <View style={S.legend}>
          <Text style={S.legendTxt}>Red date = overdue / expired</Text>
          <Text style={S.legendTxt}>Yellow alert = due within 30 days</Text>
          <Text style={S.legendTxt}>✓ OK = no issues</Text>
          <Text style={S.legendTxt}>— = date not yet entered</Text>
          <Text style={[S.legendTxt, { marginLeft: "auto" }]}>742 Logistics · Fleet Status · {printDate}</Text>
        </View>
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(pdfDoc);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fleet-status-${today}.pdf"`,
    },
  });
}
