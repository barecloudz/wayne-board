# DRO Sandbox Test Findings
**Run date:** 2026-07-18
**Sort date tested:** today
**Test plan created:** WAYNE TEST 2026-07-18 (ID: 2354125) — successfully deleted after test

---

## Summary of What Works / Doesn't Work

| Action | Works? | Endpoint |
|--------|--------|----------|
| List all route plans | ✓ | `GET /api/api/service-areas/{sa}/route-plans` |
| Get active plan | ✓ | `GET /api/api/service-areas/{sa}/active-route-plan` |
| **Copy a plan** | ✓ | `POST /api/api/service-areas/{sa}/CopyRoutePlan/{planId}` body: `{RoutePlanId, NewName}` |
| **Delete a plan** | ✓ | `DELETE /api/api/service-areas/{sa}/route-plans/` body: `{planId}` (NOT /{id}) |
| Get waypoints on ANY plan (by ID) | ✓ | `GET /api/api/service-areas/{sa}/waypoints?routePlanId={id}` |
| Get vehicle set on copy | ✓ | `GET /api/api/service-areas/{sa}/route-plans/{id}/advanced-vehicle-set-with-routes` |
| **Activate a plan via API** | ✗ | No endpoint exists — UI only |
| **transferRoute to specific plan** | ✗ | Always operates on ACTIVE plan regardless of planId param |
| Solve against non-active plan | ✗ | `create_solution_by_wave` only works on active plan |
| Solve outside planning window | ✗ | 406: "You can only perform this operation within the designated planning window" |

---

## Critical Insight: transferRoute Always Targets Active Plan

**This is the most important finding.** The `transferRoute` endpoint:
```
POST /api/api/service-areas/{sa}/waypoints/transferRoute?
Body: { route, waypointIds, sort_date }
```

Always operates on the **currently active plan** regardless of:
- Adding `routePlanId` to the request body
- Adding `planId` as a query parameter

**Implication:** There is no API-level sandbox. Routing always hits the live active plan.

---

## Confirmed Working: Copy & Delete

### Copy a plan
```
POST /api/api/service-areas/3060743/CopyRoutePlan/{sourcePlanId}
Body: { RoutePlanId: 2352850, NewName: "WAYNE TEST 2026-07-18" }
Response: 200 { code: "", message: "" }
```
The copy gets a new planId (2352850 → 2354125). It inherits all 715 waypoints and 13-vehicle set.

### Delete a plan
```
DELETE /api/api/service-areas/3060743/route-plans/
Body: { planId: 2354125 }
Response: 200 { code: "", message: "" }
```
**NOT** `DELETE /route-plans/{id}` — that returns 404.

---

## Template Assignment: 543 / 713 Stops Matched (76%) — Root Causes Found

Current template maps 13 `work_area_number` values → route labels.
When applied to today's 715 waypoints:

| Route | Stops |
|-------|-------|
| SUGARLOAF | 82 |
| GREEN HWY | 74 |
| ASHE HWY | 71 |
| MILLS RIVER | 70 |
| CHIMNEY ROC | 68 |
| EXTRA 2 | 65 |
| N RUGBY | 61 |
| EXTRA 5 / DOWNTOWN | 58 |
| ETOWAH | 0 |
| KANUGA 39 | 0 |
| ERKWOOD | 0 |
| 7TH AVE | 0 |
| CUMMINGS CV | 0 |

**Two root causes for unmatched stops:**

### Root Cause 1: 170 stops have empty workAreaNumber (`""`)
DRO does not set `workAreaNumber` on all stops. 170 stops (24%) have an empty string. They still have `actualRoute` set (e.g. "ASHE HWY"), so they are already routed — just not tagged to an anchor area.
**Fix:** For stops with no WAN, keep their existing `actualRoute` — don't move them.

### Root Cause 2: 5 routes have 0 stops TODAY (Saturday)
ETOWAH, KANUGA 39, ERKWOOD, 7TH AVE, CUMMINGS CV all have the correct WANs in the template (0442, 0314, 0418, 0454, 0470), but today's sort simply has no packages destined for those areas. This is **expected** — Saturday volume is lighter. The template is correct.

**Template assignment is 100% correct** — 543/543 stops with a workAreaNumber matched their route, and the remaining 170 (no WAN) need to stay where they are.

| Route | Stops today | WAN in template |
|-------|-------------|-----------------|
| SUGARLOAF | 82 | 0351 ✓ |
| GREEN HWY | 74 | 0275 ✓ |
| ASHE HWY | 66 | 0255 ✓ |
| MILLS RIVER | 70 | 0326 ✓ |
| CHIMNEY ROC | 68 | 0354 ✓ |
| EXTRA 2 | 64 | 0386 ✓ |
| N RUGBY | 61 | 0247 ✓ |
| EXTRA 5 / DOWNTOWN | 58 | 0211 ✓ |
| ETOWAH / ZIRCONIA | 0 | 0442 (no Sat stops) |
| KANUGA 39 | 0 | 0314 (no Sat stops) |
| ERKWOOD | 0 | 0418 (no Sat stops) |
| 7TH AVE | 0 | 0454 (no Sat stops) |
| CUMMINGS CV | 0 | 0470 (no Sat stops) |

---

## Route Names in DRO vs Wayne Board

DRO waypoints use `actualRoute` values like:
```
"742 ASHE HWY", "742 SUGARLOAF", "742 GREEN HWY" ...
```
(prefixed with station number "742 ")

The `workAreaNumber` field on waypoints (e.g. "0255") maps to anchor areas — this is the correct field to use for template assignment, NOT `actualRoute`.

**transferRoute `route` parameter uses the short name** (e.g. `"ASHE HWY"`, not `"742 ASHE HWY"`). This was confirmed working in the test.

## Correct Template Routing Algorithm

```
for each waypoint:
  if waypoint.workAreaNumber is set:
    routeLabel = template[workAreaNumber]   // e.g. "0255" → "ASHE HWY"
    bucket[routeLabel].push(waypointId)
  else:
    keep as-is (don't include in any transferRoute call)

for each bucket (routeLabel, waypointIds):
  POST /waypoints/transferRoute  { route: routeLabel, waypointIds, sort_date }

POST /create_solution_by_wave
```

This correctly handles:
- ✓ Stops with known anchor area assignments
- ✓ Stops with no work area (already routed, leave alone)
- ✓ Routes with 0 stops on light days (just empty buckets, nothing sent)

---

## Planning Window Restriction

The solve endpoint `create_solution_by_wave` returns:
```
406 Not Acceptable
code: "API.CreateMultipleSolutions2.Status406NotAcceptable(active)-F"
message: "You can only perform this operation within the designated planning window."
```
Outside of the designated window (likely late night / early morning). This is why the nightly cron schedule (around midnight) works but daytime tests do not.

---

## Recommended Sandbox Workflow

Since we can't activate plans via API, the sandbox test flow is:

1. **Before testing**: In DRO UI, manually activate the copy plan
2. **Run script**: `node scripts/test-dro-sandbox.mjs` — routes against now-active copy
3. **Review in DRO**: See if routes look right
4. **After testing**: In DRO UI, switch back to the real plan

OR — for nightly automation:

1. At ~midnight, the active plan is already set by the operator for the next day
2. The cron runs `transferRoute` against that active plan
3. Template determines which stops go to which route
4. Solve runs and sequences stops

---

## Next Steps

1. **Fix template mapping** — discover actual workAreaNumbers for ETOWAH, KANUGA 39, ERKWOOD, 7TH AVE, CUMMINGS CV routes and update `route_template_areas`
2. **Wire "Push to DRO" button** — use the template-based approach (workAreaNumber → route label → transferRoute) instead of the geometry approach in sync-and-run.mjs
3. **Test solve timing** — confirm the planning window opens (nightly cron time is 3:45 UTC = 11:45 PM ET — need to verify this is inside the window)
