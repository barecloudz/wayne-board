# DAILY OPERATIONS MASTER PLAN
### How Wayne Board Runs the Entire Morning Automatically

---

## THE VISION — ZERO MANUAL STEPS

Right now every morning Blake has to:
1. Open DRO and manually cut routes
2. Open GroundCloud and manually assign each driver to their route
3. Hope SID stickers match the sequence GroundCloud shows drivers

**The goal: Blake sets the schedule in Wayne Board. Everything else happens automatically.**

```
Blake sets schedule → Wayne Board cuts routes in DRO → DRO solves & sequences →
Wayne Board assigns drivers in GroundCloud → Drivers see their stops in order →
SID stickers match what drivers see
```

---

## PIECE 1: HOW WE PLAN ROUTES EACH DAY

### The Problem With One Big Anchor Area Per Route
Right now each truck has one large anchor area (e.g., "ASHE HWY" covers a dozen sub-zones). This works but is coarse — you can't easily move partial workload between neighboring trucks without going into DRO and manually changing anchor areas.

### The Solution: Two-Level Area System

**Level 1 — Service Zones (small, 20-50 stops each)**
Break every anchor area into smaller sub-zones. Think of these like city blocks or neighborhoods. Each sub-zone has a fixed geographic polygon and roughly the same number of stops.

Example — ASHE HWY anchor area today has 12 sub-anchor-areas. Keep those as-is. They already exist in DRO. Those ARE the small zones.

**Level 2 — Route Assignments (which truck covers which zones today)**
Each route = a collection of zones. This is what changes day to day based on:
- How many drivers showed up
- Driver speed profiles (fast drivers get more zones)
- Call-outs (someone didn't show — redistribute their zones to neighbors)

### How It Works Each Day

1. **Wayne Board knows who's working** (from the schedule)
2. **For each active driver**, look at their `gc_driver_profiles.avg_sph_30d`
3. **Calculate zone assignments:**
   - Total stops ÷ total "driver-capacity" = target stops per capacity unit
   - Fast driver (12 sph) gets zones totaling ~120 stops
   - Slow driver (8 sph) gets zones totaling ~80 stops
   - Everyone should finish at roughly the same time
4. **Zones stay geographically contiguous** — you never split a zone, you move whole zones between neighboring routes
5. **Push to DRO** via `sync-and-run.mjs` (or the app wizard)

### What Happens When Someone Calls Out
- Their zones need to be absorbed by neighboring routes
- Wayne Board detects the gap (driver was scheduled but not checked in by X time, or manually marked absent)
- Redistributes their zones to the closest geographic neighbors
- Reruns the DRO push and solve
- Can be done right up until sort time

---

## PIECE 2: SID STICKERS AND STOP SEQUENCE

### What SID Stickers Are
Every package at the station gets a SID (Sequence ID) sticker. The SID number tells the sorter exactly which shelf/cart to put the box on. Drivers load their truck in SID order so the FIRST stop is at the FRONT of the truck.

### The Current Problem
DRO sequences the stops optimally (road-distance efficient). But GroundCloud may show stops in a different order. If the sequence DRO computed doesn't match what the driver sees on their GroundCloud device, drivers are hunting through the truck for boxes out of order.

### How It Should Work

```
DRO solves → produces ordered stop list (stop 1, stop 2, stop 3...)
         ↓
That sequence = the SID sequence
         ↓
Boxes sorted at station in that order (SID 001, 002, 003...)
         ↓
GroundCloud shows stops in SAME order
         ↓
Driver loads truck front-to-back in delivery order
Driver delivers stop 1 (front of truck) → stop 2 → stop 3 (back)
```

### How We Get GroundCloud to Match DRO Sequence

**Option A (if GroundCloud already reads from FedEx manifest):**
DRO's solve outputs a sequence → this feeds FedEx's internal manifest system → manifest generates SIDs → GroundCloud reads the manifest → stops appear in manifest order. If this is already happening, we just need to make sure DRO's solve runs early enough.

**Option B (we push sequence to GroundCloud via API):**
After DRO solves, we read the sequence back from DRO, then call GroundCloud's API to set the stop order on each route. GroundCloud's stops have a sequence/order field — we can set it.

**What we need to figure out:**
- Does GroundCloud auto-import stop sequence from the FedEx manifest, or does it set its own order?
- Is there a GroundCloud API endpoint to reorder stops on a route?
- What triggers SID generation — is it DRO, or FedEx's manifest system, or something else?

**Action:** Run a probe script against the GroundCloud API to find stop-ordering endpoints.

---

## PIECE 3: AUTO-ASSIGNING DRIVERS TO ROUTES IN GROUNDCLOUD

### The Current Manual Step
Every morning Blake opens GroundCloud and clicks:
- Route "742 ASHE HWY" → assign Driver "John Smith"
- Route "742 GREEN HWY" → assign Driver "Maria Lopez"
- etc.

This is 8-13 clicks minimum, every single morning.

### How Wayne Board Will Do It Automatically

**The data we have:**
- Wayne Board schedule: who is working today, what route/area they're assigned to
- GroundCloud API: `/api/routes/` returns all routes with their IDs
- GroundCloud API: `/api/drivers/` returns all drivers with their IDs

**The flow:**
1. Wayne Board checks the schedule for today
2. For each scheduled driver → look up their GroundCloud driver ID (we store this in our DB)
3. For each route they're assigned → look up GroundCloud route ID
4. Call GroundCloud API to assign driver to route for today

**The API call we need to find:**
We need to discover the GroundCloud endpoint that does: "For route X, set driver to Y for date Z."
Looking at what we know, it's likely one of:
- `PATCH /api/routes/{id}/` with `driver` field
- `POST /api/route-days/` to create a route-day assignment
- `PATCH /api/route-days/{id}/` to update an existing assignment

**We already know:**
- Route-days (`/api/route-days/`) have a `driver` field
- They have a `day` field (the date)
- GroundCloud probably creates route-day records automatically from the manifest

**Action:** Probe the GroundCloud API to find the assignment endpoint. Try PATCH on a route-day with a different driver and see if it sticks.

### The Trigger
Auto-assignment should run at a fixed time each morning (e.g., 5:00 AM) — after the schedule is set but before drivers arrive.

Or: it runs when Blake clicks "Dispatch Today" in Wayne Board.

---

## PIECE 4: THE COMPLETE DAILY TIMELINE

These are two completely separate operations that happen at different times of day.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE NIGHT BEFORE  →  DRO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  10:00 PM  FedEx publishes tomorrow's manifest (package count finalized)
  10:30 PM  DRO sort date becomes available
  11:00 PM  Wayne Board auto-runs sync-and-run.mjs:
              → Looks at tomorrow's schedule (who is working, which areas)
              → Pulls waypoints from DRO
              → Assigns stops to routes by anchor area + driver capacity
              → Pushes transferRoute for each route
              → Triggers DRO solve — stop sequence is locked in
              → SID sticker order is determined here

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE MORNING OF  →  GROUNDCLOUD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  5:00 AM   Drivers begin arriving at station
  5:15 AM   Wayne Board checks final schedule
              → Any call-outs? Flag them for Blake to confirm
              → If confirmed absent: Wayne Board redistributes zones,
                re-runs DRO push + solve (still time before sort)
  5:30 AM   Wayne Board auto-assigns drivers to routes in GroundCloud
              → Schedule says John is on ASHE HWY today
              → Wayne Board calls GroundCloud API: John → ASHE HWY route
              → Repeat for all drivers
              → Drivers open GroundCloud on their phones and see their stops
  6:00 AM   Sort begins
              → SID stickers already printed and placed (from last night's DRO solve)
              → GroundCloud stop order matches SID order
              → Drivers load trucks front-to-back in delivery sequence
  7:00 AM   Dispatch — everyone leaves on their route
```

---

## PIECE 5: THE ANCHOR AREA QUESTION

### Should We Build New Smaller Anchor Areas?

**Current state:** We have ~70 anchor areas in DRO across 8 routes. Each route has 8-14 anchor areas. These are already the "small zones."

**The answer:** We probably don't need to create new anchor areas. What we need is:

1. **A mapping in our DB** of anchor area → "natural group" (which route it defaults to)
2. **Flexibility to reassign** anchor areas between routes day-to-day based on driver count and capacity

**What this looks like in Wayne Board:**
- A drag-and-drop map view showing anchor areas as colored polygons
- Each polygon can be dragged from one route to another
- Wayne Board recalculates stop counts and estimated finish times in real time
- When you're happy: hit "Push to DRO" and it calls `transferRoute` for each affected area

**For call-outs:** Wayne Board automatically suggests which anchor areas from the absent driver's route should move to which neighbors (by geographic proximity + current load).

---

## PIECE 6: WHAT WE NEED TO BUILD (IN ORDER)

### Now — Foundation
- [ ] `scripts/sync-gc-driver-days.mjs` — pull daily GroundCloud data into DB
- [ ] DB table: `gc_driver_days`
- [ ] `scripts/backfill-gc-history.mjs` — 90 days of history
- [ ] DB table: `gc_driver_profiles`
- [ ] `scripts/build-driver-profiles.mjs` — calculate driver speed profiles

### Next — GroundCloud Assignment
- [ ] Probe script to discover the GroundCloud driver-assignment API endpoint
- [ ] DB table: `gc_driver_map` — maps our driver names to GroundCloud driver IDs
- [ ] DB table: `gc_route_map` — maps our route names to GroundCloud route IDs
- [ ] `scripts/assign-gc-drivers.mjs` — assigns drivers to routes in GroundCloud
- [ ] Wayne Board cron: run assignment at 5 AM daily

### Then — Intelligent Route Cutting
- [ ] Pull driver profiles into `sync-and-run.mjs` — adjust target stops per driver by sph
- [ ] Call-out detection: Wayne Board flags scheduled drivers who haven't checked in
- [ ] Auto-rebalance: when a driver is absent, redistribute their anchor areas

### Then — SID / Sequence Alignment
- [ ] Research: how does DRO sequence flow into FedEx manifest → GroundCloud?
- [ ] If gap exists: build a sequence-push step to GroundCloud after DRO solve
- [ ] Verify SID order matches GroundCloud stop order for a test route

### Finally — The Map UI in Wayne Board
- [ ] Anchor area polygon map (like DRO's map but in our app)
- [ ] Drag-and-drop anchor areas between routes
- [ ] Live stop count + estimated finish time per route
- [ ] "Push to DRO" button
- [ ] Driver assignment panel: schedule → route → GroundCloud in one click

---

## THE BIG PICTURE

Wayne Board becomes the **single control panel** for the entire morning operation:

1. **Schedule** — set it once, Wayne Board knows who's working
2. **Route cutting** — automatic based on schedule + driver profiles + geographic zones
3. **Driver assignment** — automatic in both DRO and GroundCloud
4. **Stop sequencing** — automatic, SIDs match what drivers see
5. **Call-out handling** — automatic rebalance with one confirmation click
6. **Performance tracking** — every day's data feeds back into driver profiles

Someone looking at this app for the first time should see a live map with all the routes colored by driver, stop counts updating in real time, driver profiles showing who's fast and who needs coaching, and a single "Run Today's Routes" button that does everything.

**That is the app that amazes people.**
