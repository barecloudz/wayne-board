import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { vehicles } from "../lib/schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const FLEET = [
  { unitNumber: "Truck 01", make: "Ford",         model: "Transit 350",   year: 2021, mileage: 84200 },
  { unitNumber: "Truck 02", make: "Ford",         model: "Transit 350",   year: 2022, mileage: 61400 },
  { unitNumber: "Truck 03", make: "Ford",         model: "Transit 350",   year: 2020, mileage: 112800 },
  { unitNumber: "Truck 04", make: "Mercedes-Benz",model: "Sprinter 2500", year: 2021, mileage: 97600 },
  { unitNumber: "Truck 05", make: "Ford",         model: "Transit 350",   year: 2023, mileage: 40100 },
  { unitNumber: "Truck 06", make: "Ford",         model: "Transit 350",   year: 2021, mileage: 88500 },
  { unitNumber: "Truck 07", make: "Mercedes-Benz",model: "Sprinter 2500", year: 2022, mileage: 73200 },
  { unitNumber: "Truck 08", make: "Ford",         model: "Transit 350",   year: 2020, mileage: 136700 },
  { unitNumber: "Truck 09", make: "Ram",          model: "ProMaster 3500",year: 2022, mileage: 58900 },
  { unitNumber: "Truck 10", make: "Ford",         model: "Transit 350",   year: 2021, mileage: 91300 },
  { unitNumber: "Truck 11", make: "Mercedes-Benz",model: "Sprinter 2500", year: 2020, mileage: 159400 },
  { unitNumber: "Truck 12", make: "Ford",         model: "Transit 350",   year: 2019, mileage: 161000 },
];

async function seed() {
  console.log("Seeding vehicles...");
  await db.insert(vehicles).values(
    FLEET.map((v) => ({ ...v, type: "van" as const }))
  ).onConflictDoNothing();
  console.log("Done — 12 vehicles seeded.");
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
