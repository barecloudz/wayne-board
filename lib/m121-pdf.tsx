import {
  Document, Page, Text, View, StyleSheet, Line, Svg,
} from "@react-pdf/renderer";
import { INSPECTION_COMPONENTS } from "./inspection-components";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PDFInspection = {
  inspectorName: string;
  inspectorId: string;
  stationName: string;
  stationNumber: string;
  inspectionDate: string;
  outOfService: boolean;
  outOfServiceDocs: string | null;
  notificationDate: string | null;
  notifiedAOBCName: string | null;
  agreedRepairDate: string | null;
  status: string;
};

export type PDFResult = {
  componentId: number;
  status: string;
  dateRepaired: string | null;
  notes: string | null;
};

export type PDFVehicle = {
  unitNumber: string;
  make: string;
  model: string;
  year: number;
  vin: string;
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 7,
    paddingTop: 22,
    paddingBottom: 28,
    paddingHorizontal: 30,
    color: "#000",
  },

  // ── Header ──
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
    borderBottomWidth: 0.75,
    borderBottomColor: "#999",
    paddingBottom: 6,
  },
  fedexBlock: {
    width: 72,
    flexShrink: 0,
  },
  fedexFed: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: "#4d148c",
    letterSpacing: -0.5,
    lineHeight: 1,
  },
  fedexEx: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: "#ff6200",
    letterSpacing: -0.5,
    lineHeight: 1,
  },
  fedexTagline: {
    fontSize: 5,
    color: "#4d148c",
    marginTop: 1,
  },
  titleBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleMain: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    textAlign: "center",
  },
  titleSub: {
    fontSize: 9,
    textAlign: "center",
    marginTop: 1,
  },
  formNumBlock: {
    width: 70,
    alignItems: "flex-end",
    flexShrink: 0,
  },
  formNum: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    textAlign: "right",
  },
  formDate: {
    fontSize: 7.5,
    textAlign: "right",
    marginTop: 1,
  },

  // ── Top field row ──
  fieldRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 7,
    gap: 12,
  },
  fieldItem: {
    flexDirection: "row",
    alignItems: "flex-end",
    flex: 1,
  },
  fieldLabel: {
    fontSize: 7,
    flexShrink: 0,
    marginRight: 2,
  },
  fieldValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#000",
    flex: 1,
    paddingBottom: 0.5,
  },

  // ── Instructions ──
  instructionBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    marginBottom: 3,
    lineHeight: 1.4,
  },
  instruction: {
    fontSize: 6.5,
    marginBottom: 3,
    lineHeight: 1.4,
  },
  instructionItalic: {
    fontFamily: "Helvetica-Oblique",
    fontSize: 6.5,
    marginBottom: 5,
    lineHeight: 1.4,
  },

  // ── Out-of-service box ──
  oosRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 5,
  },
  oosBox: {
    borderWidth: 0.75,
    borderColor: "#000",
    padding: 4,
    width: 280,
  },
  oosLine: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  oosCheckBox: {
    width: 10,
    height: 10,
    borderWidth: 0.75,
    borderColor: "#000",
    marginRight: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  oosCheckMark: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    lineHeight: 1,
  },
  oosText: {
    fontSize: 6.5,
    flex: 1,
  },

  // ── Indicate label ──
  indicateRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 2,
  },
  indicateText: {
    fontFamily: "Helvetica-Oblique",
    fontSize: 6.5,
  },

  // ── Table ──
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#000",
    borderWidth: 0.5,
    borderColor: "#000",
  },
  tableHeaderCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#fff",
    padding: 3,
    textAlign: "center",
  },
  colComponent: { flex: 1 },
  colOK: { width: 24, borderLeftWidth: 0.5, borderLeftColor: "#fff" },
  colRepair: { width: 44, borderLeftWidth: 0.5, borderLeftColor: "#fff" },
  colDate: { width: 50, borderLeftWidth: 0.5, borderLeftColor: "#fff" },

  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: "#999",
    minHeight: 0,
  },
  tableRowAlt: {
    backgroundColor: "#f9f9f9",
  },
  tableCell: {
    padding: 2.5,
    fontSize: 6.5,
    lineHeight: 1.35,
  },
  tableCellCenter: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  componentNum: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    marginRight: 2,
  },
  componentName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
  },
  componentDesc: {
    fontSize: 6,
    color: "#333",
    lineHeight: 1.35,
  },
  colBorderLeft: {
    borderLeftWidth: 0.5,
    borderLeftColor: "#999",
  },

  // ── Notification section ──
  notifBox: {
    borderWidth: 0.75,
    borderColor: "#999",
    backgroundColor: "#f0f0f0",
    padding: 8,
    marginTop: 8,
  },
  notifTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    textDecorationLine: "underline",
    marginBottom: 3,
  },
  notifBody: {
    fontSize: 6.5,
    lineHeight: 1.4,
    marginBottom: 8,
  },
  notifFieldRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 8,
    gap: 8,
  },
  notifLabel: {
    fontSize: 6.5,
    flexShrink: 0,
  },
  notifValue: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    borderBottomWidth: 0.5,
    borderBottomColor: "#000",
    flex: 1,
    paddingBottom: 0.5,
    minWidth: 100,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusMark(status: string): string {
  if (status === "OK") return "✓";
  if (status === "Repair Needed") return "✓";
  if (status === "N/A") return "N/A";
  if (status === "A/D") return "A/D";
  return "";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PageHeader() {
  return (
    <View style={s.headerRow}>
      <View style={s.fedexBlock}>
        <Text>
          <Text style={s.fedexFed}>Fed</Text>
          <Text style={s.fedexEx}>Ex</Text>
        </Text>
        <Text style={s.fedexTagline}>®</Text>
      </View>
      <View style={s.titleBlock}>
        <Text style={s.titleMain}>U.S. Quarterly Vehicle Inspection Checklist</Text>
        <Text style={s.titleSub}>(Service Provider-Owned Vehicles)</Text>
      </View>
      <View style={s.formNumBlock}>
        <Text style={s.formNum}>M-121</Text>
        <Text style={s.formDate}>01 June 2024</Text>
      </View>
    </View>
  );
}

function HeaderFields({
  inspection,
  vehicle,
}: {
  inspection: PDFInspection;
  vehicle: PDFVehicle;
}) {
  const employeeLabel = inspection.inspectorId
    ? `${inspection.inspectorName} / ${inspection.inspectorId}`
    : inspection.inspectorName;

  return (
    <View style={s.fieldRow}>
      <View style={[s.fieldItem, { flex: 2 }]}>
        <Text style={s.fieldLabel}>Employee Name and/or ID:</Text>
        <Text style={s.fieldValue}>{employeeLabel}</Text>
      </View>
      <View style={[s.fieldItem, { flex: 1.5 }]}>
        <Text style={s.fieldLabel}>Station Name and/or #</Text>
        <Text style={s.fieldValue}>{inspection.stationName} #{inspection.stationNumber}</Text>
      </View>
      <View style={[s.fieldItem, { flex: 0.8 }]}>
        <Text style={s.fieldLabel}>Vehicle Unit #:</Text>
        <Text style={s.fieldValue}>{vehicle.unitNumber}</Text>
      </View>
      <View style={[s.fieldItem, { flex: 0.9 }]}>
        <Text style={s.fieldLabel}>Date of Inspection:</Text>
        <Text style={s.fieldValue}>{inspection.inspectionDate}</Text>
      </View>
    </View>
  );
}

function ComponentRow({
  component,
  result,
  idx,
}: {
  component: (typeof INSPECTION_COMPONENTS)[number];
  result: PDFResult | undefined;
  idx: number;
}) {
  const status = result?.status ?? "";
  const isOK = status === "OK";
  const isRepair = status === "Repair Needed";
  const isNA = status === "N/A";
  const isAD = status === "A/D";

  const accessStar = component.requiresAccess ? "* " : "";
  const rowStyle = idx % 2 === 1 ? [s.tableRow, s.tableRowAlt] : [s.tableRow];

  return (
    <View style={rowStyle} wrap={false}>
      {/* Component description */}
      <View style={[s.tableCell, s.colComponent]}>
        <Text>
          <Text style={s.componentNum}>{component.id}.{accessStar && " *"} </Text>
          <Text style={s.componentName}>{component.name}: </Text>
          <Text style={[s.componentDesc, { fontFamily: "Helvetica" }]}>
            {"("}
            {component.regulation}
            {") "}
            {component.description}
          </Text>
        </Text>
        {result?.notes ? (
          <Text style={{ fontSize: 5.5, color: "#555", marginTop: 1 }}>
            Note: {result.notes}
          </Text>
        ) : null}
      </View>

      {/* OK */}
      <View style={[s.tableCell, s.tableCellCenter, s.colOK, s.colBorderLeft]}>
        <Text>{isOK ? "✓" : isNA ? "N/A" : isAD ? "A/D" : ""}</Text>
      </View>

      {/* Repair Needed */}
      <View style={[s.tableCell, s.tableCellCenter, s.colRepair, s.colBorderLeft]}>
        <Text>{isRepair ? "✓" : ""}</Text>
      </View>

      {/* Date Repaired */}
      <View style={[s.tableCell, s.colDate, s.colBorderLeft]}>
        <Text style={{ fontSize: 6.5, textAlign: "center" }}>
          {result?.dateRepaired ?? ""}
        </Text>
      </View>
    </View>
  );
}

function TableHeader() {
  return (
    <View style={s.tableHeader}>
      <View style={[s.colComponent]}>
        <Text style={[s.tableHeaderCell, { textAlign: "left", paddingLeft: 5 }]}>
          Vehicle Components Inspected
        </Text>
      </View>
      <View style={s.colOK}>
        <Text style={s.tableHeaderCell}>OK</Text>
      </View>
      <View style={s.colRepair}>
        <Text style={s.tableHeaderCell}>Repair{"\n"}Needed</Text>
      </View>
      <View style={s.colDate}>
        <Text style={s.tableHeaderCell}>Date Repaired{"\n"}MM/DD/YY</Text>
      </View>
    </View>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────

export function M121Document({
  inspection,
  vehicle,
  results,
}: {
  inspection: PDFInspection;
  vehicle: PDFVehicle;
  results: PDFResult[];
}) {
  const getResult = (id: number) => results.find((r) => r.componentId === id);
  const page1Components = INSPECTION_COMPONENTS.slice(0, 12);
  const page2Components = INSPECTION_COMPONENTS.slice(12, 20);
  const hasDefects = results.some((r) => r.status === "Repair Needed");

  return (
    <Document
      title={`M-121 Inspection — ${vehicle.unitNumber} — ${inspection.inspectionDate}`}
      author="742 Logistics"
      subject="U.S. Quarterly Vehicle Inspection Checklist"
    >
      {/* ── PAGE 1 ── */}
      <Page size="LETTER" style={s.page}>
        <PageHeader />
        <HeaderFields inspection={inspection} vehicle={vehicle} />

        {/* Instructions */}
        <Text style={s.instructionBold}>
          For detailed instructions, requirements, defect correction information, or assistance while
          conducting an inspection, see Quarterly Vehicle Inspections, VEH-121 and the Quarterly
          Vehicle Inspection Job Aid, VEH-122.
        </Text>
        <Text style={s.instruction}>
          Only fillable fields may be completed electronically. All other fields must be handwritten.
          Mark each component as "OK" or "Repair Needed."
        </Text>
        <Text style={s.instruction}>
          If defects are found, the component must be identified on the form as such in the "Repair
          Needed" column, even if corrected during the inspection. When a safety defect is found, the
          packages must not be made available to the vehicle until those items have been confirmed as
          repaired. (Defects to components 16, 17, and 18 do not affect the safe operation of the
          vehicle.) For any item marked "Repair Needed", notify the authorized officer/business
          contact within one business day of inspection. Once defect has been confirmed as repaired,
          enter date of repair.
        </Text>
        <Text style={s.instruction}>
          Mark N/A (Not Applicable) in the associated line for items not applicable to the specific
          unit. Mark A/D (Access Denied) in the associated line if the service provider authorized
          personnel is not present during inspection (only applicable to * components).
        </Text>
        <Text style={s.instructionItalic}>
          The areas marked with an asterisk (*) requires permission to access the vehicle (if needed)
          by the service provider's authorized personnel.
        </Text>

        {/* Out of service box */}
        <View style={s.oosRow}>
          <View style={s.oosBox}>
            <View style={s.oosLine}>
              <Text style={s.oosText}>
                If the vehicle is out of service and not available for inspection, check this box.
              </Text>
              <View style={s.oosCheckBox}>
                {inspection.outOfService && (
                  <Text style={s.oosCheckMark}>✓</Text>
                )}
              </View>
            </View>
            <View style={s.oosLine}>
              <Text style={s.oosText}>
                Attach supporting documentation showing the vehicle has not provided service.
              </Text>
            </View>
            {inspection.outOfService && inspection.outOfServiceDocs && (
              <Text style={{ fontSize: 6, color: "#555", marginTop: 2 }}>
                {inspection.outOfServiceDocs}
              </Text>
            )}
          </View>
        </View>

        {/* Indicate label */}
        <View style={s.indicateRow}>
          <Text style={s.indicateText}>Indicate with a ✓ or X</Text>
        </View>

        {/* Table */}
        <TableHeader />
        {page1Components.map((component, idx) => (
          <ComponentRow
            key={component.id}
            component={component}
            result={getResult(component.id)}
            idx={idx}
          />
        ))}
      </Page>

      {/* ── PAGE 2 ── */}
      <Page size="LETTER" style={s.page}>
        <PageHeader />
        <HeaderFields inspection={inspection} vehicle={vehicle} />

        {/* Indicate label */}
        <View style={s.indicateRow}>
          <Text style={s.indicateText}>Indicate with a ✓ or X</Text>
        </View>

        {/* Table continued */}
        <TableHeader />
        {page2Components.map((component, idx) => (
          <ComponentRow
            key={component.id}
            component={component}
            result={getResult(component.id)}
            idx={idx}
          />
        ))}

        {/* Notification Section */}
        <View style={s.notifBox}>
          <Text style={s.notifTitle}>
            Notification Section: Only complete this section when components have defects.
          </Text>
          <Text style={s.notifBody}>
            Service provider AO/BC must be notified within one business day of inspection that the
            vehicle listed has defects. Notification is to include all defects. Service provider
            understands that the vehicle must not provide service for FedEx until all safety
            defect(s) have been corrected and verified by FedEx management.
          </Text>

          <View style={s.notifFieldRow}>
            <Text style={s.notifLabel}>Date AO/BC notified:</Text>
            <Text style={s.notifValue}>{inspection.notificationDate ?? ""}</Text>
            <Text style={[s.notifLabel, { marginLeft: 16 }]}>Name of AO/BC notified:</Text>
            <Text style={s.notifValue}>{inspection.notifiedAOBCName ?? ""}</Text>
          </View>

          <Text style={[s.notifBody, { marginBottom: 4 }]}>
            If not repaired at time of inspection, the AO/BC will provide a mutually agreeable date
            by which all repairs will be completed.
          </Text>

          <View style={s.notifFieldRow}>
            <Text style={s.notifLabel}>Date all repairs will be completed:</Text>
            <Text style={[s.notifValue, { maxWidth: 150 }]}>
              {inspection.agreedRepairDate ?? ""}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
