# DRO API Reference
> Discovered via network interception — dro.routesmart.com
> Service Area: 3060743 (742 LOGISTICS INC.)
> Station: 259 (FLETCHER)

---

## Authentication
All requests require session cookies obtained by logging in via Puppeteer (OAuth popup flow).
Credentials stored in Wayne Board settings as `dro_username` / `dro_password`.

---

## Day-of-Week Schedule (Active Plan)

### Get active plan schedule
```
GET /api/api/service-areas/3060743/active-plan
```
Returns full week schedule. Each day has a `waves` array with `serviceAreaDowWaveId`, `dow` (1=Mon..7=Sun), `routePlanId`, `routePlanName`.

**serviceAreaDowWaveId values (Blake 13 schedule):**
- Monday: 84164
- Tuesday: 84165
- Wednesday: 84166
- Thursday: 84167
- Friday: 84168
- Saturday: 84169
- Sunday: 84163

### Validate schedule change (call before saving)
```
PUT /api/api/service-areas/3060743/ValidateActivePlans
```
Returns `[]` (empty array = no errors). Body: same full schedule object as `active-plan2` below.

### Save schedule (set active plan per day)
```
PUT /api/api/service-areas/3060743/active-plan2
```
**⚠ Note: `active-plan2` not `active-plan`.** Returns 201 on success.
Body is the **full week schedule object** — you must send all 7 days. Change the target day's `routePlanId` and `routePlanName`.

```json
{
  "serviceAreaId": 3060743,
  "selectedDOW": 5,
  "monday": {
    "id": null,
    "dispatchMode": "",
    "waves": [{
      "serviceAreaDowWaveId": 84164,
      "serviceAreaId": 3060743,
      "dow": 1,
      "wave": 1,
      "routePlanId": 2291698,
      "routePlanName": "Blake 13",
      "totalRoutes": 13,
      "lpRoutes": 0,
      "bulkRoutes": 0,
      "regRoutes": 13,
      "smallRoutes": 0,
      "envZoneEligible": false,
      "useDeliveryAnchorArea": false,
      "deliveryAnchorAreaOpen": "",
      "deliveryAnchorAreaClose": "",
      "routePlanInfo": { ... }
    }],
    "planErrors": [],
    "isInvalid": false,
    "key": "monday",
    "day": "Monday"
  },
  "tuesday": { ... },
  "wednesday": { ... },
  "thursday": { ... },
  "friday": { ... },
  "saturday": { ... },
  "sunday": { ... }
}
```

**`selectedDOW`**: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun

**Workflow to change Friday to AUTO:**
1. GET `/active-plan` to get current full schedule
2. Modify the `friday.waves[0].routePlanId` → 2352850, `routePlanName` → "AUTO"
3. Set `selectedDOW: 5`
4. PUT `/ValidateActivePlans` with the modified object (verify returns `[]`)
5. PUT `/active-plan2` with the same object

---

## Route Plans

### List all route plans
```
GET /api/api/service-areas/3060743/route-plans
```
Returns array of plan objects. Keys: `planId, name, optimize_on_full_fleet, totalRoutes, lpRoutes, bulkRoutes, regRoutes, smallRoutes, numHelpers, isDynamicEligible, lastUsedDate`

**Known plans:**
| planId  | name          | routes |
|---------|---------------|--------|
| 2352850 | AUTO          | 13     |
| 2291698 | Blake 13      | 13     |
| 2346252 | 11 People     | 11     |
| 2331872 | 12            | 13     |
| 2341553 | 247 missing   | 13     |
| 675188  | Mon-Fri       | 12     |
| 2323377 | Sat Less PPl  | 7      |
| 675189  | Saturday      | 9      |
| 2318915 | Thursday      | 14     |
| 2326588 | Wednesday     | 14     |
| 2290896 | blake 1st run | 15     |

### Update route plan name/settings
```
PUT /api/api/service-areas/3060743/route-plans/
```
**Note: trailing slash, no planId in path.** Body: `{ planId, name, optimize_on_full_fleet }`
Response: `{ code, message }` — returns "Nothing Updated" if no vehicle changes.

### Get vehicle set for a plan (simple)
```
GET /api/api/service-areas/3060743/route-plans/{planId}/vehicle-set
```
Returns array of vehicle assignments with `vehicleSetId, vehicleOrder, vehicleId, driverId, loadProfile, routeType, vehicleName`

### Get advanced vehicle set for a plan
```
GET /api/api/service-areas/3060743/route-plans/{planId}/advanced-vehicle-set
```
Returns array with full vehicle detail including `anchorAreas` per vehicle.
Keys: `capacity, vehicleSetId, vehicleId, dispatchTime, targetTime, targetReturnTime, routeType, vehicleName, vehicleOrder, anchorAreas[]`

**AUTO plan vehicle set (vehicleSetId → vehicleId → name):**
| vehicleSetId | vehicleId | vehicleName      |
|-------------|-----------|------------------|
| 41780171    | 611610    | 742 ASHE HWY     |
| 41780172    | 611623    | 742 ETOWAH       |
| 41780173    | 1501071   | 742 EXTRA 5      |
| 41780174    | 611603    | 742 GREEN HWY    |
| 41780175    | 611624    | 742 KANUGA 39    |
| 41780176    | 611627    | 742 MILLS RIVER  |
| 41780177    | 611629    | 742 SUGARLOAF    |
| 41780178    | 611622    | 742 ERKWOOD      |
| 41780179    | 611642    | 742 7TH AVE      |
| 41780180    | 611621    | 742 CHIMNEY ROC  |
| 41780181    | 611612    | 742 CUMMINGS CV  |
| 41780182    | 611628    | 742 N RUGBY      |
| 41780183    | 611600    | 742 EXTRA 2      |

### Add vehicle(s) to a plan
```
POST /api/api/service-areas/3060743/route-plans/{planId}/vehicle-set
```
Body: array of vehicle objects. Returns 201.
```json
[{
  "wave": 1,
  "vehicleId": 611609,
  "driverId": null,
  "loadProfile": "Section",
  "routeType": "REG",
  "vehicleOrder": 13
}]
```
**Note:** `driverId` can be null. `vehicleOrder` controls route number position.
**This is ADDITIVE** — each vehicle in the array is added to the plan.

### Remove vehicle from a plan
```
DELETE /api/api/service-areas/3060743/route-plans/{planId}/vehicle-set
```
Body: array of `[{ vehicleSetId }]` objects (one per vehicle to remove). Returns 200.
```json
[{ "vehicleSetId": 41790307 }]
```
**Note: no vehicleSetId in path** — it goes in the body as an array.

### Get stop overrides for a plan
```
GET /api/api/service-areas/3060743/route-plans/{planId}/stop-overrides
```
Returns array of stopOverride IDs (integers).

### Get anchor area temp assignments for a plan
```
GET /api/api/service-areas/3060743/route-plans/{planId}/anchor-area-temp?
```
Returns 204 (empty) — temp overrides only exist during solve window.

### Get breaks for a plan
```
GET /api/api/service-areas/3060743/breaks?routePlanId={planId}
```
Returns 204 (no breaks configured).

---

## Anchor Areas (on Route Plans)

### Get available anchor areas for a vehicle slot
```
GET /api/api/service-areas/3060743/routeplan/{planId}/vehicle-set/{vehicleSetId}/available-anchor-areas
```
**⚠ Note: `routeplan` (no hyphen) in this path.**
Returns `{ availableAnchorAreas: [{anchorAreaId, name, availableAnchorAreaTypes}], availableDynamicZones: [], availablePickupAnchorAreas: [] }`

### Update anchor areas assigned to a vehicle in a plan
```
PUT /api/api/service-areas/3060743/route-plans/{planId}/advanced-vehicle-set
```
Body: **single vehicle object** (not an array) with updated `anchorAreas` array. Returns 200.
```json
{
  "vehicleSetId": 41780179,
  "waveId": null,
  "dispatchTime": "08:30",
  "targetTime": "08:00",
  "targetReturnTime": "16:30",
  "routeType": "REG",
  "anchorAreas": [
    {
      "anchorAreaId": 4017238,
      "serviceAreaId": 3060743,
      "name": "Airport/Ashe Hwy",
      "station": "",
      "shape": null,
      "sequenceClusterId": 501108157,
      "zone": "no_sequence",
      "zoneAbbr": null,
      "sequence": null,
      "anchorAreaType": "REG",
      "isDynamicZone": false,
      "availableAnchorAreaTypes": ["REG"]
    }
  ],
  "numHelpers": 0,
  "relayStart": "",
  "relayEnd": "",
  "seqPickupsLast": false,
  "endRouteAtLastStop": false,
  "manualAssignmentOnly": false,
  "cartage": false,
  "driverId": 267568,
  "maxStops": null,
  "minStops": null,
  "overflowDispatchable": true,
  "overflowHelpable": true,
  "overflowPriorityHelpers": [],
  "strictReturnTime": false,
  "sdocEligible": true,
  "useAnchorAreasForSdoc": false,
  "allowHeavyPackage": false
}
```
**Workflow to reassign anchor areas:** GET `advanced-vehicle-set`, modify the target vehicle's `anchorAreas` array, PUT back as single object.

---

## Anchor Area Definitions

### List all anchor areas
```
GET /api/api/service-areas/3060743/anchor-area
```
Returns array[82+]. Keys: `anchorAreaId, serviceAreaId, name, station, shape, anchorAreaTypes, lastModified, enabledRoutePlans`
`shape` is a JSON string with `spatialReference` and `rings` (Web Mercator EPSG:3857 coordinates).

**⚠ GET /anchor-area/{id} returns 404** — no single-area endpoint.

### Update existing anchor area
```
PUT /api/api/service-areas/3060743/anchor-area
```
Returns 201. Body (note PascalCase keys):
```json
{
  "ServiceAreaId": 3060743,
  "AnchorAreaId": 21008966,
  "Name": "Lake Lure",
  "Station": "Lake Lure Chimney Rock",
  "Shape": "{\"spatialReference\":{\"latestWkid\":3857,\"wkid\":102100},\"rings\":[[[...web mercator coords...]]]}"
}
```

### Create new anchor area
```
POST /api/api/service-areas/3060743/anchor-area
```
Returns 201. Body: same as PUT but without `AnchorAreaId`.
```json
{
  "ServiceAreaId": 3060743,
  "Name": "buffalo creek park",
  "Station": "buffalo creek park",
  "Shape": "{\"spatialReference\":{\"latestWkid\":3857,\"wkid\":102100},\"rings\":[[[...web mercator coords...]]]}"
}
```
**Shape coordinates** are Web Mercator (EPSG:3857), not WGS84 lat/lng. Convert with:
`x = lng * 20037508.34 / 180`
`y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180`

---

## Fleet / Vehicles

### List all vehicles
```
GET /api/api/service-areas/3060743/fleet
```
Returns array[38]. Keys: `missingWorkAreaName, sids, floorSids, vehicleTypeName, symbol, vehId, wave, workAreaName, work_area, fedexVehicleId, route_type, vehicleTypeId, vehicleCapacity, bulkhead, shelves, loadProfile`

### List vehicles (alternate endpoint)
```
GET /api/api/service-areas/3060743/fleet-al
```

### Vehicle types
```
GET /api/api/vehicle-types
```

### Vehicle cost profiles
```
GET /api/api/service-areas/3060743/vehicle-cost-profile
```

---

## Waypoints / Stops

### Get all waypoints for today
```
GET /api/api/service-areas/3060743/waypoints?solutionType=actual&routePlanId={planId}
```
Returns array[541]. Keys: `wid, waypointId, stopId, csa, wave, firmName, address, city, state, postalCode, lat, lng, actualRoute, actualSequence, optimalRoute, optimalSequence, windowOpen, windowClose, isSmallStop, isCdoStop, isHazardous, isHeavyweight, trackingIds, actualAssignmentType, pickupType, reasonCode, overflowedRoute, numLPPackages, noPackages, totalWeight, totalCube, isBulkStop, workAreaNumber, arrivalTime, stopClass`

### Transfer stops to a route
```
POST /api/api/service-areas/3060743/waypoints/transferRoute?
```
Body: `{ route: "742 ERKWOOD", waypointIds: [...], sort_date: "2026-07-17" }`

### Get waypoint geographic extent
```
GET /api/api/service-areas/3060743/waypoints/extent?station_id=259&csa=304169&solutionType=actual
```

---

## Routes

### Get routes for a plan
```
GET /api/api/service-areas/3060743/routes?solutionType=actual&routePlanId={planId}
```
Returns array. Keys: `workAreaName, workAreaNumber, manualAssignOnly, routeUpdated, routeType, symbol`

### Get route summary
```
GET /api/api/service-areas/3060743/route-summary?stationId=259&solutionType=actual
```
Returns array[13]. Keys: `serviceAreaId, solutionType, wave, workAreaName, workAreaNumber, routeType, stops, packages, distance, timeHours, ...`

### Get package detail (LP/SM/Bulk/Reg breakdown per route)
```
GET /api/api/service-areas/3060743/report/packagedetail?routePlanId={planId}
```
Returns per-route breakdown including `lpStops, lpPackages, smStops, smPackages, bulkStops, bulkPackages, regStops, regPackages, exceededTargetDuration, timeCriticalStops`

---

## Solve / Create Solution

### Trigger solve
```
POST /api/api/service-areas/3060743/create_solution_by_wave
```
Body:
```json
{
  "alternateSolver": false,
  "createInformedOptimal": false,
  "submittedByStationUser": false,
  "waves": [{ "waveId": 84167, "routePlanId": 2291698, "wave": 1 }]
}
```

### Get active route plan (quick)
```
GET /api/api/service-areas/3060743/active-route-plan
```
Returns `{ planId, name, totalRoutes, ... }`

### Get planning window state
```
GET /api/api/service-areas/station/259/planningWindowState?serviceAreaId=3060743
```
Returns `true` or `false`

### Get sort date
```
GET /api/api/stations/259/sortDate
```

### Get dispatch settings (wave IDs)
```
GET /api/api/stations/259/dispatch-settings
```
Returns `{ waves: [{ waveId, ... }] }`

---

## Historical

### Get historical summary for a date
```
GET /api/api/service-areas/3060743/historical-summary?selectedDate=2026-07-16
```
Returns `{ scaling, daySummary, workAreaSummaries, scalingList }`
**`selectedDate` is the working param** (not `date=`, `sortDate=`, or `startDate=`).

---

## Drivers

### List drivers
```
GET /api/api/service-areas/3060743/drivers-list
```
Returns `[{ driverLabel, driverId }]`

### List all drivers
```
GET /api/api/service-areas/3060743/drivers
```

---

## Station / Service Areas

### Get active service areas at this station
```
GET /api/api/stations/259/GetActiveServiceAreas
```
Returns array[13] of other FedEx contractors at FLETCHER station.

### Get create-routes config
```
GET /api/api/service-areas/3060743/create-routes?
```
Returns `{ activeRoutePlan, createInformedOptimal }`

### Get custom routing options
```
GET /api/api/service-areas/3060743/custom-routing-options
```

### Get LP package rules
```
GET /api/api/service-areas/3060743/GetCSPLargePackageRules
```

### Get minimum target hours
```
GET /api/api/service-areas/3060743/minimum-target-hours
```
Returns `{ minimumTime: "02:00", showMaxMinStops: "true" }`

---

## Stop Overrides

### List permanent stop overrides
```
GET /api/api/service-areas/3060743/stop-overrides
```
Returns array[211] of permanent overrides.

### List temp daily stop overrides
```
GET /api/api/service-areas/3060743/stop-overrides-temp
```
Returns array[1088] of temp daily assignments. Keys: `tempOverrideId, serviceAreaId, csa, waypointId, stopName, address, ...`

---

## Dynamic Zones

### Get dynamic zone settings for a plan
```
GET /api/api/service-areas/route-plan/{planId}/dynamic-zone-settings
```
Returns array[5] with anchor area type configs.

---

## Fleet / Vehicle Capacity

### Update vehicle definition (capacity, SIDs, shelves, etc.)
```
PUT /api/api/service-areas/3060743/fleet-al
```
Returns 201. Body includes full vehicle definition — send the entire object from GET `/fleet-al`:
```json
{
  "work_area": "0454",
  "vehId": 611642,
  "wave": 1,
  "workAreaName": "742 7TH AVE",
  "fedexVehicleId": "447904",
  "vehicleTypeId": 9,
  "vehicleCapacity": 400,
  "route_type": "REG",
  "bulkhead": true,
  "shelves": true,
  "loadProfile": "Section",
  "sids": [
    { "section": 1000, "enabled": false, "isFloor": false },
    { "section": 3000, "enabled": true, "isFloor": false },
    ...
  ]
}
```
`vehicleCapacity` controls max stop count. `sids` enables/disables sort sections. `shelves` toggles shelf usage.

---

## Route Plan Copy / Delete

### Copy a route plan
```
POST /api/api/service-areas/3060743/CopyRoutePlan/{sourcePlanId}
```
Returns 200. Body:
```json
{ "RoutePlanId": 2352850, "NewName": "AUTO copy" }
```
Creates a full duplicate of the source plan including all vehicle assignments and anchor areas.

### Delete a route plan
```
DELETE /api/api/service-areas/3060743/route-plans/
```
Body: `{ "planId": 2353061 }` — no planId in path, goes in body. Returns 200.

---

## Still Unknown

- **full advanced-vehicle-set body for anchor area submission** — `anchorAreas[].sequenceClusterId` and `zone` fields may be required when re-submitting; use the GET response as the base.
