# MMR Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-vehicle MMR form with a dashboard showing all vehicles for a selected month, tracking completion status, and generating a single merged PDF for all vehicles in one click.

**Architecture:** A new `mmr_generations` table tracks when each vehicle's MMR was generated for a given month. The `/dashboard/mmr` page becomes a vehicle grid with per-vehicle status. The `POST /api/mmr-pdf` endpoint replaces the old `GET`, accepts multiple vehicle IDs, queries `vehicleMaintenanceRecords` from the DB (no Excel), and returns a merged multi-page PDF via Puppeteer.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM + Neon PostgreSQL, Puppeteer/chromium-min, TypeScript

**Spec:** `docs/superpowers/specs/2026-10-03-mmr-dashboard-design.md`

## Global Constraints

- All DB queries must be org-scoped via `session.organizationId` — never query without an org filter
- `locations.terminalId` IS the station code (e.g. "0259") — do NOT add a new `stationCode` column; use `terminalId`
- Station derived via: `vehicles.locationId → locations.terminalId`
- Maintenance rows come from `vehicleMaintenanceRecords` table — no Excel, no `MAINTENANCE_TRACKER_PATH`
- Month defaults to **previous calendar month** (e.g. if today is October, default to "2026-09")
- No future months allowed in the month selector
- PDF checkbox logic: maintenance exists → top=Yes, bottom=No; no maintenance → top=No, bottom=No; declaration checkbox always checked
- Company name in PDF comes from `organizations.name`
- Signature line stays hardcoded "Blake Nardoni" for now
- Merged PDF filename: `MMR_YYYY-MM_All.pdf`; single-vehicle: `MMR_{unitNumber}_{YYYY-MM}.pdf`
- `revalidatePath("/dashboard/mmr")` after any generation write
- Use `"use server"` on all server action files; use `"use client"` on all client components

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `lib/schema.ts` | Modify | Add `mmrGenerations` table definition |
| `scripts/0023_add_mmr_generations.ts` | Create | Migration: create `mmr_generations` table |
| `lib/actions/mmr.ts` | Create | Server actions: `getVehiclesForMmrDashboard`, `recordMmrGeneration`, `getOrgName` |
| `app/api/mmr-pdf/route.ts` | Replace | POST endpoint: multi-vehicle merged PDF from DB |
| `app/api/mmr-vehicles/route.ts` | Create | GET endpoint for client-side month switching |
| `app/dashboard/mmr/page.tsx` | Modify | Fetch dashboard data, pass to client |
| `app/dashboard/mmr/mmr-client.tsx` | Replace | Full dashboard UI: month picker, vehicle grid, Generate All |
| `lib/mmr-data.ts` | Delete | Dead code — Excel reader replaced by DB queries |

---

### Task 1: Add `mmr_generations` table to schema + run migration

**Files:**
- Modify: `lib/schema.ts`
- Create: `scripts/0023_add_mmr_generations.ts`

**Interfaces:**
- Produces: `mmrGenerations` export from `lib/schema.ts` — used by Tasks 2 and 3

- [ ] **Step 1: Add table definition to `lib/schema.ts`**

Open `lib/schema.ts`. After the `vehicleMaintenanceRecords` table definition (search for `export const vehicleMaintenanceRecords`), add this block immediately after its closing `});`:

```typescript
// ── MMR Generation Log ────────────────────────────────────────────────────────
export const mmrGenerations = pgTable("mmr_generations", {
  id:                  serial("id").primaryKey(),
  organizationId:      integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  vehicleId:           integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  monthYear:           text("month_year").notNull(),            // "YYYY-MM"
  mileageSnapshot:     text("mileage_snapshot"),                // mileage string used in PDF
  maintenanceRowCount: integer("maintenance_row_count").notNull().default(0),
  generatedBy:         text("generated_by").notNull(),          // driverId of admin
  generatedAt:         timestamp("generated_at").defaultNow(),
}, (t) => ({
  orgVehicleMonthUnique: uniqueIndex("mmr_generations_org_vehicle_month_unique").on(
    t.organizationId, t.vehicleId, t.monthYear
  ),
}));
```

- [ ] **Step 2: Create migration script `scripts/0023_add_mmr_generations.ts`**

```typescript
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  await sql`
    CREATE TABLE IF NOT EXISTS mmr_generations (
      id                    SERIAL PRIMARY KEY,
      organization_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      vehicle_id            INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      month_year            TEXT NOT NULL,
      mileage_snapshot      TEXT,
      maintenance_row_count INTEGER NOT NULL DEFAULT 0,
      generated_by          TEXT NOT NULL,
      generated_at          TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS mmr_generations_org_vehicle_month_unique
    ON mmr_generations (organization_id, vehicle_id, month_year)
  `;
  console.log("Migration complete: mmr_generations table created");
}

migrate().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run the migration**

```bash
npx tsx scripts/0023_add_mmr_generations.ts
```

Expected output: `Migration complete: mmr_generations table created`

- [ ] **Step 4: Verify**

```bash
node --env-file=.env.local -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
sql\`SELECT column_name FROM information_schema.columns WHERE table_name = 'mmr_generations' ORDER BY ordinal_position\`
  .then(r => console.log(r.map(c => c.column_name)));
"
```

Expected: `[ 'id', 'organization_id', 'vehicle_id', 'month_year', 'mileage_snapshot', 'maintenance_row_count', 'generated_by', 'generated_at' ]`

- [ ] **Step 5: Commit**

```bash
git add lib/schema.ts scripts/0023_add_mmr_generations.ts
git commit -m "feat: add mmr_generations schema and migration"
```

---

### Task 2: Server actions for MMR dashboard data

**Files:**
- Create: `lib/actions/mmr.ts`

**Interfaces:**
- Consumes: `mmrGenerations`, `vehicles`, `locations`, `vehicleMaintenanceRecords`, `organizations` from `lib/schema.ts`
- Produces:
  - `export type VehicleMmrRow = { id: number; unitNumber: string; mileage: number; stationCode: string | null; maintenanceCount: number; lastGenerated: Date | null; lastGeneratedBy: string | null }`
  - `export async function getVehiclesForMmrDashboard(monthYear: string): Promise<VehicleMmrRow[]>`
  - `export async function recordMmrGeneration(entries: { vehicleId: number; monthYear: string; mileageSnapshot: string; maintenanceRowCount: number }[]): Promise<void>`
  - `export async function getOrgName(): Promise<string>`

- [ ] **Step 1: Create `lib/actions/mmr.ts`**

```typescript
"use server";

import { db } from "@/lib/db";
import { vehicles, locations, vehicleMaintenanceRecords, mmrGenerations, organizations } from "@/lib/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return { orgId: session.organizationId, driverId: session.driverId };
}

export type VehicleMmrRow = {
  id: number;
  unitNumber: string;
  mileage: number;
  stationCode: string | null;
  maintenanceCount: number;
  lastGenerated: Date | null;
  lastGeneratedBy: string | null;
};

export async function getVehiclesForMmrDashboard(monthYear: string): Promise<VehicleMmrRow[]> {
  const { orgId } = await requireOrg();

  const [year, month] = monthYear.split("-").map(Number);
  const firstDay = `${monthYear}-01`;
  const lastDay = new Date(year, month, 0).toISOString().slice(0, 10);

  const vehicleRows = await db
    .select({
      id:          vehicles.id,
      unitNumber:  vehicles.unitNumber,
      mileage:     vehicles.mileage,
      stationCode: locations.terminalId,
    })
    .from(vehicles)
    .leftJoin(locations, eq(vehicles.locationId, locations.id))
    .where(and(eq(vehicles.organizationId, orgId), eq(vehicles.active, true)))
    .orderBy(vehicles.unitNumber);

  const maintRows = await db
    .select({
      vehicleId: vehicleMaintenanceRecords.vehicleId,
      cnt: sql<number>`count(*)::int`,
    })
    .from(vehicleMaintenanceRecords)
    .where(
      and(
        eq(vehicleMaintenanceRecords.organizationId, orgId),
        gte(vehicleMaintenanceRecords.serviceDate, firstDay),
        lte(vehicleMaintenanceRecords.serviceDate, lastDay)
      )
    )
    .groupBy(vehicleMaintenanceRecords.vehicleId);

  const maintMap = new Map<number, number>();
  for (const r of maintRows) {
    if (r.vehicleId !== null) maintMap.set(r.vehicleId, r.cnt);
  }

  const genRows = await db
    .select({
      vehicleId:   mmrGenerations.vehicleId,
      generatedAt: mmrGenerations.generatedAt,
      generatedBy: mmrGenerations.generatedBy,
    })
    .from(mmrGenerations)
    .where(
      and(
        eq(mmrGenerations.organizationId, orgId),
        eq(mmrGenerations.monthYear, monthYear)
      )
    );

  const genMap = new Map<number, { generatedAt: Date | null; generatedBy: string }>();
  for (const r of genRows) {
    genMap.set(r.vehicleId, { generatedAt: r.generatedAt, generatedBy: r.generatedBy });
  }

  return vehicleRows.map((v) => ({
    id:              v.id,
    unitNumber:      v.unitNumber,
    mileage:         v.mileage,
    stationCode:     v.stationCode ?? null,
    maintenanceCount: maintMap.get(v.id) ?? 0,
    lastGenerated:   genMap.get(v.id)?.generatedAt ?? null,
    lastGeneratedBy: genMap.get(v.id)?.generatedBy ?? null,
  }));
}

export async function recordMmrGeneration(
  entries: { vehicleId: number; monthYear: string; mileageSnapshot: string; maintenanceRowCount: number }[]
): Promise<void> {
  const { orgId, driverId } = await requireOrg();

  for (const entry of entries) {
    await db
      .insert(mmrGenerations)
      .values({
        organizationId:      orgId,
        vehicleId:           entry.vehicleId,
        monthYear:           entry.monthYear,
        mileageSnapshot:     entry.mileageSnapshot,
        maintenanceRowCount: entry.maintenanceRowCount,
        generatedBy:         driverId,
      })
      .onConflictDoUpdate({
        target: [mmrGenerations.organizationId, mmrGenerations.vehicleId, mmrGenerations.monthYear],
        set: {
          mileageSnapshot:     entry.mileageSnapshot,
          maintenanceRowCount: entry.maintenanceRowCount,
          generatedBy:         driverId,
          generatedAt:         sql`now()`,
        },
      });
  }

  revalidatePath("/dashboard/mmr");
}

export async function getOrgName(): Promise<string> {
  const { orgId } = await requireOrg();
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return org?.name ?? "MyGroundOps";
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/actions/mmr.ts
git commit -m "feat: add MMR server actions (dashboard data, generation tracking, org name)"
```

---

### Task 3: Replace PDF API route — POST, multi-vehicle, DB-sourced

**Files:**
- Modify: `app/api/mmr-pdf/route.ts` (full replacement)

**Interfaces:**
- Consumes: `vehicleMaintenanceRecords`, `vehicles`, `locations`, `organizations` from `lib/schema.ts`; `recordMmrGeneration` from `lib/actions/mmr.ts`
- Request: `POST` with JSON body `{ vehicleIds: number[], monthYear: string }`
- Response: PDF binary with `Content-Type: application/pdf`

- [ ] **Step 1: Replace `app/api/mmr-pdf/route.ts` entirely with the following**

```typescript
import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { db } from "@/lib/db";
import { vehicles, locations, vehicleMaintenanceRecords, organizations } from "@/lib/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { recordMmrGeneration } from "@/lib/actions/mmr";

export const dynamic = "force-dynamic";

const CHROMIUM_PACK =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

async function getBrowser() {
  const localChrome = process.env.CHROMIUM_PATH;
  if (localChrome) {
    return puppeteer.launch({
      executablePath: localChrome,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(CHROMIUM_PACK),
    headless: true,
  });
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function todayMDY(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function generateVehiclePage(p: {
  unit: string; station: string; mileage: string; companyName: string;
  monthLabel: string; dateCompleted: string; hasRows: boolean; tableRows: string;
}): string {
  const topYes = p.hasRows ? "&#10003;" : "";
  const topNo  = p.hasRows ? "" : "&#10003;";
  return `
<div style="page-break-after:always;font-family:Arial,Helvetica,sans-serif;font-size:10pt;padding:0.55in 0.6in 0.4in 0.6in;color:#000;box-sizing:border-box;width:8.5in;min-height:11in;">
  <div style="border:2px solid #000;text-align:center;padding:6px 12px;margin-bottom:6px;">
    <span style="font-size:15pt;font-weight:bold;">U.S. Monthly Maintenance Record, MGBA-355</span>
  </div>
  <div style="text-align:right;font-size:9pt;margin-bottom:6px;">14 May 2025</div>
  <div style="font-size:8.5pt;line-height:1.4;margin-bottom:10px;">To comply with U.S. Federal Regulations, this form must be completed, signed, and submitted to FedEx by the 20th of the month following the month for which repairs, or maintenance were performed on any service provider-owned or -leased equipment. Submit one record for each piece of equipment, even if not regularly providing services.</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;margin-bottom:6px;">
    <div><div style="font-size:8.5pt;font-weight:bold;margin-bottom:1px;">Maintenance Record for the Month and Year of:</div><div style="border:1px solid #000;padding:2px 5px;font-size:9.5pt;min-height:18px;">${p.monthLabel}</div></div>
    <div><div style="font-size:8.5pt;font-weight:bold;margin-bottom:1px;">Domicile Station/Hub:</div><div style="border:1px solid #000;padding:2px 5px;font-size:9.5pt;min-height:18px;">${p.station}</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;margin-bottom:6px;">
    <div><div style="font-size:8.5pt;font-weight:bold;margin-bottom:1px;">Service Provider Company Name:</div><div style="border:1px solid #000;padding:2px 5px;font-size:9.5pt;min-height:18px;">${p.companyName}</div></div>
    <div><div style="font-size:8.5pt;font-weight:bold;margin-bottom:1px;">Current Mileage* (Odometer Reading)</div><div style="border:1px solid #000;padding:2px 5px;font-size:9.5pt;min-height:18px;">${p.mileage}</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;margin-bottom:8px;">
    <div><div style="font-size:8.5pt;font-weight:bold;margin-bottom:1px;">Vehicle Unit #:</div><div style="border:1px solid #000;padding:2px 5px;font-size:9.5pt;min-height:18px;">${p.unit}</div></div>
    <div style="font-size:7.5pt;line-height:1.3;padding-top:14px;">*If reading has decreased due to odometer repair/replacement, proof should also be provided. If unit is undergoing repair and unavailable, &ldquo;N/A&rdquo; may be utilized for current mileage.</div>
  </div>
  <div style="display:flex;align-items:flex-start;margin-bottom:5px;font-size:9pt;">
    <div style="flex:1;padding-top:1px;line-height:1.3;">Were any repairs, or preventative maintenance performed on this unit?</div>
    <div style="display:flex;align-items:center;gap:6px;white-space:nowrap;padding-left:12px;">
      <span style="display:inline-block;width:11px;height:11px;border:1px solid #000;text-align:center;line-height:11px;font-size:9pt;font-weight:bold;">${topYes}</span><span>Yes</span>
      <span style="display:inline-block;width:11px;height:11px;border:1px solid #000;text-align:center;line-height:11px;font-size:9pt;font-weight:bold;">${topNo}</span><span>No</span>
    </div>
  </div>
  <div style="display:flex;align-items:flex-start;margin-bottom:10px;font-size:9pt;">
    <div style="flex:1;padding-top:1px;line-height:1.3;">If &ldquo;no&rdquo; maintenance was performed, was the unit out of service and unable to provide service (i.e., awaiting repair, on litigation hold, etc.)?</div>
    <div style="display:flex;align-items:center;gap:6px;white-space:nowrap;padding-left:12px;">
      <span style="display:inline-block;width:11px;height:11px;border:1px solid #000;text-align:center;line-height:11px;font-size:9pt;font-weight:bold;"></span><span>Yes</span>
      <span style="display:inline-block;width:11px;height:11px;border:1px solid #000;text-align:center;line-height:11px;font-size:9pt;font-weight:bold;">&#10003;</span><span>No</span>
    </div>
  </div>
  <div style="margin:7px 0;">
    <p style="font-size:8.5pt;line-height:1.4;margin-bottom:4px;">All repairs/replacements, or maintenance performed in conformance with a vehicle&#8217;s Maintenance Interval Form or any other major vehicle system must be reported on an MMR with detailed notations or attached receipts.</p>
    <p style="font-size:8.5pt;line-height:1.4;margin-bottom:4px;">All notations must provide enough detail for a DOT official to determine what component(s), location(s), and type of work was performed (e.g., replace, repair, adjust, etc.).</p>
    <p style="font-size:8.5pt;line-height:1.4;margin-bottom:4px;">Annual Federal/State and Pre/Post trip inspections must not be reported on the MMR, however repairs and maintenance of components that resulted from these inspections must be reported on an MMR.</p>
    <p style="font-size:8.5pt;line-height:1.4;margin-bottom:4px;">General maintenance (e.g., oil/filter changes, lubrication, adjustments) should be reported with adequate detail to clearly convey what components were repaired or maintained. Abbreviations such as &#8220;LOF&#8221; or &#8220;PM&#8221; cannot be used, as these do not provide adequate details.</p>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
    <thead><tr>
      <th style="border:1.5px solid #000;padding:3px 6px;font-size:9pt;font-weight:bold;text-align:left;width:140px;">Date of Maintenance</th>
      <th style="border:1.5px solid #000;padding:3px 6px;font-size:9pt;font-weight:bold;text-align:left;">Specific Description of Maintenance Performed</th>
    </tr></thead>
    <tbody>${p.tableRows}</tbody>
  </table>
  <div style="display:flex;gap:6px;margin-bottom:10px;">
    <div style="width:12px;height:12px;min-width:12px;border:1px solid #000;text-align:center;line-height:12px;font-size:9pt;font-weight:bold;margin-top:1px;">&#9632;</div>
    <div style="font-size:8.5pt;line-height:1.4;">By checking this box, I declare that this record is true and correct. Unless otherwise clearly indicated as &#8220;out of service&#8221; on this record, I confirm that the equipment on this record is in compliance with the Federal Motor Carrier Safety Regulations 49 C.F.R. 396.3(a)(1) and 396.7 (a) and is in safe operating condition and meets all federal, state and local motor vehicle laws. Furthermore, I confirm that preventative maintenance is consistent with the interval schedule per 396.3(b)(2).</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr auto;gap:20px;margin-bottom:10px;align-items:end;">
    <div>
      <div style="font-size:9pt;font-weight:bold;margin-bottom:2px;">Signature of Authorized Officer or Business Contact:</div>
      <div style="border:1px solid #000;height:40px;display:flex;align-items:center;padding:0 8px;overflow:hidden;">
        <span style="font-family:'Brush Script MT','Segoe Script',cursive;font-size:26pt;line-height:1;">Blake Nardoni</span>
      </div>
    </div>
    <div style="min-width:200px;">
      <div style="font-size:9pt;font-weight:bold;margin-bottom:2px;">Date Completed:</div>
      <div style="border:1px solid #000;height:40px;display:flex;align-items:center;justify-content:center;padding:0 8px;">
        <span style="font-size:18pt;font-weight:bold;">${p.dateCompleted}</span>
      </div>
    </div>
  </div>
  <div style="font-style:italic;font-size:7.5pt;line-height:1.4;border-top:1px solid #000;padding-top:5px;margin-bottom:4px;">* The Monthly Maintenance Record (MMR) is FedEx&#8217;s systematic method of obtaining vehicle maintenance records for service provider-owned vehicles in compliance with the Federal Motor Carrier Safety Regulations which require motor carriers to have a systematic method of causing vehicles operating under their motor carrier operating authority to be repaired and maintained. Therefore, if FedEx does not receive records for a vehicle by the 20th of the month following the month in which maintenance or repairs, were performed, packages will not be made available to this vehicle.</div>
  <div style="display:flex;justify-content:space-between;font-size:8pt;">
    <span>This form for service providers is accessed through mybizaccount.fedex.com</span>
    <span>Page 1 of 1</span>
  </div>
</div>`;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { vehicleIds: number[]; monthYear: string };
  const { vehicleIds, monthYear } = body;

  if (!vehicleIds?.length || !monthYear) {
    return NextResponse.json({ error: "Missing vehicleIds or monthYear" }, { status: 400 });
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(monthYear);
  if (!monthMatch) {
    return NextResponse.json({ error: "Invalid monthYear; expected YYYY-MM" }, { status: 400 });
  }

  const year = parseInt(monthMatch[1], 10);
  const monthNum = parseInt(monthMatch[2], 10);
  const firstDay = `${monthYear}-01`;
  const lastDay = new Date(year, monthNum, 0).toISOString().slice(0, 10);
  const orgId = session.organizationId;

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const companyName = org?.name ?? "MyGroundOps";

  const vehicleRows = await db
    .select({ id: vehicles.id, unitNumber: vehicles.unitNumber, mileage: vehicles.mileage, stationCode: locations.terminalId })
    .from(vehicles)
    .leftJoin(locations, eq(vehicles.locationId, locations.id))
    .where(and(eq(vehicles.organizationId, orgId), eq(vehicles.active, true)));

  const vehicleMap = new Map(vehicleRows.map((v) => [v.id, v]));

  const maintRows = await db
    .select({ vehicleId: vehicleMaintenanceRecords.vehicleId, serviceDate: vehicleMaintenanceRecords.serviceDate, description: vehicleMaintenanceRecords.description })
    .from(vehicleMaintenanceRecords)
    .where(and(eq(vehicleMaintenanceRecords.organizationId, orgId), gte(vehicleMaintenanceRecords.serviceDate, firstDay), lte(vehicleMaintenanceRecords.serviceDate, lastDay)))
    .orderBy(vehicleMaintenanceRecords.serviceDate);

  const maintByVehicle = new Map<number, { serviceDate: string; description: string }[]>();
  for (const r of maintRows) {
    if (r.vehicleId === null) continue;
    const list = maintByVehicle.get(r.vehicleId) ?? [];
    list.push({ serviceDate: r.serviceDate, description: r.description });
    maintByVehicle.set(r.vehicleId, list);
  }

  const monthLabel = `${MONTH_NAMES[monthNum - 1]} of ${year}`;
  const dateCompleted = todayMDY();
  const pages: string[] = [];
  const generationEntries: { vehicleId: number; monthYear: string; mileageSnapshot: string; maintenanceRowCount: number }[] = [];

  for (const vehicleId of vehicleIds) {
    const v = vehicleMap.get(vehicleId);
    if (!v) continue;
    const rows = maintByVehicle.get(vehicleId) ?? [];
    const dataRows = rows.map((r) => {
      const d = new Date(r.serviceDate + "T00:00:00");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `<tr><td style="border:1px solid #000;padding:3px 6px;font-size:9pt;height:18px;">${mm}/${dd}/${d.getFullYear()}</td><td style="border:1px solid #000;padding:3px 6px;font-size:9pt;height:18px;">${r.description}</td></tr>`;
    });
    const padCount = Math.max(0, 5 - dataRows.length);
    const padRows = Array(padCount).fill(`<tr><td style="border:1px solid #000;padding:3px 6px;font-size:9pt;height:18px;">&nbsp;</td><td style="border:1px solid #000;padding:3px 6px;font-size:9pt;height:18px;">&nbsp;</td></tr>`);
    const mileageStr = v.mileage ? v.mileage.toLocaleString("en-US") : "N/A";
    pages.push(generateVehiclePage({ unit: v.unitNumber, station: v.stationCode ?? "", mileage: mileageStr, companyName, monthLabel, dateCompleted, hasRows: rows.length > 0, tableRows: [...dataRows, ...padRows].join("") }));
    generationEntries.push({ vehicleId, monthYear, mileageSnapshot: mileageStr, maintenanceRowCount: rows.length });
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0;padding:0;}@page{size:letter;margin:0;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}</style></head><body>${pages.join("")}</body></html>`;

  const browser = await getBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({ format: "Letter", landscape: false, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    await recordMmrGeneration(generationEntries).catch(console.error);
    const isSingle = vehicleIds.length === 1;
    const unitLabel = isSingle ? (vehicleMap.get(vehicleIds[0])?.unitNumber ?? "vehicle") : "All";
    const filename = isSingle ? `MMR_${unitLabel}_${monthYear}.pdf` : `MMR_${monthYear}_All.pdf`;
    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
    });
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/api/mmr-pdf/route.ts
git commit -m "feat: replace MMR PDF route with POST multi-vehicle merged PDF from DB"
```

---

### Task 4: Dashboard page + client UI

**Files:**
- Modify: `app/dashboard/mmr/page.tsx`
- Replace: `app/dashboard/mmr/mmr-client.tsx`

**Interfaces:**
- Consumes: `getVehiclesForMmrDashboard`, `getOrgName`, `VehicleMmrRow` from `lib/actions/mmr.ts`
- `page.tsx` passes `{ initialVehicles: VehicleMmrRow[], defaultMonth: string, orgName: string }` to `MmrClient`

- [ ] **Step 1: Replace `app/dashboard/mmr/page.tsx`**

```typescript
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import MmrClient from "./mmr-client";
import { getVehiclesForMmrDashboard, getOrgName } from "@/lib/actions/mmr";

export const metadata: Metadata = { title: "MMR Generator" };

function getPreviousMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export default async function MmrPage() {
  const defaultMonth = getPreviousMonth();
  const [initialVehicles, orgName] = await Promise.all([
    getVehiclesForMmrDashboard(defaultMonth),
    getOrgName(),
  ]);
  return (
    <AppShell>
      <MmrClient initialVehicles={initialVehicles} defaultMonth={defaultMonth} orgName={orgName} />
    </AppShell>
  );
}
```

- [ ] **Step 2: Replace `app/dashboard/mmr/mmr-client.tsx`**

```typescript
"use client";

import { useState, useCallback } from "react";
import { Loader2, FileDown, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import type { VehicleMmrRow } from "@/lib/actions/mmr";

function getPreviousMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function formatTimestamp(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function MmrClient({
  initialVehicles,
  defaultMonth,
  orgName,
}: {
  initialVehicles: VehicleMmrRow[];
  defaultMonth: string;
  orgName: string;
}) {
  const [month, setMonth] = useState(defaultMonth);
  const [vehicles, setVehicles] = useState<VehicleMmrRow[]>(initialVehicles);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingSingle, setGeneratingSingle] = useState<number | null>(null);
  const maxMonth = getPreviousMonth();

  const loadMonth = useCallback(async (m: string) => {
    setLoadingMonth(true);
    try {
      const res = await fetch(`/api/mmr-vehicles?month=${m}`);
      if (res.ok) setVehicles(await res.json());
    } finally {
      setLoadingMonth(false);
    }
  }, []);

  function handleMonthChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val > maxMonth) return;
    setMonth(val);
    loadMonth(val);
  }

  async function generatePdf(vehicleIds: number[]) {
    const res = await fetch("/api/mmr-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleIds, monthYear: month }),
    });
    if (!res.ok) throw new Error("PDF generation failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = vehicleIds.length === 1
      ? `MMR_${vehicles.find(v => v.id === vehicleIds[0])?.unitNumber ?? "vehicle"}_${month}.pdf`
      : `MMR_${month}_All.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    await loadMonth(month);
  }

  async function handleGenerateAll() {
    setGeneratingAll(true);
    try { await generatePdf(vehicles.map((v) => v.id)); }
    catch (e) { console.error(e); }
    finally { setGeneratingAll(false); }
  }

  async function handleGenerateSingle(v: VehicleMmrRow) {
    setGeneratingSingle(v.id);
    try { await generatePdf([v.id]); }
    catch (e) { console.error(e); }
    finally { setGeneratingSingle(null); }
  }

  const generatedCount = vehicles.filter((v) => v.lastGenerated !== null).length;
  const pendingCount = vehicles.length - generatedCount;

  return (
    <main className="flex-1 px-6 py-8 max-w-[900px] w-full mx-auto">
      <div className="mb-6">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">MyGroundOps · Fleet</p>
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none mb-1">MMR Generator</h1>
        <p className="text-[13px] text-slate-500">{orgName} · MGBA-355 Monthly Maintenance Records</p>
      </div>

      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Month</label>
          <input
            type="month"
            value={month}
            max={maxMonth}
            onChange={handleMonthChange}
            className="px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white"
          />
        </div>
        <div className="flex items-center gap-3 ml-auto flex-wrap">
          <span className="text-[12px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            {generatedCount} generated
          </span>
          <span className="text-[12px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            {pendingCount} pending
          </span>
          <button
            onClick={handleGenerateAll}
            disabled={generatingAll || loadingMonth || vehicles.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-[13px] font-semibold hover:bg-slate-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generatingAll
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : <><FileDown className="w-4 h-4" /> Generate All ({vehicles.length})</>
            }
          </button>
        </div>
      </div>

      {loadingMonth ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-[14px]">No active vehicles found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {vehicles.map((v) => {
            const isGenerated = v.lastGenerated !== null;
            const isBusy = generatingSingle === v.id;
            return (
              <div key={v.id} className={`bg-white rounded-2xl border p-4 flex flex-col gap-3 ${isGenerated ? "border-emerald-200" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[22px] font-extrabold text-slate-900 leading-none">{v.unitNumber}</p>
                    {v.stationCode
                      ? <p className="text-[11px] text-slate-400 mt-0.5">Station {v.stationCode}</p>
                      : <p className="text-[11px] text-amber-500 mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> No station assigned</p>
                    }
                  </div>
                  {isGenerated
                    ? <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0"><CheckCircle2 className="w-3 h-3" /> Generated</span>
                    : <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0"><Clock className="w-3 h-3" /> Pending</span>
                  }
                </div>
                <p className="text-[12px] text-slate-500">
                  {v.maintenanceCount > 0
                    ? `${v.maintenanceCount} maintenance entr${v.maintenanceCount === 1 ? "y" : "ies"} this month`
                    : "No maintenance records this month"}
                </p>
                {isGenerated && (
                  <p className="text-[11px] text-slate-400">Generated {formatTimestamp(v.lastGenerated)}</p>
                )}
                <button
                  onClick={() => handleGenerateSingle(v)}
                  disabled={isBusy || generatingAll}
                  className="mt-auto flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isBusy
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                    : <><FileDown className="w-3.5 h-3.5" /> Generate</>
                  }
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-[12px] text-slate-500">
        <span className="font-semibold text-slate-600">Submit by:</span> 20th of the following month.
        Maintenance entries pulled from the maintenance tracker. Update vehicle mileage in Fleet settings before generating.
        Assign vehicles to locations in Fleet settings to populate station codes.
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/mmr/page.tsx app/dashboard/mmr/mmr-client.tsx
git commit -m "feat: MMR dashboard — vehicle grid, month picker, Generate All, completion status"
```

---

### Task 5: Add `/api/mmr-vehicles` route + delete dead code

**Files:**
- Create: `app/api/mmr-vehicles/route.ts`
- Delete: `lib/mmr-data.ts`
- Delete: `scripts/mmr-calibrate.mjs` (only if it imports from `lib/mmr-data.ts`)

**Interfaces:**
- GET `/api/mmr-vehicles?month=YYYY-MM` → `VehicleMmrRow[]` JSON
- Consumed by `loadMonth()` in `mmr-client.tsx`

- [ ] **Step 1: Create `app/api/mmr-vehicles/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getVehiclesForMmrDashboard } from "@/lib/actions/mmr";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month; expected YYYY-MM" }, { status: 400 });
  }

  // Block current and future months
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const maxMonth = d.toISOString().slice(0, 7);
  if (month > maxMonth) {
    return NextResponse.json({ error: "Cannot generate for current or future months" }, { status: 400 });
  }

  const vehicles = await getVehiclesForMmrDashboard(month);
  return NextResponse.json(vehicles);
}
```

- [ ] **Step 2: Delete dead files**

```bash
git rm lib/mmr-data.ts
```

Check if `scripts/mmr-calibrate.mjs` imports `lib/mmr-data.ts`:
```bash
grep -l "mmr-data" scripts/mmr-calibrate.mjs 2>/dev/null && git rm scripts/mmr-calibrate.mjs || echo "no mmr-data import in calibrate script"
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. If `mmr-data.ts` was imported anywhere else, fix those imports now.

- [ ] **Step 4: Commit**

```bash
git add app/api/mmr-vehicles/route.ts
git commit -m "feat: add mmr-vehicles API, remove dead mmr-data.ts"
```

---

## Self-Review

**Spec coverage:**
- ✅ Previous month default — `getPreviousMonth()` in page.tsx and client
- ✅ Any past month, no future — `max={maxMonth}` on input + server validation in API
- ✅ Vehicle grid with status — card grid in mmr-client.tsx
- ✅ Generated / Pending badges — `lastGenerated !== null` check
- ✅ Generate All → merged PDF — POST /api/mmr-pdf with all vehicle IDs
- ✅ Per-vehicle generate — `handleGenerateSingle()`
- ✅ Completion tracking — `mmr_generations` upsert in `recordMmrGeneration`
- ✅ Maintenance from DB — `vehicleMaintenanceRecords` queried in route.ts
- ✅ Station from `locations.terminalId` — joined in actions and route
- ✅ Company name from `organizations.name` — fetched in route.ts
- ✅ Checkbox logic — top Yes/No based on `hasRows`, bottom always No, declaration always checked
- ✅ Excel dependency removed — `lib/mmr-data.ts` deleted in Task 5
- ✅ "No station" warning on card — AlertTriangle shown when `stationCode` is null

**Placeholder scan:** None.

**Type consistency:** `VehicleMmrRow` defined in `lib/actions/mmr.ts`, imported in page.tsx and mmr-client.tsx. `recordMmrGeneration` signature matches call in route.ts.
