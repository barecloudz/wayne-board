# DRIVER PROFILING PLAN — GroundCloud → Wayne Board

---

## THE MASTER KEY: FEDEX ID

Every driver has a FedEx ID (their badge number). This is the universal identifier that ties every system together. It is found in GroundCloud on the driver's profile.

```
FedEx ID (badge number)
    ├── Wayne Board account (login, schedule, driver portal)
    ├── GroundCloud driver profile (route-days, stops/hr, history)
    ├── Ryde scores (customer reviews / delivery ratings)
    ├── PPODA scores (proof-of-delivery photo quality score)
    └── Spotlight (FedEx recognition program — future)
```

**Rule:** Every driver record in our DB has a `fedex_id` column. This is how we join data across systems. No matching by name — names change, IDs don't.

---

## THE GOAL

Build automatic driver profiles that pull from every data source and show:
- How fast each driver runs (stops/hour, historical average)
- How consistent they are (do they vary a lot day to day?)
- How they perform on heavy vs light routes
- Whether they're improving or declining over time
- How many ILS impacts they cause (packages not delivered)
- Their completion rate (do they finish every day?)
- Their Ryde score (customer satisfaction rating)
- Their PPODA score (photo quality — are their delivery photos good?)
- Spotlight recognition (future — FedEx performance program)

**For route cutting:** The system knows Driver A runs 12 sph and Driver B runs 8 sph — Driver B gets fewer stops so everyone finishes at the same time.

**For the leaderboard:** Drivers see how they rank against each other across all metrics. Friendly competition drives improvement. Management sees who needs coaching.

---

## THE LEADERBOARD

Visible to drivers in their portal, full detail visible to management.

| Driver | SPH (30d) | Ryde Score | PPODA | Overall | Trend |
|---|---|---|---|---|---|
| Driver A | 12.4 | 4.9★ | 94% | 🥇 #1 | ↑ |
| Driver B | 10.1 | 4.7★ | 88% | 🥈 #2 | → |
| Driver C | 8.3 | 4.2★ | 71% | ⚠️ #8 | ↓ |

- **SPH** — stops per hour from GroundCloud, 30-day rolling average
- **Ryde Score** — customer review score (already partially built in the driver portal)
- **PPODA** — FedEx's photo quality score for proof-of-delivery photos
- **Overall** — weighted composite score across all metrics
- **Trend** — last 14 days vs previous 14 days

Drivers who see their own numbers get competitive. The leaderboard makes performance visible without management having to chase anyone down.

---

## DATA SOURCES

### GroundCloud API (already working)
- `stops_per_hour`, `miles_total`, `drive_time` — from `/api/route-days/`
- ILS impacts, missed stops — from `/api/route-day-decimal-stats/`
- Driver list with FedEx IDs — from `/api/drivers/`

### Ryde Scores (already partially built)
- Customer review ratings per delivery
- Already being pulled and shown in driver portal
- Need to aggregate per driver and feed into leaderboard

### PPODA (to build)
- FedEx scores the quality of each proof-of-delivery photo
- Need to find the API or data source (Spotlight? MyGroundBiz? Direct FedEx API?)
- Score per day per driver → average → leaderboard column

### Spotlight (future)
- FedEx's driver recognition platform
- Will have additional performance metrics
- Add to leaderboard when we have access

---

## WHAT GROUNDCLOUD GIVES US

We already know how to log in and hit their API. Customer ID: **439**.
Login: `Blake742Logistics` / `dowell2026` (via `/dashboard/login/`)

### Per Day Per Driver (`/api/route-days/`)
Every day we can pull one row per driver that ran:

| Field | What it is |
|---|---|
| `driver.user.first_name/last_name` | Driver name |
| `route.name` | Which route they ran |
| `stops_per_hour` | The main efficiency number |
| `miles_total` | Total miles driven |
| `drive_time` | Seconds of drive time |
| `status` | Completed, incomplete, etc. |
| `stops` | Array of individual stop records |

### Detailed Stats (`/api/route-day-decimal-stats/`)
Each route-day has decimal stats by `stat_type`. From our research:

| stat_type | Meaning |
|---|---|
| 1 | Stops delivered |
| 100 | Score (Ryde score) |
| 103 | Packages |
| 120 | ILS impacts (codes 2,3,12,27) |
| 121 | Missed deliveries |
| 200 | Total stop count on manifest |
| 202–203 | Additional package counts |

### Historical Depth
We can go back as far as GroundCloud has data — likely 90–180 days. We pull day by day in a loop.

---

## THE PLAN — PHASES

---

### PHASE 1 — Raw Data Into DB (Build This First)

Create a `gc_driver_days` table. One row per driver per day. This is the source of truth.

```sql
CREATE TABLE gc_driver_days (
  id              SERIAL PRIMARY KEY,
  date            DATE NOT NULL,
  gc_route_day_id INTEGER NOT NULL UNIQUE,  -- GroundCloud's route-day ID
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
  score           NUMERIC,            -- Ryde score for that day
  raw_json        JSONB,              -- full route-day object for future use
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON gc_driver_days (driver_name, date);
CREATE INDEX ON gc_driver_days (date);
```

**Script:** `scripts/sync-gc-driver-days.mjs`
- Logs into GroundCloud
- Pulls route-days for yesterday (or a given date range)
- Upserts into `gc_driver_days` (keyed on `gc_route_day_id`)
- Runs nightly via cron

---

### PHASE 2 — Driver Profiles Table (Calculate From Phase 1)

```sql
CREATE TABLE gc_driver_profiles (
  id              SERIAL PRIMARY KEY,
  driver_name     TEXT NOT NULL UNIQUE,
  gc_driver_id    INTEGER,

  -- Rolling averages
  avg_sph_30d     NUMERIC,   -- stops/hour last 30 days
  avg_sph_90d     NUMERIC,   -- stops/hour last 90 days
  avg_sph_all     NUMERIC,   -- all time

  -- Consistency
  stddev_sph_30d  NUMERIC,   -- lower = more consistent

  -- Volume
  avg_stops_30d   NUMERIC,
  avg_miles_30d   NUMERIC,

  -- Reliability
  completion_rate NUMERIC,   -- % of days fully completed (last 30)
  days_worked_30d INTEGER,

  -- Quality
  avg_ils_30d     NUMERIC,   -- avg ILS impacts per day
  avg_score_30d   NUMERIC,   -- avg Ryde score

  -- Trend
  sph_trend       TEXT,      -- 'improving', 'declining', 'stable'
  trend_delta     NUMERIC,   -- sph_last_14d - sph_prev_14d

  -- Best/worst
  best_sph        NUMERIC,
  worst_sph       NUMERIC,
  best_date       DATE,
  worst_date      DATE,

  -- Meta
  last_worked     DATE,
  profile_updated TIMESTAMPTZ DEFAULT NOW()
);
```

**Script:** `scripts/build-driver-profiles.mjs`
- Reads from `gc_driver_days`
- Calculates all the aggregates
- Upserts into `gc_driver_profiles`
- Run after each nightly sync, or weekly for deep recalc

---

### PHASE 3 — Backfill Historical Data

One-time script: `scripts/backfill-gc-history.mjs`
- Loops through the last 90 days
- Pulls each day from GroundCloud API
- Inserts into `gc_driver_days`
- Skip dates already in DB

This gives us an instant baseline profile for every driver on day one.

---

### PHASE 4 — Wayne Board UI

**Driver Profiles page** at `/wayne-board/drivers` or `/wayne-board/performance`:

**Per driver card shows:**
- Average stops/hour (30-day) with trend arrow ↑↓
- Completion rate badge (green/yellow/red)
- Ryde score average
- ILS impacts per day average
- Days worked this month
- Sparkline chart of stops/hour over last 30 days

**Fleet overview:**
- Ranked list: fastest → slowest
- Flag drivers who are declining
- Flag drivers with high ILS rates

---

### PHASE 5 — Use Profiles When Cutting Routes

When `sync-and-run.mjs` (or the app wizard) cuts routes, it:
1. Pulls `gc_driver_profiles` for each driver scheduled today
2. Sorts by `avg_sph_30d` — fastest driver gets the hardest geographic area
3. Calculates target stops per driver: `target = total_stops / sum_of_sph * driver_sph`
   - Fast driver (12 sph) gets more stops than slow driver (8 sph)
   - Everyone finishes at roughly the same time
4. Border balancing still respects geography — but the target per route is now driver-adjusted

---

## NIGHTLY AUTOMATION

```
11:30 PM — GroundCloud posts today's final data
11:45 PM — sync-gc-driver-days.mjs runs (pulls today's route-days)
11:50 PM — build-driver-profiles.mjs runs (recalculates profiles)
Midnight  — DRO route cutting runs (can now use updated profiles)
```

This can be a Netlify scheduled function or a cron job on the server.

---

## WHAT TO BUILD FIRST

**In order:**

1. `scripts/sync-gc-driver-days.mjs` — the data collector
2. DB migration to create `gc_driver_days` table
3. `scripts/backfill-gc-history.mjs` — populate 90 days of history
4. `scripts/build-driver-profiles.mjs` — calculate profiles
5. DB migration to create `gc_driver_profiles` table
6. API route: `GET /api/drivers/profiles` — serve profiles to the app
7. Wayne Board UI page — display driver profiles
8. Integrate profiles into route-cutting logic

---

## QUESTIONS TO DECIDE TOGETHER

1. **How far back do we backfill?** 30 days gives a quick baseline. 90 days gives a real picture. Could go further if GroundCloud has it.

2. **Do we weight recent performance more?** A driver's last 2 weeks matters more than what they did 3 months ago. Could use exponential weighted average.

3. **How do we handle drivers who run different routes?** A driver on a heavy mountain route will naturally run fewer stops/hr than one on a flat downtown route. Should we normalize by route type?

4. **Do we show driver profiles to the drivers themselves?** They already see their Ryde scores. Full profiling data is more for management.

5. **What triggers a flag?** If a driver's 14-day average drops more than X% below their 90-day average — automatic flag for coaching review?
