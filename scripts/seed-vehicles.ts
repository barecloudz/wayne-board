import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { vehicles, inspections, inspectionResults } from "../lib/schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// Active fleet from 742 Logistics CSV (excluding scrap/equip storage)
const FLEET = [
  { unitNumber: "476709", make: "Ford",         model: "Transit 350", year: 2021, mileage: 62944, vin: "1FTRU8UG0MKA34872" },
  { unitNumber: "476710", make: "Ford",         model: "Transit 350", year: 2021, mileage: 65466, vin: "1FTRU8UG1MKA34878" },
  { unitNumber: "476711", make: "Ford",         model: "Transit 350", year: 2021, mileage: 75660, vin: "1FTRU8UG1MKA34900" },
  { unitNumber: "476712", make: "Ford",         model: "Transit 350", year: 2021, mileage: 79648, vin: "1FTRU8UG2MKA34906" },
  { unitNumber: "476713", make: "Ford",         model: "Transit 350", year: 2021, mileage: 0,     vin: "1FTRU8UG4MKA34860" },
  { unitNumber: "476714", make: "Ford",         model: "Transit 350", year: 2021, mileage: 57392, vin: "1FTRU8UG8MKA34909" },
  { unitNumber: "476715", make: "Ford",         model: "Transit 350", year: 2021, mileage: 86004, vin: "1FTRU8UG9MKA34868" },
  { unitNumber: "476716", make: "Ford",         model: "Transit 350", year: 2021, mileage: 34403, vin: "1FTRU8UG9MKA34904" },
  { unitNumber: "476717", make: "Ford",         model: "Transit 350", year: 2021, mileage: 62140, vin: "1FTRU8UG0MKA34905" },
  { unitNumber: "476718", make: "Morgan Olson", model: "F59 P1000",   year: 2021, mileage: 59697, vin: "1F65F5KN3M0A12260" },
  { unitNumber: "446178", make: "Ford",         model: "E450",        year: 2021, mileage: 78359, vin: "1FC3E4KK5MDC01931" },
  { unitNumber: "447904", make: "Ford",         model: "E450",        year: 2021, mileage: 92285, vin: "1FC3E4KK9MDC20255" },
  { unitNumber: "447905", make: "Ford",         model: "E450",        year: 2021, mileage: 70158, vin: "1FC3E4KK5MDC20253" },
  { unitNumber: "447906", make: "Ford",         model: "E450",        year: 2021, mileage: 83723, vin: "1FC3E4KK7MDC20254" },
  { unitNumber: "445658", make: "Ford",         model: "Transit",     year: 2020, mileage: 0,     vin: "1FTRS4XG3LKB50088" },
  { unitNumber: "445660", make: "Ford",         model: "Transit",     year: 2020, mileage: 77700, vin: "1FTRS4XG6LKB50084" },
  { unitNumber: "445510", make: "Ford",         model: "Transit",     year: 2020, mileage: 80944, vin: "1F64F5KNXL0A09494" },
  { unitNumber: "415364", make: "Freightliner", model: "P-700",       year: 2019, mileage: 0,     vin: "4UZAANFD8KCKV5257" },
];

async function seed() {
  console.log("Clearing inspections and vehicles...");
  await db.delete(inspectionResults);
  await db.delete(inspections);
  await db.delete(vehicles);

  console.log(`Inserting ${FLEET.length} vehicles from 742 Logistics fleet...`);
  await db.insert(vehicles).values(
    FLEET.map((v) => ({ ...v, type: "van" as const, active: true }))
  );

  console.log("Done.");
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
