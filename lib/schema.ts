import {
  pgTable, serial, text, real, integer,
  timestamp, boolean, date, doublePrecision, bigint, json,
} from "drizzle-orm/pg-core";

// ── Work Areas ───────────────────────────────────────────────────────────────
export const workAreas = pgTable("work_areas", {
  id:        serial("id").primaryKey(),
  name:      text("name").notNull(),
  shape:     text("shape").notNull().default("circle"), // "circle"|"square"|"diamond"|"triangle"
  color:     text("color").notNull().default("#6366f1"),
  active:    boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Drivers / Users ──────────────────────────────────────────────────────────
export const drivers = pgTable("drivers", {
  id:           serial("id").primaryKey(),
  driverId:     text("driver_id").notNull().unique(),   // e.g. "DR-004"
  name:         text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role:         text("role").notNull().default("driver"), // "driver" | "management"
  isAdmin:          boolean("is_admin").notNull().default(false),
  assignedVehicleId: integer("assigned_vehicle_id").references(() => vehicles.id),
  workArea:         text("work_area"),
  defaultWorkAreaId: integer("default_work_area_id").references(() => workAreas.id),
  active:           boolean("active").notNull().default(true),
  isTrainee:        boolean("is_trainee").notNull().default(false),
  noticeDate:       date("notice_date"),
  lastDay:          date("last_day"),
  firstLoginAt:     timestamp("first_login_at"),
  terminationType:  text("termination_type"),   // "notice" | "fired" | "mistake"
  terminationNote:  text("termination_note"),
  terminatedAt:     timestamp("terminated_at"),
  createdAt:    timestamp("created_at").defaultNow(),
});

// ── Vehicles ─────────────────────────────────────────────────────────────────
export const vehicles = pgTable("vehicles", {
  id:         serial("id").primaryKey(),
  unitNumber: text("unit_number").notNull().unique(), // "Truck 01" – "Truck 12"
  make:       text("make").notNull(),
  model:      text("model").notNull(),
  year:       integer("year").notNull(),
  mileage:    integer("mileage").notNull(),
  vin:        text("vin").notNull().default(""),
  type:                  text("type").notNull().default("van"),       // "van" | "tractor"
  ownership:             text("ownership").notNull().default("owned"), // "owned" | "rental"
  mmrDue:                date("mmr_due"),
  federalInspectionDue:  date("federal_inspection_due"),
  registrationExpiry:    date("registration_expiry"),
  active:                boolean("active").notNull().default(true),
  createdAt:  timestamp("created_at").defaultNow(),
});

// ── Inspections ───────────────────────────────────────────────────────────────
export const inspections = pgTable("inspections", {
  id:               serial("id").primaryKey(),
  vehicleId:        integer("vehicle_id").notNull().references(() => vehicles.id),
  inspectorName:    text("inspector_name").notNull(),
  inspectorId:      text("inspector_id").notNull(),
  stationName:      text("station_name").notNull(),
  stationNumber:    text("station_number").notNull(),
  inspectionDate:   date("inspection_date").notNull(),
  outOfService:     boolean("out_of_service").notNull().default(false),
  outOfServiceDocs: text("out_of_service_docs"),
  notificationDate: date("notification_date"),
  notifiedAOBCName: text("notified_aobc_name"),
  agreedRepairDate: date("agreed_repair_date"),
  status:           text("status").notNull().default("Draft"),
  createdAt:        timestamp("created_at").defaultNow(),
});

// ── Inspection Item Results ───────────────────────────────────────────────────
export const inspectionResults = pgTable("inspection_results", {
  id:                 serial("id").primaryKey(),
  inspectionId:       integer("inspection_id").notNull().references(() => inspections.id),
  componentId:        integer("component_id").notNull(),
  status:             text("status").notNull(),         // "OK" | "Repair Needed" | "N/A" | "A/D"
  dateRepaired:       text("date_repaired"),
  notes:              text("notes"),
  repairInstructions: text("repair_instructions"),      // how to fix
  repairCost:         real("repair_cost"),              // estimated cost (optional)
});

// ── Ryde Scores ───────────────────────────────────────────────────────────────
export const rydeScores = pgTable("ryde_scores", {
  id:              serial("id").primaryKey(),
  driverId:        text("driver_id").notNull().references(() => drivers.driverId),
  score:           real("score").notNull(),
  week:            text("week").notNull(),              // "2026-W18"
  deliveries:      integer("deliveries").notNull().default(0),
  positiveReviews: integer("positive_reviews").notNull().default(0),
  createdAt:       timestamp("created_at").defaultNow(),
});

// ── Ryde Reviews ──────────────────────────────────────────────────────────────
export const rydeReviews = pgTable("ryde_reviews", {
  id:          serial("id").primaryKey(),
  driverId:    text("driver_id").notNull().references(() => drivers.driverId),
  type:        text("type").notNull(),        // "positive" | "negative"
  stars:       integer("stars"),              // 1–5 star rating (drives Ryde score)
  category:    text("category"),              // e.g. "customer_feedback", "on_time", "safety"
  content:     text("content").notNull(),
  week:        text("week"),                  // "2026-W18" (optional, ties to a score week)
  improvement: text("improvement"),           // improvement tip for negatives
  atFault:          boolean("at_fault").notNull().default(false), // driver at fault — breaks milestone streak
  customerInitials: text("customer_initials"),                    // e.g. "J.D." — no address stored
  createdAt:        timestamp("created_at").defaultNow(),
});

// ── Milestone Rewards ─────────────────────────────────────────────────────────
export const milestoneRewards = pgTable("milestone_rewards", {
  id:           serial("id").primaryKey(),
  name:         text("name").notNull(),
  description:  text("description"),
  daysRequired: integer("days_required").notNull(),
  type:         text("type").notNull().default("physical"), // "physical" | "bonus"
  bonusAmount:  real("bonus_amount"),
  icon:         text("icon").notNull().default("🏅"),
  active:       boolean("active").notNull().default(true),
  sortOrder:    integer("sort_order").notNull().default(0),
  createdAt:    timestamp("created_at").defaultNow(),
});

// ── App Settings (key-value) ──────────────────────────────────────────────────
export const settings = pgTable("settings", {
  key:   text("key").primaryKey(),
  value: text("value").notNull(),
});

// ── Vehicle Conditions ────────────────────────────────────────────────────────
// Condition issues reported per vehicle — drives the Fleet Status Report PDF
export const vehicleConditions = pgTable("vehicle_conditions", {
  id:             serial("id").primaryKey(),
  vehicleId:      integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  description:    text("description").notNull(),
  severity:       text("severity").notNull().default("medium"), // "critical"|"high"|"medium"|"low"
  status:         text("status").notNull().default("open"),     // "open"|"in_progress"|"resolved"
  repairEstimate: real("repair_estimate"),
  routeStatus:    text("route_status").notNull().default("confirm"), // "in_use"|"not_in_use"|"confirm"
  note:           text("note"),
  reportedAt:     timestamp("reported_at").defaultNow(),
  resolvedAt:     timestamp("resolved_at"),
});

// ── Driver Schedules ─────────────────────────────────────────────────────────
// One row per driver — their regular recurring weekly schedule
export const driverSchedules = pgTable("driver_schedules", {
  id:       serial("id").primaryKey(),
  driverId: text("driver_id").notNull().unique().references(() => drivers.driverId, { onDelete: "cascade" }),
  mon:      boolean("mon").notNull().default(false),
  tue:      boolean("tue").notNull().default(false),
  wed:      boolean("wed").notNull().default(false),
  thu:      boolean("thu").notNull().default(false),
  fri:      boolean("fri").notNull().default(false),
  sat:      boolean("sat").notNull().default(false),
  sun:      boolean("sun").notNull().default(false),
  notes:    text("notes"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Time Off Entries ──────────────────────────────────────────────────────────
// Admin-entered time off; drivers cannot submit their own
export const timeOffEntries = pgTable("time_off_entries", {
  id:        serial("id").primaryKey(),
  driverId:  text("driver_id").notNull().references(() => drivers.driverId, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate:   date("end_date").notNull(),
  reason:    text("reason").notNull().default(""),
  note:      text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Driver Milestone Claims ───────────────────────────────────────────────────
// Permanently records when a driver earns a milestone — survives streak resets
export const driverMilestoneClaims = pgTable("driver_milestone_claims", {
  id:          serial("id").primaryKey(),
  driverId:    text("driver_id").notNull().references(() => drivers.driverId),
  milestoneId: integer("milestone_id").notNull().references(() => milestoneRewards.id),
  earnedAt:    timestamp("earned_at").defaultNow(),
});

// ── Schedule Overrides (one-time extra working days) ─────────────────────────
export const scheduleOverrides = pgTable("schedule_overrides", {
  id:        serial("id").primaryKey(),
  driverId:  text("driver_id").notNull().references(() => drivers.driverId, { onDelete: "cascade" }),
  date:      date("date").notNull(),
  note:      text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Trainee Work Days ─────────────────────────────────────────────────────────
// One row per trainee per day they were scheduled and worked (recorded at route push)
export const traineeWorkDays = pgTable("trainee_work_days", {
  id:        serial("id").primaryKey(),
  driverId:  text("driver_id").notNull().references(() => drivers.driverId, { onDelete: "cascade" }),
  date:      date("date").notNull(),
  weekStart: date("week_start").notNull(),  // Monday of that week
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Maintenance Requests ──────────────────────────────────────────────────────
export const maintenanceRequests = pgTable("maintenance_requests", {
  id:          serial("id").primaryKey(),
  driverId:    text("driver_id").notNull(),
  driverName:  text("driver_name").notNull(),
  truckNumber: text("truck_number").notNull(),
  description: text("description").notNull(),
  status:      text("status").notNull().default("pending"), // "pending"|"in_progress"|"resolved"
  adminNote:   text("admin_note"),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
});

// ── Gate Codes ────────────────────────────────────────────────────────────────
export const gateCodes = pgTable("gate_codes", {
  id:           serial("id").primaryKey(),
  location:     text("location").notNull(),           // e.g. "East Hendersonville"
  roadName:     text("road_name"),                    // e.g. "Lyndsey Dr" — helps drivers find the gate
  code:         text("code").notNull(),
  addedBy:      text("added_by").notNull(),           // driverId
  addedByName:  text("added_by_name").notNull(),
  active:       boolean("active").notNull().default(true),
  createdAt:    timestamp("created_at").defaultNow(),
});

export const gateCodeReports = pgTable("gate_code_reports", {
  id:          serial("id").primaryKey(),
  gateCodeId:  integer("gate_code_id").notNull().references(() => gateCodes.id, { onDelete: "cascade" }),
  driverId:    text("driver_id").notNull(),
  createdAt:   timestamp("created_at").defaultNow(),
});

// ── Auto DRO — Ephemeral Route Data ──────────────────────────────────────────
// Wiped and reloaded on every sync. No long-term PII retention.

export const droRoutes = pgTable("dro_routes", {
  id:             serial("id").primaryKey(),
  workAreaName:   text("work_area_name").notNull(),
  workAreaNumber: text("work_area_number").notNull(),
  routeType:      text("route_type").notNull().default(""),
  stops:          integer("stops").notNull().default(0),
  packages:       integer("packages").notNull().default(0),
  distance:       real("distance").notNull().default(0),
  timeHours:      real("time_hours").notNull().default(0),
  cube:           real("cube").notNull().default(0),
  vehicleCapacity: text("vehicle_capacity").notNull().default(""),
  sortDate:       date("sort_date").notNull(),
  // Package type breakdown (from /report/packagedetail)
  lpStops:        integer("lp_stops").notNull().default(0),
  lpPackages:     integer("lp_packages").notNull().default(0),
  smStops:        integer("sm_stops").notNull().default(0),
  smPackages:     integer("sm_packages").notNull().default(0),
  bulkStops:      integer("bulk_stops").notNull().default(0),
  bulkPackages:   integer("bulk_packages").notNull().default(0),
  regStops:       integer("reg_stops").notNull().default(0),
  regPackages:    integer("reg_packages").notNull().default(0),
  exceededTargetDuration: boolean("exceeded_target_duration").notNull().default(false),
  timeCriticalStops:      integer("time_critical_stops").notNull().default(0),
  syncedAt:       timestamp("synced_at").defaultNow(),
});

export const droStops = pgTable("dro_stops", {
  id:             serial("id").primaryKey(),
  waypointId:     text("waypoint_id").notNull(),
  stopId:         text("stop_id").notNull(),
  firmName:       text("firm_name").notNull().default(""),
  address:        text("address").notNull().default(""),
  city:           text("city").notNull().default(""),
  state:          text("state").notNull().default(""),
  postalCode:     text("postal_code").notNull().default(""),
  actualRoute:    text("actual_route").notNull().default(""),
  actualSequence: integer("actual_sequence"),
  arrivalTime:    text("arrival_time").notNull().default(""),
  stopClass:      text("stop_class").notNull().default(""),
  noPackages:     integer("no_packages").notNull().default(0),
  totalWeight:    real("total_weight").notNull().default(0),
  totalCube:      real("total_cube").notNull().default(0),
  isLpPackage:    boolean("is_lp_package").notNull().default(false),
  isBulkStop:     boolean("is_bulk_stop").notNull().default(false),
  workAreaNumber: text("work_area_number").notNull().default(""),
  lat:            doublePrecision("lat"),
  lng:            doublePrecision("lng"),
  sortDate:       date("sort_date").notNull(),
  // Extended waypoint fields
  wid:                  bigint("wid", { mode: "number" }),
  optimalRoute:         text("optimal_route").notNull().default(""),
  optimalSequence:      integer("optimal_sequence"),
  windowOpen:           text("window_open").notNull().default(""),
  windowClose:          text("window_close").notNull().default(""),
  isSmallStop:          boolean("is_small_stop").notNull().default(false),
  isCdoStop:            boolean("is_cdo_stop").notNull().default(false),
  isHazardous:          boolean("is_hazardous").notNull().default(false),
  isHeavyweight:        boolean("is_heavyweight").notNull().default(false),
  trackingIds:          json("tracking_ids"),
  actualAssignmentType: text("actual_assignment_type").notNull().default(""),
  pickupType:           text("pickup_type").notNull().default(""),
  reasonCode:           text("reason_code").notNull().default(""),
  overflowedRoute:      text("overflowed_route").notNull().default(""),
  numLpPackages:        integer("num_lp_packages").notNull().default(0),
  syncedAt:       timestamp("synced_at").defaultNow(),
});

// ── DRO Route Plans (all plans, active flagged) ───────────────────────────────
export const droRoutePlans = pgTable("dro_route_plans", {
  id:           serial("id").primaryKey(),
  planId:       integer("plan_id").notNull().unique(),
  name:         text("name").notNull().default(""),
  totalRoutes:  integer("total_routes").notNull().default(0),
  lpRoutes:     integer("lp_routes").notNull().default(0),
  bulkRoutes:   integer("bulk_routes").notNull().default(0),
  regRoutes:    integer("reg_routes").notNull().default(0),
  smallRoutes:  integer("small_routes").notNull().default(0),
  isActive:     boolean("is_active").notNull().default(false),
  lastUsedDate: text("last_used_date").notNull().default(""),
  syncedAt:     timestamp("synced_at").defaultNow(),
});

// ── DRO Permanent Stop Overrides (stops pinned to specific routes) ────────────
export const droStopOverrides = pgTable("dro_stop_overrides", {
  id:            serial("id").primaryKey(),
  overrideId:    text("override_id").notNull().unique(),
  stopId:        text("stop_id").notNull().default(""),
  recipientName: text("recipient_name").notNull().default(""),
  address:       text("address").notNull().default(""),
  postalCode:    text("postal_code").notNull().default(""),
  type:          text("type").notNull().default(""),
  value:         text("value").notNull().default(""),
  windowOpen:    text("window_open").notNull().default(""),
  windowClose:   text("window_close").notNull().default(""),
  workAreaNum:   text("work_area_num").notNull().default(""),
  routePlanIds:  json("route_plan_ids"),
  syncedAt:      timestamp("synced_at").defaultNow(),
});

export const droDailyTotals = pgTable("dro_daily_totals", {
  id:            serial("id").primaryKey(),
  date:          date("date").notNull().unique(),
  routes:        integer("routes").notNull().default(0),
  totalStops:    integer("total_stops").notNull().default(0),
  totalPackages: integer("total_packages").notNull().default(0),
  totalDistance: real("total_distance").notNull().default(0),
  syncedAt:      timestamp("synced_at").defaultNow(),
});

export const droAnchorAreas = pgTable("dro_anchor_areas", {
  id:                 serial("id").primaryKey(),
  anchorAreaId:       doublePrecision("anchor_area_id").notNull().unique(),
  name:               text("name").notNull().default(""),
  shapeJson:          text("shape_json").notNull().default("{}"),
  enabledRoutePlans:  text("enabled_route_plans").notNull().default("[]"),
  wktPoly:            text("wkt_poly"),
  vehicleId:          integer("vehicle_id"),
  hexCode:            text("hex_code"),
  syncedAt:           timestamp("synced_at").defaultNow(),
});

// ── Daily Work Area Assignments ───────────────────────────────────────────────
export const dailyWorkAreaAssignments = pgTable("daily_work_area_assignments", {
  id:         serial("id").primaryKey(),
  driverId:   text("driver_id").notNull().references(() => drivers.driverId, { onDelete: "cascade" }),
  date:       date("date").notNull(),
  workAreaId: integer("work_area_id").notNull().references(() => workAreas.id, { onDelete: "cascade" }),
  createdAt:  timestamp("created_at").defaultNow(),
});

// ── DSW (Daily Service Worksheet) Route Days ─────────────────────────────────
export const dswRouteDays = pgTable("dsw_route_days", {
  id:                serial("id").primaryKey(),
  date:              date("date").notNull(),
  driverId:          text("driver_id").references(() => drivers.driverId, { onDelete: "set null" }),
  driverNameRaw:     text("driver_name_raw").notNull().default(""),
  waName:            text("wa_name").notNull().default(""),
  waNumber:          text("wa_number").notNull().default(""),
  ilsPct:            real("ils_pct"),
  actDelStps:        integer("act_del_stps"),
  actDelPkgs:        integer("act_del_pkgs"),
  nonDelvdStps:      integer("non_delvd_stps"),
  allStatusCodePkgs: integer("all_status_code_pkgs"),
  miles:             integer("miles"),
  onRoadHours:       text("on_road_hours"),
  onDutyHours:       text("on_duty_hours"),
  vscanPkgs:         integer("vscan_pkgs"),
  delStpsPlanned:    integer("del_stps_planned"),
  syncedAt:          timestamp("synced_at").defaultNow(),
});

// ── GroundCloud Route Days ────────────────────────────────────────────────────
export const gcRouteDays = pgTable("gc_route_days", {
  id:            serial("id").primaryKey(),
  gcRouteDayId:  integer("gc_route_day_id").notNull().unique(),
  driverId:      text("driver_id").references(() => drivers.driverId, { onDelete: "set null" }),
  driverName:    text("driver_name").notNull().default(""),
  routeName:     text("route_name").notNull().default(""),
  date:          date("date").notNull(),
  stopsPerHour:  real("stops_per_hour"),
  milesTotal:    real("miles_total"),
  milesTraveled: real("miles_traveled"),
  driveTime:     integer("drive_time"),   // seconds
  status:        text("status").notNull().default(""),
  syncedAt:      timestamp("synced_at").defaultNow(),
});
