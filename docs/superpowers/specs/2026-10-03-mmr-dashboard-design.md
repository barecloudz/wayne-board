# MMR Dashboard Design Spec

**Goal:** Replace the single-vehicle MMR form with a dashboard that shows all vehicles for a selected month, tracks which ones have been generated, and produces a single merged PDF for all vehicles in one click.

**Date:** 2026-10-03

---

## Problem

- Only one vehicle at a time; no way to see what's been done
- Month defaults to current month (October) but you're filing September's records
- Station codes are hardcoded; company name is hardcoded
- Maintenance rows pulled from Excel file — should come from DB
- No completion tracking

---

## Workflow (post-build)

1. Open `/dashboard/mmr`
2. Month defaults to **previous calendar month** (e.g. September when it's October)
3. See a grid of all active vehicles — each card shows: unit #, station, # maintenance entries that month, status badge (Generated ✓ / Pending)
4. Click **Generate All** → single merged PDF containing one MGBA-355 page per vehicle, downloaded immediately
5. All vehicle cards flip to Generated ✓
6. Can re-generate any time — status reflects most recent generation

---

## Data Model

### `locations` table — add column
- `station_code` (text, nullable) — e.g. "0259", "0267"

### New `mmr_generations` table
| column | type | notes |
|---|---|---|
| id | serial PK | |
| organization_id | int FK | |
| vehicle_id | int FK → vehicles.id | |
| month_year | text | "YYYY-MM" |
| mileage_snapshot | text | mileage string used in the PDF |
| maintenance_row_count | int | number of entries in the PDF |
| generated_by | text | driverId of admin |
| generated_at | timestamp | |

One row per vehicle per month. Re-generating **upserts** (updates existing row) so each vehicle/month shows one clean status.

---

## PDF Rules

### Checkbox logic
| Situation | Top checkbox ("repairs performed?") | Bottom checkbox ("out of service?") |
|---|---|---|
| Maintenance records exist for that vehicle+month | ✅ Yes | ☐ No |
| No maintenance records | ☐ No | ☐ No |

**Declaration checkbox** (above signature): always ✅ checked, no conditions.

### Field sources
| Field | Source |
|---|---|
| Company name | `organizations.name` |
| Station | `vehicles.locationId → locations.stationCode` |
| Unit # | `vehicles.unitNumber` |
| Mileage | `vehicles.mileage` (from vehicle profile) |
| Maintenance rows | `vehicleMaintenanceRecords` where vehicleId + month match |
| Month label | Selected month, e.g. "September of 2026" |
| Date completed | Today's date |
| Signature | Hardcoded "Blake Nardoni" for now |

### Merged PDF
- One MGBA-355 page per vehicle, concatenated into a single PDF
- Order: by unit number ascending
- Filename: `MMR_YYYY-MM_All.pdf`

---

## UI

### Month Selector
- Defaults to previous calendar month
- Allows selection of any past month (no future months)
- Changing month reloads vehicle grid with updated status + maintenance counts

### Vehicle Grid
Each card:
- Unit # (large)
- Station code (or "No station" warning if location has no station code)
- Maintenance entry count for that month
- Status badge: **Generated** (green, shows timestamp) / **Pending** (amber)
- Individual **Generate** button (single-vehicle PDF, for one-offs)

### Actions
- **Generate All** button (top of page) — merged PDF of all vehicles, marks all as generated
- Per-card **Generate** button — single-vehicle PDF, marks that vehicle as generated

### Settings
- Location settings page — add Station Code field per location
- Company name comes from org name (already in settings)

---

## API

### `POST /api/mmr-pdf`
Body: `{ vehicleIds: number[], monthYear: string }`
- Fetches vehicle + location + maintenance data from DB for each vehicle
- Generates one HTML page per vehicle
- Renders all pages via Puppeteer into a single PDF
- Upserts rows in `mmr_generations`
- Returns PDF binary stream

### Old `GET /api/mmr-pdf` — replaced by POST, removed

---

## Schema Migration

1. Add `station_code` (text, nullable) to `locations`
2. Create `mmr_generations` table
3. Remove Excel/`MAINTENANCE_TRACKER_PATH` dependency from `lib/mmr-data.ts`
4. Remove hardcoded `UNIT_CONFIGS` and `MILEAGE_LOOKUP` from `lib/mmr-data.ts`

---

## Out of Scope
- FedEx submission confirmation tracking
- Email delivery of PDF
- Per-vehicle mileage override at generate time (update mileage in Fleet before generating)
- Custom signature per org
