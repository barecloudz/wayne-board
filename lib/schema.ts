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
  active:       boolean("active").notNull().default(true),
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
  category:    text("category"),              // e.g. "customer_feedback", "on_time", "safety"
  content:     text("content").notNull(),
  week:        text("week"),                  // "2026-W18" (optional, ties to a score week)
  improvement: text("improvement"),           // improvement tip for negatives
  createdAt:   timestamp("created_at").defaultNow(),
});
