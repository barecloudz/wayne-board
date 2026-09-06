import {
  pgTable, serial, text, real, integer,
  timestamp, boolean, date, doublePrecision, bigint, json, uniqueIndex,
} from "drizzle-orm/pg-core";

// ── Organizations (one row per contractor / ISP) ──────────────────────────────
export const organizations = pgTable("organizations", {
  id:                   serial("id").primaryKey(),
  name:                 text("name").notNull(),                          // "Acme Logistics LLC"
  slug:                 text("slug").notNull().unique(),                  // "acme-logistics" — URL-safe
  plan:                 text("plan").notNull().default("starter"),        // "starter"|"pro"|"enterprise"
  subscriptionStatus:   text("subscription_status").notNull().default("trialing"), // "trialing"|"active"|"past_due"|"canceled"
  logoUrl:              text("logo_url"),               // Cloudflare Images delivery URL
  accentColor:          text("accent_color"),            // brand accent color, e.g. "#FF6200"
  ogImageUrl:           text("og_image_url"),            // Open Graph image shown when sharing the login link
  stripeCustomerId:     text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt:          timestamp("trial_ends_at"),
  demoMode:             boolean("demo_mode").notNull().default(false),  // super-admin granted demo access
  demoExpiresAt:        timestamp("demo_expires_at"),                   // null = indefinite demo
  email:                text("email"),                                   // billing/legal contact email
  superAdminNote:       text("super_admin_note"),                       // internal notes for Blake
  createdAt:            timestamp("created_at").defaultNow(),
});

// ── Platform Settings (global, Blake-only) ───────────────────────────────────
export const platformSettings = pgTable("platform_settings", {
  key:   text("key").primaryKey(),
  value: text("value").notNull(),
});

// ── Work Areas ───────────────────────────────────────────────────────────────
export const workAreas = pgTable("work_areas", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name:           text("name").notNull(),
  shape:          text("shape").notNull().default("circle"), // "circle"|"square"|"diamond"|"triangle"
  color:          text("color").notNull().default("#6366f1"),
  active:         boolean("active").notNull().default(true),
  createdAt:      timestamp("created_at").defaultNow(),
});

// ── Drivers / Users ──────────────────────────────────────────────────────────
export const drivers = pgTable("drivers", {
  id:                serial("id").primaryKey(),
  organizationId:    integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  driverId:          text("driver_id").notNull(),  // FedEx ID — used for DSW/review matching, NOT login
  username:          text("username"),              // login credential — unique globally
  name:              text("name").notNull(),
  passwordHash:      text("password_hash").notNull(),
  role:              text("role").notNull().default("driver"),  // "driver"|"bc"|"co_owner"|"developer"|"owner"
  isAdmin:           boolean("is_admin").notNull().default(false),
  avatarUrl:         text("avatar_url"),
  assignedVehicleId: integer("assigned_vehicle_id"),
  workArea:          text("work_area"),
  defaultWorkAreaId: integer("default_work_area_id").references(() => workAreas.id),
  active:            boolean("active").notNull().default(true),
  loginDisabled:     boolean("login_disabled").notNull().default(false),
  isTrainee:         boolean("is_trainee").notNull().default(false),
  noticeDate:        date("notice_date"),
  lastDay:           date("last_day"),
  firstLoginAt:      timestamp("first_login_at"),
  terminationType:   text("termination_type"),   // "notice"|"fired"|"mistake"
  terminationNote:   text("termination_note"),
  terminatedAt:      timestamp("terminated_at"),
  createdAt:         timestamp("created_at").defaultNow(),
}, (t) => ({
  orgDriverUnique: uniqueIndex("drivers_org_driver_unique").on(t.organizationId, t.driverId),
}));

// ── Vehicles ─────────────────────────────────────────────────────────────────
export const vehicles = pgTable("vehicles", {
  id:                   serial("id").primaryKey(),
  organizationId:       integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  unitNumber:           text("unit_number").notNull(),  // unique per org — enforced by orgUnitUnique index
  make:                 text("make").notNull(),
  model:                text("model").notNull(),
  year:                 integer("year").notNull(),
  mileage:              integer("mileage").notNull(),
  vin:                  text("vin").notNull().default(""),
  type:                 text("type").notNull().default("van"),       // "van"|"tractor"
  ownership:            text("ownership").notNull().default("owned"), // "owned"|"rental"
  mmrDue:               date("mmr_due"),
  federalInspectionDue: date("federal_inspection_due"),
  registrationExpiry:   date("registration_expiry"),
  active:               boolean("active").notNull().default(true),
  createdAt:            timestamp("created_at").defaultNow(),
}, (t) => ({
  orgUnitUnique: uniqueIndex("vehicles_org_unit_unique").on(t.organizationId, t.unitNumber),
}));

// ── Inspections ───────────────────────────────────────────────────────────────
export const inspections = pgTable("inspections", {
  id:               serial("id").primaryKey(),
  organizationId:   integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
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
  status:             text("status").notNull(),         // "OK"|"Repair Needed"|"N/A"|"A/D"
  dateRepaired:       text("date_repaired"),
  notes:              text("notes"),
  repairInstructions: text("repair_instructions"),
  repairCost:         real("repair_cost"),
});

// ── Ryde Scores ───────────────────────────────────────────────────────────────
export const rydeScores = pgTable("ryde_scores", {
  id:              serial("id").primaryKey(),
  organizationId:  integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  driverId:        text("driver_id").notNull(),
  score:           real("score").notNull(),
  week:            text("week").notNull(),              // "2026-W18"
  deliveries:      integer("deliveries").notNull().default(0),
  positiveReviews: integer("positive_reviews").notNull().default(0),
  createdAt:       timestamp("created_at").defaultNow(),
});

// ── Ryde Reviews ──────────────────────────────────────────────────────────────
export const rydeReviews = pgTable("ryde_reviews", {
  id:               serial("id").primaryKey(),
  organizationId:   integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  driverId:         text("driver_id").notNull(),
  type:             text("type").notNull(),        // "positive"|"negative"
  stars:            integer("stars"),
  category:         text("category"),
  content:          text("content").notNull(),
  week:             text("week"),
  improvement:      text("improvement"),
  atFault:          boolean("at_fault").notNull().default(false),
  customerInitials: text("customer_initials"),
  source:           text("source"),
  trackId:          text("track_id"),
  createdAt:        timestamp("created_at").defaultNow(),
});

// ── Milestone Rewards (platform-global, managed by MyGroundOps owner) ─────────
export const milestoneRewards = pgTable("milestone_rewards", {
  id:           serial("id").primaryKey(),
  name:         text("name").notNull(),
  description:  text("description"),
  daysRequired: integer("days_required").notNull(),
  type:         text("type").notNull().default("physical"), // "physical"|"bonus"
  bonusAmount:  real("bonus_amount"),
  icon:         text("icon").notNull().default("🏅"),
  active:       boolean("active").notNull().default(true),
  sortOrder:    integer("sort_order").notNull().default(0),
  createdAt:    timestamp("created_at").defaultNow(),
});

// ── App Settings (per-org key-value) ──────────────────────────────────────────
export const settings = pgTable("settings", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  key:            text("key").notNull(),
  value:          text("value").notNull(),
}, (t) => ({
  orgKeyUnique: uniqueIndex("settings_org_key_unique").on(t.organizationId, t.key),
}));

// ── Vehicle Conditions ────────────────────────────────────────────────────────
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
export const driverSchedules = pgTable("driver_schedules", {
  id:        serial("id").primaryKey(),
  driverId:  text("driver_id").notNull(),
  mon:       boolean("mon").notNull().default(false),
  tue:       boolean("tue").notNull().default(false),
  wed:       boolean("wed").notNull().default(false),
  thu:       boolean("thu").notNull().default(false),
  fri:       boolean("fri").notNull().default(false),
  sat:       boolean("sat").notNull().default(false),
  sun:       boolean("sun").notNull().default(false),
  notes:     text("notes"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Time Off Entries ──────────────────────────────────────────────────────────
export const timeOffEntries = pgTable("time_off_entries", {
  id:        serial("id").primaryKey(),
  driverId:  text("driver_id").notNull(),
  startDate: date("start_date").notNull(),
  endDate:   date("end_date").notNull(),
  reason:    text("reason").notNull().default(""),
  note:      text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Driver Milestone Claims ───────────────────────────────────────────────────
export const driverMilestoneClaims = pgTable("driver_milestone_claims", {
  id:          serial("id").primaryKey(),
  driverId:    text("driver_id").notNull(),
  milestoneId: integer("milestone_id").notNull().references(() => milestoneRewards.id),
  earnedAt:    timestamp("earned_at").defaultNow(),
});

// ── Schedule Overrides ────────────────────────────────────────────────────────
export const scheduleOverrides = pgTable("schedule_overrides", {
  id:        serial("id").primaryKey(),
  driverId:  text("driver_id").notNull(),
  date:      date("date").notNull(),
  note:      text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Trainee Work Days ─────────────────────────────────────────────────────────
export const traineeWorkDays = pgTable("trainee_work_days", {
  id:        serial("id").primaryKey(),
  driverId:  text("driver_id").notNull(),
  date:      date("date").notNull(),
  weekStart: date("week_start").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Maintenance Requests ──────────────────────────────────────────────────────
export const maintenanceRequests = pgTable("maintenance_requests", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  driverId:       text("driver_id").notNull(),
  driverName:     text("driver_name").notNull(),
  truckNumber:    text("truck_number").notNull(),
  description:    text("description").notNull(),
  status:         text("status").notNull().default("pending"), // "pending"|"in_progress"|"resolved"
  adminNote:      text("admin_note"),
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
});

// ── Gate Codes ────────────────────────────────────────────────────────────────
export const gateCodes = pgTable("gate_codes", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  location:       text("location").notNull(),
  roadName:       text("road_name"),
  code:           text("code").notNull(),
  addedBy:        text("added_by").notNull(),
  addedByName:    text("added_by_name").notNull(),
  active:         boolean("active").notNull().default(true),
  createdAt:      timestamp("created_at").defaultNow(),
});

export const gateCodeReports = pgTable("gate_code_reports", {
  id:         serial("id").primaryKey(),
  gateCodeId: integer("gate_code_id").notNull().references(() => gateCodes.id, { onDelete: "cascade" }),
  driverId:   text("driver_id").notNull(),
  createdAt:  timestamp("created_at").defaultNow(),
});

// ── Auto DRO — Ephemeral Route Data ──────────────────────────────────────────
export const droRoutes = pgTable("dro_routes", {
  id:                     serial("id").primaryKey(),
  organizationId:         integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workAreaName:           text("work_area_name").notNull(),
  workAreaNumber:         text("work_area_number").notNull(),
  routeType:              text("route_type").notNull().default(""),
  stops:                  integer("stops").notNull().default(0),
  packages:               integer("packages").notNull().default(0),
  distance:               real("distance").notNull().default(0),
  timeHours:              real("time_hours").notNull().default(0),
  cube:                   real("cube").notNull().default(0),
  vehicleCapacity:        text("vehicle_capacity").notNull().default(""),
  sortDate:               date("sort_date").notNull(),
  lpStops:                integer("lp_stops").notNull().default(0),
  lpPackages:             integer("lp_packages").notNull().default(0),
  smStops:                integer("sm_stops").notNull().default(0),
  smPackages:             integer("sm_packages").notNull().default(0),
  bulkStops:              integer("bulk_stops").notNull().default(0),
  bulkPackages:           integer("bulk_packages").notNull().default(0),
  regStops:               integer("reg_stops").notNull().default(0),
  regPackages:            integer("reg_packages").notNull().default(0),
  exceededTargetDuration: boolean("exceeded_target_duration").notNull().default(false),
  timeCriticalStops:      integer("time_critical_stops").notNull().default(0),
  syncedAt:               timestamp("synced_at").defaultNow(),
});

export const droStops = pgTable("dro_stops", {
  id:                   serial("id").primaryKey(),
  organizationId:       integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  waypointId:           text("waypoint_id").notNull(),
  stopId:               text("stop_id").notNull(),
  firmName:             text("firm_name").notNull().default(""),
  address:              text("address").notNull().default(""),
  city:                 text("city").notNull().default(""),
  state:                text("state").notNull().default(""),
  postalCode:           text("postal_code").notNull().default(""),
  actualRoute:          text("actual_route").notNull().default(""),
  actualSequence:       integer("actual_sequence"),
  arrivalTime:          text("arrival_time").notNull().default(""),
  stopClass:            text("stop_class").notNull().default(""),
  noPackages:           integer("no_packages").notNull().default(0),
  totalWeight:          real("total_weight").notNull().default(0),
  totalCube:            real("total_cube").notNull().default(0),
  isLpPackage:          boolean("is_lp_package").notNull().default(false),
  isBulkStop:           boolean("is_bulk_stop").notNull().default(false),
  workAreaNumber:       text("work_area_number").notNull().default(""),
  lat:                  doublePrecision("lat"),
  lng:                  doublePrecision("lng"),
  sortDate:             date("sort_date").notNull(),
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
  syncedAt:             timestamp("synced_at").defaultNow(),
});

export const droRoutePlans = pgTable("dro_route_plans", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  planId:         integer("plan_id").notNull(),
  name:           text("name").notNull().default(""),
  totalRoutes:    integer("total_routes").notNull().default(0),
  lpRoutes:       integer("lp_routes").notNull().default(0),
  bulkRoutes:     integer("bulk_routes").notNull().default(0),
  regRoutes:      integer("reg_routes").notNull().default(0),
  smallRoutes:    integer("small_routes").notNull().default(0),
  isActive:       boolean("is_active").notNull().default(false),
  lastUsedDate:   text("last_used_date").notNull().default(""),
  syncedAt:       timestamp("synced_at").defaultNow(),
}, (t) => ({
  orgPlanUnique: uniqueIndex("dro_route_plans_org_plan_unique").on(t.organizationId, t.planId),
}));

export const droStopOverrides = pgTable("dro_stop_overrides", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  overrideId:     text("override_id").notNull(),
  stopId:         text("stop_id").notNull().default(""),
  recipientName:  text("recipient_name").notNull().default(""),
  address:        text("address").notNull().default(""),
  postalCode:     text("postal_code").notNull().default(""),
  type:           text("type").notNull().default(""),
  value:          text("value").notNull().default(""),
  windowOpen:     text("window_open").notNull().default(""),
  windowClose:    text("window_close").notNull().default(""),
  workAreaNum:    text("work_area_num").notNull().default(""),
  routePlanIds:   json("route_plan_ids"),
  syncedAt:       timestamp("synced_at").defaultNow(),
}, (t) => ({
  orgOverrideUnique: uniqueIndex("dro_stop_overrides_org_override_unique").on(t.organizationId, t.overrideId),
}));

export const droDailyTotals = pgTable("dro_daily_totals", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  date:           date("date").notNull(),
  routes:         integer("routes").notNull().default(0),
  totalStops:     integer("total_stops").notNull().default(0),
  totalPackages:  integer("total_packages").notNull().default(0),
  totalDistance:  real("total_distance").notNull().default(0),
  syncedAt:       timestamp("synced_at").defaultNow(),
}, (t) => ({
  orgDateUnique: uniqueIndex("dro_daily_totals_org_date_unique").on(t.organizationId, t.date),
}));

export const droAnchorAreas = pgTable("dro_anchor_areas", {
  id:                serial("id").primaryKey(),
  organizationId:    integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  anchorAreaId:      doublePrecision("anchor_area_id").notNull(),
  name:              text("name").notNull().default(""),
  shapeJson:         text("shape_json").notNull().default("{}"),
  enabledRoutePlans: text("enabled_route_plans").notNull().default("[]"),
  wktPoly:           text("wkt_poly"),
  vehicleId:         integer("vehicle_id"),
  hexCode:           text("hex_code"),
  syncedAt:          timestamp("synced_at").defaultNow(),
}, (t) => ({
  orgAnchorUnique: uniqueIndex("dro_anchor_areas_org_anchor_unique").on(t.organizationId, t.anchorAreaId),
}));

// ── Daily Work Area Assignments ───────────────────────────────────────────────
export const dailyWorkAreaAssignments = pgTable("daily_work_area_assignments", {
  id:         serial("id").primaryKey(),
  driverId:   text("driver_id").notNull(),
  date:       date("date").notNull(),
  workAreaId: integer("work_area_id").notNull().references(() => workAreas.id, { onDelete: "cascade" }),
  createdAt:  timestamp("created_at").defaultNow(),
});

// ── DSW (Daily Service Worksheet) Route Days ─────────────────────────────────
export const dswRouteDays = pgTable("dsw_route_days", {
  id:                serial("id").primaryKey(),
  organizationId:    integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  date:              date("date").notNull(),
  driverId:          text("driver_id"),
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
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  gcRouteDayId:   integer("gc_route_day_id").notNull(),
  driverId:       text("driver_id"),
  driverName:     text("driver_name").notNull().default(""),
  routeName:      text("route_name").notNull().default(""),
  date:           date("date").notNull(),
  stopsPerHour:   real("stops_per_hour"),
  milesTotal:     real("miles_total"),
  milesTraveled:  real("miles_traveled"),
  driveTime:      integer("drive_time"),   // seconds
  status:         text("status").notNull().default(""),
  syncedAt:       timestamp("synced_at").defaultNow(),
}, (t) => ({
  orgGcDayUnique: uniqueIndex("gc_route_days_org_gc_day_unique").on(t.organizationId, t.gcRouteDayId),
}));

// ── Vehicle Maintenance Records (admin-logged completed work) ─────────────────
export const vehicleMaintenanceRecords = pgTable("vehicle_maintenance_records", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  vehicleId:      integer("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  truckNumber:    text("truck_number").notNull(),
  serviceDate:    date("service_date").notNull(),
  type:           text("type").notNull(),                  // "oil_change"|"tire_rotation"|"mmr"|"fed_inspection"|"registration"|"repair"|"other"
  description:    text("description").notNull().default(""),
  mileage:        integer("mileage"),
  cost:           real("cost"),
  vendor:         text("vendor"),
  createdBy:      text("created_by").notNull(),
  createdAt:      timestamp("created_at").defaultNow(),
});
