# CLAUDE READ THIS — DRO ROUTE AUTOMATION

---

## WHAT THIS IS

We automate cutting delivery routes for FedEx Ground station 742 (Henderson, NC) using the DRO (RouteSmart) platform. Every night, DRO has a list of stops (packages to deliver tomorrow). Our job is to assign those stops to the right trucks/drivers and trigger a solve so DRO sequences the stops optimally.

The automation replaces what would otherwise be 30-60 minutes of manual clicking in DRO every night.

---

## THE ULTIMATE GOAL

**Keep every driver's stops geographically clustered in their own zone, while making the total mileage as short and efficient as possible, and keeping the workload roughly equal across all drivers.**

In order of priority:
1. **Geographic integrity** — stops stay in their anchor areas. A driver who covers Zirconia should not end up with stops in Chimney Rock. Scrambling zones destroys efficiency and confuses drivers.
2. **Border-only balancing** — if one route has 155 stops and another has 68, we steal stops only from the geographic edge of the heavy route and give them to the nearest lighter neighbor. Never move interior stops. Never do count-only shuffling.
3. **Efficient sequencing** — once stops are assigned to routes, order them by actual road distance (OSRM) not straight-line distance.
4. **Zirconia is always isolated** — never take stops from Zirconia routes during balancing. It is a remote mountain area and its stops must stay together.

---

## THE SCRIPTS — WHAT WORKS

### ✅ `scripts/sync-and-run.mjs` — THE GOOD ONE, USE THIS
**Created: July 16. This is the script that worked perfectly.**

Run it with: `node scripts/sync-and-run.mjs [driverCount]`
Example: `node scripts/sync-and-run.mjs 8`

**What it does, step by step:**

1. **Logs into DRO** via Okta popup (Service Provider button → popup window → identifier field → password field → submit). Uses `DRO_USERNAME` and `DRO_PASSWORD` from `.env.local`.

2. **Gets sort date + active route plan** from DRO API.

3. **Fetches live waypoints** from `/api/api/service-areas/3060743/waypoints?solutionType=actual&routePlanId=...` — these are all the stops for tomorrow's plan with their current route assignments.

4. **Fetches GPS coordinates from ArcGIS proxy** — this is critical. The waypoints themselves don't have lat/lng. GPS comes from:
   ```
   /api/api/Proxy?http://AGS_URL/rest/services/DRO_Layers/MapServer/8/query
   ```
   With params: `sort_date`, `station_id='259'`, `csa='304169'`, plus **`parameterValues`** and **`layerParameterValues`** (these extra params are what make the GPS data return — without them you get 0 features).

5. **Fetches anchor areas** from `/api/api/service-areas/3060743/anchor-area` — these are the geographic polygon zones (EPSG:3857 projection, converted to WGS84 in the script). Each anchor area belongs to a specific route.

6. **Assigns stops to routes:**
   - First: use `actualRoute` if it's already set (DRO's current assignment)
   - Second: if unrouted, check if the stop's GPS falls inside an anchor area polygon (point-in-polygon test)
   - Third: if still unassigned, use nearest route centroid

7. **Merges routes down to driverCount** — if there are more route groups than drivers available, it merges the smallest route into its nearest geographic neighbor (by centroid distance), respecting cube/weight capacity limits.

8. **Border-only balancing:**
   - Finds the heaviest route (most stops)
   - Finds its closest lighter neighbor (by centroid-to-centroid distance)
   - Moves the single stop from the heavy route that is physically closest to the light route's centroid
   - Repeats until no route is more than 10 stops above average
   - **Zirconia routes are excluded from all balancing**

9. **Sequences stops via OSRM** — calls `https://router.project-osrm.org/table/v1/driving/` to get a real road-distance travel time matrix, then does nearest-neighbor + 2-opt optimization. Bulk stops always go last.

10. **Pushes to DRO** via `transferRoute` API for each route.

11. **Triggers solve** via `create_solution_by_wave` — DRO's solver then runs and produces the final dispatched sequence.

---

### ✅ `scripts/run-routes.mjs` — DB-BACKED VERSION
**Created: July 16. Uses stops already synced into the `dro_stops` database table instead of fetching live from DRO.**

Same logic as `sync-and-run.mjs` but pulls stops from `SELECT * FROM dro_stops WHERE lat IS NOT NULL` instead of hitting DRO API directly. Useful when DRO is slow or GPS data isn't available yet but we have yesterday's sync in the DB.

---

## THE SCRIPTS — WHAT DOES NOT WORK

### ❌ `scripts/cut-routes-tonight.mjs` — BROKEN, DO NOT USE
**Created: July 17 during this conversation as an attempted "simpler" replacement. It royally screwed up the routes.**

Problems with it:
- **Dropped the critical ArcGIS params** (`parameterValues` + `layerParameterValues`) so GPS always returned 0 features
- **Did count-only balancing** when GPS was unavailable — randomly shuffled stops between routes regardless of geography, sending stops from Sugarloaf onto Ashe Hwy, etc.
- **"Everybody is everywhere"** — the user had to manually fix the routes after this script ran
- Even after fixes were added, it never matched what `sync-and-run.mjs` already did correctly

**Do not run this script. Do not use it as a reference. If route-cutting is needed, use `sync-and-run.mjs`.**

---

## KEY TECHNICAL FACTS

### DRO Login Flow (Okta popup)
DRO does NOT have a simple username/password form. Login requires:
1. Load `https://dro.routesmart.com` — click the **"Service Provider"** button
2. A new popup window opens pointing to `purpleid.okta.com`
3. In the popup: fill `input[name="identifier"]` with username → click Next/submit
4. Fill `input[type="password"]` → click Verify/submit
5. Popup closes and the main page redirects to `/selection` (station selector)
6. Click the station card to select station 259

The credentials live in `.env.local` as `DRO_USERNAME` and `DRO_PASSWORD`.

### Critical API Endpoints
| Purpose | Endpoint |
|---|---|
| Active route plan | `GET /api/api/service-areas/3060743/active-route-plan` |
| Sort date | `GET /api/api/stations/259/sortDate` |
| Waypoints | `GET /api/api/service-areas/3060743/waypoints?solutionType=actual&routePlanId=...` |
| Anchor areas | `GET /api/api/service-areas/3060743/anchor-area` |
| Vehicle set | `GET /api/api/service-areas/3060743/route-plans/{planId}/advanced-vehicle-set` |
| GPS coords | `GET /api/api/Proxy?http://AGS_URL/rest/services/DRO_Layers/MapServer/8/query?...` |
| Transfer stops | `POST /api/api/service-areas/3060743/waypoints/transferRoute?` |
| Trigger solve | `POST /api/api/service-areas/3060743/create_solution_by_wave` |
| Dispatch settings (waveId) | `GET /api/api/stations/259/dispatch-settings` |

### workAreaNumber (discovered July 17)
Each waypoint has a `workAreaNumber` field (e.g., `0255`, `0275`, `0351`). Each vehicle in the plan also has a `workAreaNumber`. These match 1:1 — it's a stable anchor-area code that survives `transferRoute` calls and tells you which route a stop truly belongs to.

This is a reliable fallback for route assignment when `actualRoute` has been corrupted (e.g., after we accidentally scrambled things). Map: `workAreaNumber → vehicleName` using the advanced-vehicle-set API.

### GPS and ArcGIS
- Stop coordinates come from ArcGIS via DRO's proxy, NOT from the waypoints themselves
- Query must include `parameterValues` and `layerParameterValues` or you get 0 results
- GPS is only available after FedEx populates the layer for that sort date — often not available until the morning of or night before. If 0 GPS features: **do not balance, just keep existing assignments and solve.**
- Coordinates come back in EPSG:3857 (Web Mercator). Convert with:
  - `lat = (180/π) * (2*atan(exp((y/20037508.34)*π)) - π/2)`
  - `lng = (x/20037508.34) * 180`

### Anchor Areas
- Polygons stored in `dro_anchor_areas` table (synced via auto-DRO sync)
- Also returned live from `/api/api/service-areas/3060743/anchor-area` with `shape.rings` in EPSG:3857
- `sync-and-run.mjs` converts them on the fly — no DB needed
- Point-in-polygon uses ray casting algorithm

### The sat 7 Plan
- Plan name: `sat 7` → Plan ID: `2353695`
- 8 routes for Saturday: ASHE HWY, GREEN HWY, SUGARLOAF, EXTRA 5, MILLS RIVER, N RUGBY, EXTRA 2, CHIMNEY ROC
- workAreaNumber mapping: `0255→ASHE HWY`, `0275→GREEN HWY`, `0351→SUGARLOAF`, `0211→EXTRA 5`, `0326→MILLS RIVER`, `0247→N RUGBY`, `0386→EXTRA 2`, `0354→CHIMNEY ROC`
- Typical stop count: ~780-800 total, ~98 per route

---

## WHAT STILL NEEDS WORK

1. **App-based route cutting** — the Create Routes wizard in the Wayne Board app (`/wayne-board/create-routes`) is not fully working yet. The `/api/auto-dro/sync` endpoint had repeated 500 errors. The local scripts are the reliable path right now.

2. **GPS timing** — the ArcGIS layer doesn't populate until FedEx processes the next day's manifest. This means GPS is unavailable when you try to run the script early in the evening. The scripts handle this gracefully (skip balancing, keep existing assignments) but ideally we'd run after the data is available.

3. **wkt_poly in DB** — the `dro_anchor_areas` table has a `wkt_poly` column that was supposed to store the converted polygon WKT, but it was null for a long time (bug in dro-sync.ts). This is now fixed in the sync code but may need a re-sync to populate.

4. **Auto-connect from wizard** — when the DRO session expires, the app should auto-reconnect without making the user navigate to a different page. This was partially implemented.

---

## RULES FOR FUTURE CLAUDE

1. **USE `sync-and-run.mjs`. DO NOT rewrite it.**
2. If GPS returns 0 features — skip balancing entirely. Keep `actualRoute` assignments. Solve.
3. If you must balance — border stops only. Closest stop in the heavy route to the light route's centroid. Neighbors only (within ~15 miles centroid-to-centroid).
4. Zirconia is always isolated. Never take from it.
5. `workAreaNumber` is the ground truth for which route a stop belongs to when `actualRoute` is corrupted.
6. The ArcGIS GPS query MUST include `parameterValues` and `layerParameterValues` or it returns nothing.
7. Never scramble. Geographic integrity > equal stop counts.
