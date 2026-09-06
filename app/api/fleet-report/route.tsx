import { NextResponse } from "next/server";
import { getAllVehiclesWithConditions } from "@/lib/actions/vehicle-conditions";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

const PURPLE = "#4D148C";
const ORANGE = "#FF6200";
const RED    = "#dc2626";

const SEV_COLOR: Record<string, string> = {
  critical: "#dc2626",
  high:     "#ea580c",
  medium:   "#d97706",
  low:      "#64748b",
};

const ROUTE_LABEL: Record<string, string> = {
  in_use:     "In Use",
  not_in_use: "Not in Use",
  confirm:    "Confirm",
};

const styles = StyleSheet.create({
  page:       { fontFamily: "Helvetica", fontSize: 9, color: "#1e293b", backgroundColor: "#ffffff", padding: 0 },
  // Cover band
  topBand:    { backgroundColor: PURPLE, padding: "18 32 14 32", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  badge:      { backgroundColor: "#ffffff", borderRadius: 6, padding: "4 8", marginBottom: 6 },
  badgeText:  { fontSize: 11, fontFamily: "Helvetica-Bold", color: PURPLE },
  titleBlock: { flex: 1, paddingLeft: 12 },
  title:      { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#ffffff", letterSpacing: 0.5 },
  subtitle:   { fontSize: 8, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  metaText:   { fontSize: 8, color: "rgba(255,255,255,0.7)", textAlign: "right" },
  metaBold:   { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#ffffff", textAlign: "right" },
  orangeBar:  { backgroundColor: ORANGE, height: 3 },
  // KPIs
  kpiRow:     { flexDirection: "row", padding: "12 32 8 32", gap: 12 },
  kpiBox:     { flex: 1, backgroundColor: "#f8fafc", borderRadius: 6, border: "1 solid #e2e8f0", padding: "8 12" },
  kpiLabel:   { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  kpiValue:   { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  kpiValueRed:{ fontSize: 20, fontFamily: "Helvetica-Bold", color: RED },
  kpiValueOrg:{ fontSize: 20, fontFamily: "Helvetica-Bold", color: ORANGE },
  // Alert
  alertBox:   { marginHorizontal: 32, marginBottom: 8, backgroundColor: "#fef2f2", border: "1 solid #fecaca", borderRadius: 6, padding: "8 12" },
  alertTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#dc2626", marginBottom: 2 },
  alertText:  { fontSize: 8, color: "#991b1b", lineHeight: 1.4 },
  // Table
  tableWrap:  { marginHorizontal: 32, marginBottom: 16 },
  tableHead:  { flexDirection: "row", backgroundColor: "#f1f5f9", borderRadius: "4 4 0 0", padding: "5 8", borderBottom: "1 solid #e2e8f0" },
  tableRow:   { flexDirection: "row", padding: "5 8", borderBottom: "1 solid #f1f5f9" },
  tableRowAlt:{ flexDirection: "row", padding: "5 8", borderBottom: "1 solid #f1f5f9", backgroundColor: "#fafafa" },
  thText:     { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.3 },
  tdText:     { fontSize: 8, color: "#334155" },
  tdMono:     { fontSize: 7, color: "#94a3b8", fontFamily: "Courier" },
  // Condition detail page
  condPage:   { padding: "28 32" },
  condHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingBottom: 10, borderBottom: "1.5 solid #e2e8f0" },
  condTitle:  { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  condSub:    { fontSize: 8, color: "#94a3b8", marginTop: 2 },
  condVin:    { fontSize: 7, color: "#94a3b8", fontFamily: "Courier", marginTop: 1 },
  sevBadge:   { borderRadius: 4, padding: "2 6", alignSelf: "flex-start" },
  sevText:    { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4 },
  issueRow:   { flexDirection: "row", gap: 8, marginBottom: 6, alignItems: "flex-start" },
  issueNum:   { fontSize: 8, color: "#94a3b8", width: 14, paddingTop: 1 },
  issueBody:  { flex: 1 },
  issueDesc:  { fontSize: 9, color: "#1e293b", lineHeight: 1.4 },
  issueNote:  { fontSize: 8, color: "#64748b", marginTop: 1, lineHeight: 1.3 },
  // Footer
  footer:     { position: "absolute", bottom: 20, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 7, color: "#94a3b8" },
});

function routeBadgeStyle(rs: string) {
  if (rs === "in_use")    return { bg: "#ecfdf5", color: "#065f46", border: "#a7f3d0" };
  if (rs === "not_in_use") return { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" };
  return { bg: "#fffbeb", color: "#92400e", border: "#fde68a" };
}

export async function GET() {
  const rows = await getAllVehiclesWithConditions();
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const totalIssues   = rows.reduce((s, v) => s + v.conditions.length, 0);
  const needsGrounding = rows.filter((v) => v.conditions.some((c) => c.severity === "critical")).length;
  const routePending  = rows.filter((v) => !v.active || v.conditions.some((c) => c.routeStatus === "confirm")).length;

  // Vehicles with critical issues for alert
  const criticalVehicles = rows.filter((v) => v.conditions.some((c) => c.severity === "critical"));

  const doc = (
    <Document title="742 Fleet Vehicle Status" author="MyGroundOps">
      {/* ── PAGE 1: Summary ───────────────────────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        {/* Header band */}
        <View style={styles.topBand}>
          <View style={styles.badge}><Text style={styles.badgeText}>742</Text></View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Fleet Vehicle Status</Text>
            <Text style={styles.subtitle}>Route Utilization & Vehicle Condition Review</Text>
          </View>
          <View>
            <Text style={styles.metaText}>Issued  {today}</Text>
            <Text style={styles.metaText}>Prepared by  <Text style={styles.metaBold}>Blake Nardoni</Text></Text>
            <Text style={styles.metaText}>MyGroundOps INC</Text>
          </View>
        </View>
        <View style={styles.orangeBar} />

        {/* KPIs */}
        <View style={styles.kpiRow}>
          {[
            { label: "Fleet Vehicles",       value: rows.length.toString(),     style: styles.kpiValue },
            { label: "Issues Reported",      value: totalIssues.toString(),     style: totalIssues > 0 ? styles.kpiValueRed : styles.kpiValue },
            { label: "Needs Grounding",      value: needsGrounding.toString(),  style: needsGrounding > 0 ? styles.kpiValueRed : styles.kpiValue },
            { label: "Route Status Pending", value: routePending.toString(),    style: routePending > 0 ? styles.kpiValueOrg : styles.kpiValue },
          ].map((k) => (
            <View key={k.label} style={styles.kpiBox}>
              <Text style={styles.kpiLabel}>{k.label}</Text>
              <Text style={k.style}>{k.value}</Text>
            </View>
          ))}
        </View>

        {/* Safety alert if critical vehicles */}
        {criticalVehicles.length > 0 && (
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>
              Safety Alert · {criticalVehicles.map((v) => `${v.unitNumber}${v.driverName ? ` · ${v.driverName}` : ""}`).join(", ")}
            </Text>
            {criticalVehicles.map((v) =>
              v.conditions.filter((c) => c.severity === "critical").map((c) => (
                <Text key={c.id} style={styles.alertText}>• {v.unitNumber}: {c.description}</Text>
              ))
            )}
          </View>
        )}

        {/* Vehicle table */}
        <View style={styles.tableWrap}>
          <View style={styles.tableHead}>
            {["#", "Year", "Make", "Model", "VIN", "Unit #", "Route Status", "Condition / Notes"].map((h, i) => (
              <Text key={h} style={[styles.thText, {
                width: [20, 30, 50, 50, 90, 45, 60, 0][i],
                flex:  i === 7 ? 1 : undefined,
              }]}>{h}</Text>
            ))}
          </View>
          {rows.map((v, idx) => {
            const topCond = v.conditions[0];
            const rs = topCond?.routeStatus ?? (v.active ? "in_use" : "not_in_use");
            const rStyle = routeBadgeStyle(rs);
            const hasCrit = v.conditions.some((c) => c.severity === "critical");
            const rowStyle = idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
            return (
              <View key={v.id} style={rowStyle}>
                <Text style={[styles.tdText, { width: 20 }]}>{idx + 1}</Text>
                <Text style={[styles.tdText, { width: 30 }]}>{v.year}</Text>
                <Text style={[styles.tdText, { width: 50 }]}>{v.make}</Text>
                <Text style={[styles.tdText, { width: 50 }]}>{v.model}</Text>
                <Text style={[styles.tdMono, { width: 90 }]}>{v.vin || "-"}</Text>
                <Text style={[styles.tdText, { width: 45 }]}>{v.unitNumber}</Text>
                {/* Route status badge */}
                <View style={{ width: 60 }}>
                  <View style={{ backgroundColor: rStyle.bg, border: `1 solid ${rStyle.border}`, borderRadius: 4, padding: "1 4", alignSelf: "flex-start" }}>
                    <Text style={{ fontSize: 7, color: rStyle.color, fontFamily: "Helvetica-Bold" }}>
                      {v.driverName ? `${ROUTE_LABEL[rs] ?? rs}\n${v.driverName}` : (ROUTE_LABEL[rs] ?? rs)}
                    </Text>
                  </View>
                </View>
                {/* Conditions summary */}
                <View style={{ flex: 1 }}>
                  {v.conditions.length === 0 ? (
                    <Text style={[styles.tdText, { color: "#cbd5e1" }]}>No data yet</Text>
                  ) : (
                    v.conditions.slice(0, 2).map((c) => (
                      <Text key={c.id} style={[styles.tdText, { color: SEV_COLOR[c.severity] ?? "#334155", marginBottom: 1, lineHeight: 1.3 }]}>
                        {c.description.slice(0, 80)}{c.description.length > 80 ? "…" : ""}
                      </Text>
                    ))
                  )}
                  {v.conditions.length > 2 && (
                    <Text style={{ fontSize: 7, color: "#94a3b8" }}>+{v.conditions.length - 2} more</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Legend */}
        <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 32, marginBottom: 8 }}>
          {[
            { label: "In Use", ...routeBadgeStyle("in_use") },
            { label: "Not in Use", ...routeBadgeStyle("not_in_use") },
            { label: "Confirm (awaiting route confirmation)", ...routeBadgeStyle("confirm") },
          ].map((l) => (
            <View key={l.label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: l.bg, border: `1 solid ${l.border}` }} />
              <Text style={{ fontSize: 7, color: "#64748b" }}>{l.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>APPARO GROUP INC · INTERNAL DOCUMENT · CONFIDENTIAL</Text>
          <Text style={styles.footerText}>Generated {today}</Text>
        </View>
      </Page>

      {/* ── CONDITION DETAIL PAGES (one per vehicle with issues) ──────── */}
      {rows.filter((v) => v.conditions.length > 0).map((v) => {
        const topRouteStatus = v.conditions[0]?.routeStatus ?? (v.active ? "in_use" : "not_in_use");
        const rStyle = routeBadgeStyle(topRouteStatus);
        const hasCrit = v.conditions.some((c) => c.severity === "critical");
        return (
          <Page key={v.id} size="LETTER" style={styles.page}>
            <View style={styles.topBand}>
              <View style={styles.badge}><Text style={styles.badgeText}>742</Text></View>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>Vehicle Condition</Text>
                <Text style={styles.subtitle}>Condition Documentation</Text>
              </View>
              <View>
                <Text style={styles.metaText}>Issued  {today}</Text>
                <Text style={styles.metaText}>Prepared by  <Text style={styles.metaBold}>Blake Nardoni</Text></Text>
              </View>
            </View>
            <View style={styles.orangeBar} />

            <View style={styles.condPage}>
              {/* Vehicle header bar */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16,
                backgroundColor: hasCrit ? "#fef2f2" : "#f8fafc", border: `1 solid ${hasCrit ? "#fecaca" : "#e2e8f0"}`,
                borderRadius: 8, padding: "10 14" }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <View style={{ backgroundColor: rStyle.bg, border: `1 solid ${rStyle.border}`, borderRadius: 4, padding: "2 6" }}>
                      <Text style={{ fontSize: 7, color: rStyle.color, fontFamily: "Helvetica-Bold" }}>
                        {ROUTE_LABEL[topRouteStatus] ?? topRouteStatus}
                      </Text>
                    </View>
                    {hasCrit && (
                      <View style={{ backgroundColor: "#dc2626", borderRadius: 4, padding: "2 6" }}>
                        <Text style={{ fontSize: 7, color: "#fff", fontFamily: "Helvetica-Bold" }}>CRITICAL</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 8, color: "#94a3b8" }}>Unit {v.unitNumber}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: "#0f172a" }}>
                    {v.year} {v.make} {v.model}
                  </Text>
                  <Text style={{ fontSize: 7, color: "#94a3b8", fontFamily: "Courier", marginTop: 2 }}>
                    VIN {v.vin || "-"}
                  </Text>
                  {v.driverName && (
                    <Text style={{ fontSize: 8, color: "#64748b", marginTop: 3 }}>Driver: {v.driverName}</Text>
                  )}
                </View>
              </View>

              {/* Documented defects */}
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#0f172a", marginBottom: 10, letterSpacing: 0.3 }}>
                DOCUMENTED DEFECTS
              </Text>
              <View style={{ backgroundColor: "#f8fafc", border: "1 solid #e2e8f0", borderRadius: 8, padding: "10 14" }}>
                {v.conditions.map((c, i) => (
                  <View key={c.id} style={styles.issueRow}>
                    <Text style={styles.issueNum}>{i + 1}</Text>
                    <View style={styles.issueBody}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <View style={[styles.sevBadge, { backgroundColor: SEV_COLOR[c.severity] + "18", border: `1 solid ${SEV_COLOR[c.severity]}40` }]}>
                          <Text style={[styles.sevText, { color: SEV_COLOR[c.severity] }]}>{c.severity}</Text>
                        </View>
                        {c.repairEstimate && (
                          <Text style={{ fontSize: 7, color: "#64748b" }}>Est. ${c.repairEstimate.toLocaleString()}</Text>
                        )}
                      </View>
                      <Text style={styles.issueDesc}>{c.description}</Text>
                      {c.note && <Text style={styles.issueNote}>{c.note}</Text>}
                    </View>
                  </View>
                ))}
              </View>

              {/* Status summary box if critical */}
              {hasCrit && (
                <View style={{ marginTop: 14, backgroundColor: "#fef2f2", border: "1 solid #fecaca", borderRadius: 6, padding: "8 12" }}>
                  <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#dc2626", marginBottom: 3 }}>Status:</Text>
                  <Text style={{ fontSize: 8, color: "#991b1b", lineHeight: 1.4 }}>
                    {v.conditions.filter((c) => c.severity === "critical").map((c) => c.description).join(" · ")}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>APPARO GROUP INC · INTERNAL DOCUMENT · CONFIDENTIAL</Text>
              <Text style={styles.footerText}>Unit {v.unitNumber}</Text>
            </View>
          </Page>
        );
      })}
    </Document>
  );

  const buffer = await renderToBuffer(doc);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="742_Fleet_Status_${new Date().toISOString().slice(0,10)}.pdf"`,
    },
  });
}
