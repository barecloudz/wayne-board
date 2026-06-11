import {
  pgTable, serial, text, real, integer,
  timestamp, boolean, date,
} from "drizzle-orm/pg-core";

// ── Drivers / Users ──────────────────────────────────────────────────────────
export const drivers = pgTable("drivers", {
  id:           serial("id").primaryKey(),
  driverId:     text("driver_id").notNull().unique(),   // e.g. "DR-004"
  name:         text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role:         text("role").notNull().default("driver"), // "driver" | "management"
  isAdmin:          boolean("is_admin").notNull().default(false),
  assignedVehicleId: integer("assigned_vehicle_id").references(() => vehicles.id),
  active:           boolean("active").notNull().default(true),
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
  type:       text("type").notNull().default("van"),  // "van" | "tractor"
  active:     boolean("active").notNull().default(true),
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
