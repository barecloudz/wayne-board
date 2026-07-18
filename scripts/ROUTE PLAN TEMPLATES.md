# ROUTE PLAN TEMPLATES — Wayne Board
### How anchor area assignments work per day per staffing level

---

## THE PROBLEM WITH THE CURRENT APPROACH

`sync-and-run.mjs` tries to calculate anchor area assignments from scratch every night:
- Takes `driverCount` as an argument
- Merges/splits routes based on centroid distances
- Does border-only balancing

This is too fragile because:
1. It doesn't know YOUR intent — it guesses which areas belong together
2. It can't account for Monday vs Saturday geography (different routes, different anchor area configs)
3. When staffing changes, it may merge the wrong routes together
4. One wrong parameter or edge case → drivers are all over the place

**The fix: You define the templates. The system executes them.**

---

## THE SOLUTION: TEMPLATE-BASED ROUTING

### What a template is

A template = a saved configuration that answers:
"When we have N drivers on [day of week], which anchor areas go on which truck?"

Examples:
- "Saturday — 8 drivers" → ASHE HWY areas on Truck 1, GREEN HWY on Truck 2, etc.
- "Monday — 9 drivers" → Same zones but split differently (Mon has more volume)
- "Monday — 11 drivers" → Heavy staffing; each truck has fewer anchor areas

You build these templates once in the Wayne Board map UI. From then on, the system just reads
the template and pushes it to DRO — no guessing, no geometry calculations, no surprises.

---

## DATA MODEL

### `route_templates` table
One row per configuration:
```sql
CREATE TABLE route_templates (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,           -- "Saturday 8-driver", "Monday 9-driver"
  day_of_week  TEXT,                    -- "mon","tue","wed","thu","fri","sat","sun" or NULL (any)
  driver_count INTEGER NOT NULL,        -- how many drivers this covers
  dro_plan_id  INTEGER,                 -- which DRO route plan ID to use
  dro_plan_name TEXT,                   -- e.g. "sat 7", "mon 9"
  notes        TEXT,
  is_default   BOOLEAN DEFAULT false,   -- the one to auto-load for this day+count
  created_at   TIMESTAMP DEFAULT NOW()
);
```

### `route_template_areas` table
One row per anchor area per template:
```sql
CREATE TABLE route_template_areas (
  id               SERIAL PRIMARY KEY,
  template_id      INTEGER REFERENCES route_templates(id) ON DELETE CASCADE,
  work_area_number TEXT NOT NULL,        -- e.g. "0255" — stable DRO identifier
  anchor_name      TEXT NOT NULL,        -- e.g. "ASHE HWY" — human readable
  route_slot       INTEGER NOT NULL,     -- which truck (1, 2, 3... up to driver_count)
  route_label      TEXT,                 -- optional display name, e.g. "ASHE HWY MAIN"
  stop_count_est   INTEGER,              -- estimated stops (from last sync, informational)
  UNIQUE (template_id, work_area_number)
);
```

### How route_slot maps to DRO
- `route_slot = 1` → Vehicle 1 in the DRO plan (the first workAreaNumber in the plan)
- The DRO plan already has vehicles with workAreaNumbers
- When we push: for each anchor area, call `transferRoute` to move it to the right vehicle

---

## THE MAP UI

**Location:** `/wayne-board/route-planner` (new page)

**What it shows:**
- Map with all anchor area polygons drawn (from `dro_anchor_areas.wkt_poly`)
- Each polygon colored by route_slot (10 distinct colors)
- Driver name labels on each zone
- Stop count per route shown in a sidebar

**What you can do:**
- Click an anchor area → a popup shows its current route, estimated stops
- Drag an anchor area from one color zone to another → reassigns it in the template
- Or use a panel: "Move [anchor area] from Route 3 → Route 5"
- See live stop count updates as you move areas

**Template controls:**
- Dropdown: "Which template am I editing?" — "Saturday 8-driver", "Monday 9-driver", etc.
- "Create new template" button — clones an existing one to start from
- "Save template" — writes changes to DB
- "Push to DRO" — sends this template's assignments to DRO right now
- "Set as default for [day]" — marks this as the auto-load template

---

## HOW DIFFERENT DAYS WORK

### Monday
- Usually 9-12 drivers (more volume, more routes)
- Different DRO plan: `mon 9` or `mon 11`
- Some anchor areas that merge on Saturday get their own truck on Monday

### Saturday
- Usually 8 drivers
- DRO plan: `sat 7` (or `sat 8` etc.)
- Some areas that have separate trucks Mon-Fri merge onto one truck Saturday

### The right way to handle this
1. Pull all DRO plans into Wayne Board (already done — `dro_route_plans` table)
2. For each plan, create a template that maps anchor areas → route_slots
3. Tag each template with which day(s) it's for and how many drivers

When Wayne Board runs automation at 11 PM:
- Check what day tomorrow is
- Check how many drivers are scheduled
- Find the matching template (or the closest one)
- Push those anchor area assignments to DRO
- Trigger solve

---

## BUILDING THE TEMPLATES — ONE-TIME SETUP

### Step 1: Pull anchor areas from DRO for each plan
We already have anchor areas in `dro_anchor_areas`. But we need to know which anchor areas
belong to which DRO plan, and what workAreaNumber → vehicle mapping exists in each plan.

```
GET /api/api/service-areas/3060743/route-plans/{planId}/advanced-vehicle-set
```

This returns all vehicles in a plan with their `workAreaNumber` and assigned anchor areas.

### Step 2: Seed the initial templates
Run a script that:
1. Pulls the advanced-vehicle-set for each of our DRO plans (sat 7, mon 9, etc.)
2. Creates a template for each
3. Populates route_template_areas from the current DRO assignments

This seeds the templates with whatever DRO currently has. Blake then adjusts in the UI.

### Step 3: Blake refines in the UI
- Opens the map for "Saturday 8-driver"
- Moves anchor areas between trucks to match how he actually wants it
- Saves

That's the master template for that configuration. Every Saturday with 8 drivers, this is what runs.

---

## WHEN STAFFING CHANGES

### Example: Normal Saturday is 8 drivers. One calls out. Now 7.
Two options:

**Option A — Manual adjust:**
- Wayne Board detects 7 scheduled for Saturday
- Shows: "No exact template for Saturday 7-driver. Closest: Saturday 8-driver."
- Opens the 8-driver template in the map UI
- Highlights the absent driver's zones in red
- Blake drags those anchor areas to neighboring routes
- Clicks "Push to DRO" → done

**Option B — Auto-redistribute (future):**
- Wayne Board detects 7 drivers
- Automatically moves the absent driver's anchor areas to geographic neighbors
- Respects the rule: only move areas to the closest neighboring zone
- Shows Blake a preview: "Here's the proposed redistribution" with a diff view
- Blake confirms → push to DRO

---

## HOW THIS CONNECTS TO SYNC-AND-RUN

`sync-and-run.mjs` will be refactored to:
1. Accept a `templateId` instead of just `driverCount`
2. Load the template from the DB instead of guessing
3. Push the template's anchor area assignments via `transferRoute`
4. Still run OSRM sequencing within each route (that part is good)
5. Still trigger the solve

The geographic calculation logic (merging by centroid, border balancing) gets REPLACED by the template system. The template IS the geography. No more guessing.

The only time geographic calculations run is in Option B above (auto-redistribute when
someone calls out) — and even then, it's moving whole anchor areas, never splitting them.

---

## WHAT TO BUILD (IN ORDER)

1. **DB migration:** `route_templates` + `route_template_areas` tables
2. **Seed script:** pulls DRO advanced-vehicle-set for each plan → creates initial templates
3. **API endpoints:**
   - `GET /api/route-templates` — list all templates
   - `GET /api/route-templates/:id/areas` — get anchor area assignments
   - `PUT /api/route-templates/:id/areas` — save changes
   - `POST /api/route-templates/:id/push-to-dro` — execute: push to DRO + trigger solve
4. **Map UI page** at `/wayne-board/route-planner`:
   - Leaflet map with anchor area polygons
   - Color by route_slot
   - Click/drag to reassign
   - Sidebar with stop counts
5. **Nightly cron:** reads the matching template + pushes automatically
6. **Call-out handling:** when a driver is absent, flag their zones for manual reassignment

---

## RULES THAT NEVER CHANGE

No matter what system runs:
1. **Never split an anchor area.** An anchor area is always one unit. You move the whole thing or nothing.
2. **Geographic integrity first.** A driver's route must be geographically contiguous — one zone of the map, not scattered pieces.
3. **Zirconia is always isolated.** Never absorb Zirconia anchor areas into another route. It is remote and must stay together.
4. **The template is the truth.** Don't recalculate from scratch. Execute the template. Recalculate only when Blake explicitly asks.

---

## WHAT THE UI WILL LOOK LIKE

```
┌─────────────────────────────────────────────────────────────────┐
│  ROUTE PLANNER           Template: [Saturday — 8 drivers ▾]    │
│                                    [Edit] [Push to DRO] [Save]  │
├──────────────────────────────────────┬──────────────────────────┤
│                                      │ Route Summary             │
│         [MAP — anchor area           │                           │
│          polygons colored by         │ 🟦 Truck 1 — James       │
│          route, click to select,     │    ASHE HWY (3 areas)    │
│          drag to reassign]           │    Est. 98 stops          │
│                                      │                           │
│                                      │ 🟩 Truck 2 — Travis      │
│                                      │    GREEN HWY (2 areas)   │
│                                      │    Est. 91 stops          │
│                                      │                           │
│                                      │ 🟥 Truck 3 — Marcus      │
│                                      │    SUGARLOAF (4 areas)   │
│                                      │    Est. 105 stops ⚠️     │
│                                      │                           │
│                                      │ [Move area from 3 → 2]   │
└──────────────────────────────────────┴──────────────────────────┘
```

The ⚠️ flags routes that are over/under the average by more than 15%.

---

## RELATIONSHIP TO DRO

Wayne Board does NOT try to replace DRO. DRO is the solver — it finds the optimal stop sequence within each route. Wayne Board controls WHICH stops are on WHICH route. That's it.

```
Wayne Board (which stops go where)
        ↓  transferRoute API
DRO (sequences the stops optimally within each route)
        ↓  solve
GroundCloud (shows drivers their stops in order)
```
