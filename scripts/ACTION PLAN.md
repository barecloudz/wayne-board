# WAYNE BOARD — ACTION PLAN
### Every step, in order, to make it all work together

---

## WHERE WE ARE RIGHT NOW

✅ Wayne Board app deployed (Netlify)
✅ DRO login + sync working
✅ sync-and-run.mjs cuts routes correctly
✅ GroundCloud API access working (login, route-days, drivers)
✅ Ryde scores partially built (driver portal)
✅ Driver scheduling system exists
✅ Postgres DB (Neon) running
✅ Driver portal (drivers log in and see their scores)

❌ No FedEx ID on driver records
❌ No GroundCloud driver auto-assignment
❌ No nightly DRO automation (still run manually)
❌ No GroundCloud data pipeline (no historical driver data in DB)
❌ No driver profiles / leaderboard
❌ No PPODA data
❌ No call-out handling

---

## PHASE 1 — THE FOUNDATION
### Add FedEx ID to every driver record
**Why first:** Everything else joins on this. Without it nothing talks to anything else.

**Steps:**
1. Add `fedex_id` column to the users/drivers table
   ```sql
   ALTER TABLE users ADD COLUMN fedex_id TEXT UNIQUE;
   ```
2. Pull GroundCloud driver list via API (`/api/drivers/`) — it has FedEx IDs
3. Build a one-time script that matches GC drivers to Wayne Board users by name → stores their `fedex_id` and `gc_driver_id`
4. Manually verify and fill any gaps (new drivers, name mismatches)

**Done when:** Every active driver in Wayne Board has a `fedex_id` and a `gc_driver_id`.

---

## PHASE 2 — GROUNDCLOUD DATA PIPELINE
### Pull historical driver performance into our DB
**Why second:** Driver profiles power route cutting AND the leaderboard. Need data before we can calculate anything.

**Steps:**
1. Create `gc_driver_days` table in DB
   ```sql
   CREATE TABLE gc_driver_days (
     id              SERIAL PRIMARY KEY,
     date            DATE NOT NULL,
     gc_route_day_id INTEGER NOT NULL UNIQUE,
     fedex_id        TEXT REFERENCES users(fedex_id),
     driver_name     TEXT NOT NULL,
     gc_driver_id    INTEGER,
     route_name      TEXT,
     stops_per_hour  NUMERIC,
     stops_delivered INTEGER,
     packages        INTEGER,
     miles_total     NUMERIC,
     drive_time_sec  INTEGER,
     status          TEXT,
     ils_impacts     INTEGER DEFAULT 0,
     missed          INTEGER DEFAULT 0,
     score           NUMERIC,
     raw_json        JSONB,
     synced_at       TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. Build `scripts/backfill-gc-history.mjs`
   - Loops last 90 days
   - Pulls route-days from GroundCloud for each date
   - Inserts into `gc_driver_days`
   - Run once to get the historical baseline

3. Build `scripts/sync-gc-driver-days.mjs`
   - Pulls yesterday's data only
   - Upserts into `gc_driver_days`
   - This runs every night automatically

4. Create API endpoint: `POST /api/cron/sync-gc` — triggers the nightly sync
   Add to Netlify scheduled functions to run at 11:45 PM every night

**Done when:** 90 days of driver data is in the DB and new data flows in automatically every night.

---

## PHASE 3 — DRIVER PROFILES
### Calculate performance metrics per driver
**Why third:** Profiles need the data from Phase 2 to exist first.

**Steps:**
1. Create `gc_driver_profiles` table
   ```sql
   CREATE TABLE gc_driver_profiles (
     fedex_id        TEXT PRIMARY KEY REFERENCES users(fedex_id),
     driver_name     TEXT,
     avg_sph_30d     NUMERIC,
     avg_sph_90d     NUMERIC,
     stddev_sph_30d  NUMERIC,
     avg_stops_30d   NUMERIC,
     avg_miles_30d   NUMERIC,
     completion_rate NUMERIC,
     days_worked_30d INTEGER,
     avg_ils_30d     NUMERIC,
     avg_score_30d   NUMERIC,
     sph_trend       TEXT,
     trend_delta     NUMERIC,
     best_sph        NUMERIC,
     worst_sph       NUMERIC,
     last_worked     DATE,
     profile_updated TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. Build `scripts/build-driver-profiles.mjs`
   - Reads `gc_driver_days`
   - Calculates all aggregates
   - Upserts `gc_driver_profiles`
   - Run after nightly sync completes

3. Add to nightly cron: after `sync-gc` runs, trigger `build-profiles`

4. Build API endpoint: `GET /api/drivers/profiles` — returns all profiles, used by leaderboard UI

**Done when:** Every driver has a live profile that updates nightly. SPH, completion rate, ILS rate, trend all calculated.

---

## PHASE 4 — ROUTE PLAN TEMPLATES + NIGHTLY DRO AUTOMATION
### Define anchor area assignments per plan, then automate execution
**Why this approach:** sync-and-run.mjs guesses geography every night from scratch — too fragile.
Templates let Blake define exactly which anchor areas go on which truck, once, per staffing config.

**See:** `scripts/ROUTE PLAN TEMPLATES.md` for full design doc.

**Steps:**
1. DB migration: `route_templates` + `route_template_areas` tables

2. Seed script: pull DRO advanced-vehicle-set for each plan (sat 7, mon 9, etc.)
   → creates initial templates from current DRO anchor area assignments

3. Map UI at `/wayne-board/route-planner`:
   - Anchor area polygons on a map, colored by truck
   - Click/drag to reassign areas between trucks
   - Sidebar: stop counts per route, warnings when over/under by 15%
   - "Push to DRO" button — executes the template right now
   - "Save as default for Saturday" etc.

4. API endpoints:
   - `GET /api/route-templates` — list templates
   - `PUT /api/route-templates/:id/areas` — save assignments
   - `POST /api/route-templates/:id/push-to-dro` — push + trigger solve

5. Refactor sync-and-run.mjs to accept a templateId:
   - Loads anchor area assignments from template (no more geometry guessing)
   - Still runs OSRM sequencing within each route
   - Still triggers DRO solve

6. Nightly cron at 11 PM:
   - Checks tomorrow's day + scheduled driver count
   - Finds matching template
   - Pushes to DRO + triggers solve

7. Call-out handling:
   - Driver marked absent → their anchor areas highlighted on map
   - Blake drags to neighbors → push

8. GroupMe or in-app notification when solve completes

**Rules that never break:**
- Never split an anchor area — move the whole thing or nothing
- Geographic integrity first — one contiguous zone per driver
- Zirconia always isolated — never absorb into another route
- Template is the truth — never recalculate from scratch mid-execution

**Done when:** Blake sets the template once per staffing configuration.
Every night at 11 PM, the right template runs automatically. One click handles call-outs.

---

## PHASE 5 — MORNING GROUNDCLOUD AUTO-ASSIGNMENT
### Drivers are assigned to routes in GroundCloud automatically
**Why fifth:** Needs Phase 1 (FedEx IDs + GC driver IDs) and Phase 4 (routes already cut) to be done first.

**Steps:**
1. Run probe script to discover the GroundCloud driver assignment endpoint
   - Get today's route-days from `/api/route-days/?day=TODAY`
   - Attempt `PATCH /api/route-days/{id}/` with `driver` field
   - Verify it sticks by reading back the route-day
   - Document the exact API call

2. Build `scripts/assign-gc-drivers.mjs`
   - Pulls today's schedule from Wayne Board DB
   - Gets today's GroundCloud route-days
   - Matches: scheduled driver (fedex_id) → gc_driver_id → route-day for their route
   - PATCHes each route-day with the correct driver
   - Logs success/fail per route

3. Build API endpoint: `POST /api/cron/assign-gc-drivers`
   - Wraps the above script
   - Add to Netlify scheduled function: run at 5:30 AM every morning

4. Add manual trigger in Wayne Board: "Assign Drivers in GroundCloud" button on the dispatch page — for when someone calls out and you reassign them manually first

5. Add call-out handling:
   - If a driver is marked absent in Wayne Board, their route-day gets assigned to "Unassigned" in GroundCloud
   - Wayne Board suggests which neighboring driver absorbs their stops
   - One click confirms and re-runs the DRO push for the affected routes

**Done when:** Every morning at 5:30 AM, GroundCloud automatically has every driver assigned to their route. Blake never manually assigns in GroundCloud again.

---

## PHASE 6 — LEADERBOARD & DRIVER PORTAL
### Show every driver exactly where they stand
**Why sixth:** Needs Phases 2 & 3 (data and profiles) to have real numbers.

**Steps:**
1. Extend the existing driver portal (`/wayne-board/driver` or similar)
   - Already shows Ryde scores
   - Add: SPH this month, SPH trend chart (last 30 days), rank on leaderboard, completion rate, ILS rate

2. Build management leaderboard page at `/wayne-board/performance`
   - Full table: all drivers ranked by overall score
   - Columns: Driver, SPH (30d), Ryde Score, PPODA (when available), Completion Rate, ILS/day, Trend
   - Filter by date range
   - Click a driver → see their full history chart

3. Build `GET /api/drivers/leaderboard`
   - Joins `gc_driver_profiles` + ryde scores + users table
   - Returns ranked list with all metrics
   - Calculates composite score (weighted: SPH 40%, Ryde 30%, PPODA 20%, Completion 10%)

4. Add PPODA when we find the source
   - Research: is PPODA in Spotlight? MyGroundBiz? FedEx contractor portal?
   - Once found: add to nightly sync, add column to profiles, add to leaderboard

**Done when:** Drivers open their portal and see their rank. Management sees the full leaderboard. Numbers update every day automatically.

---

## PHASE 7 — SID SEQUENCE ALIGNMENT
### Make sure GroundCloud stop order matches DRO's optimized sequence
**Why last:** Requires understanding how FedEx manifest → GroundCloud works first.

**Steps:**
1. Research: after DRO solve, does the sequence automatically flow into FedEx manifest?
   - Check if GroundCloud stop order already matches DRO after a solve
   - Compare DRO route summary sequence vs GroundCloud stop order for one route

2. If they already match: done. Document it and move on.

3. If they don't match:
   - After DRO solve completes, read the solved sequence from DRO
   - Find GroundCloud endpoint to set stop order on a route-day
   - Build a step in the nightly cron: after solve, push sequence to GroundCloud

4. Verify SID sticker order matches GroundCloud order end-to-end

**Done when:** Driver loads truck in SID order → delivers in GroundCloud order → no hunting for boxes.

---

## THE BUILD ORDER SUMMARY

```
Phase 1  — FedEx ID on drivers              (1-2 hours)
Phase 2  — GroundCloud data pipeline        (half day)
Phase 3  — Driver profiles                  (half day)
Phase 4  — Nightly DRO automation           (half day)
Phase 5  — Morning GC auto-assignment       (half day)
Phase 6  — Leaderboard UI                   (1-2 days)
Phase 7  — SID sequence alignment           (TBD — research first)
```

**Phases 1-5 = the operational automation.** After these, Wayne Board runs the entire morning operation with zero manual steps.

**Phase 6 = the product that amazes people.** Drivers competing on a leaderboard, management seeing everything in one place.

**Phase 7 = the finishing touch.** Packages loaded in perfect order every time.

---

## WHAT BLOCKS WHAT

```
Phase 1 (FedEx ID)
    └── blocks Phase 2, 3, 5

Phase 2 (GC Data)
    └── blocks Phase 3

Phase 3 (Profiles)
    └── blocks Phase 6 (leaderboard numbers)
    └── improves Phase 4 (profile-aware route cutting)

Phase 4 (Nightly DRO)
    └── blocks Phase 5 (routes must exist before assigning drivers)

Phase 5 (GC Assignment)
    └── needs Phase 1 + Phase 4 complete

Phase 6 (Leaderboard)
    └── needs Phase 2 + Phase 3 complete
    └── PPODA source still unknown
```

---

## FIRST THING TO DO MONDAY

1. Add `fedex_id` to users table (5 minutes)
2. Run GroundCloud driver pull → match to Wayne Board users → fill in the IDs (30 minutes)
3. Run backfill script → 90 days of data in DB (runs while you do other things)

Everything else unlocks from there.
