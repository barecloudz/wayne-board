import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { vehicles } from "../lib/schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// All vans — Ford Transit 350 and Ford P700/P1000 step vans
// VINs are realistic format but not real
const FLEET = [
  { unitNumber: "Truck 01", make: "Ford", model: "Transit 350",  year: 2022, mileage: 67450,  vin: "1FTBR1Y82NKA10142" },
  { unitNumber: "Truck 02", make: "Ford", model: "Transit 350",  year: 2021, mileage: 89200,  vin: "1FTBR1Y84MKA20837" },
  { unitNumber: "Truck 03", make: "Ford", model: "Transit 350",  year: 2021, mileage: 84200,  vin: "1FTBR1Y86MKA31594" },
  { unitNumber: "Truck 04", make: "Ford", model: "Transit 350",  year: 2023, mileage: 41300,  vin: "1FTBR1Y88PKA44021" },
  { unitNumber: "Truck 05", make: "Ford", model: "Transit 350",  year: 2020, mileage: 118600, vin: "1FTBR1Y80LKA55783" },
  { unitNumber: "Truck 06", make: "Ford", model: "Transit 350",  year: 2022, mileage: 64200,  vin: "1FTBR1Y82NKA66410" },
  { unitNumber: "Truck 07", make: "Ford", model: "Transit 350",  year: 2021, mileage: 91800,  vin: "1FTBR1Y84MKA77162" },
  { unitNumber: "Truck 08", make: "Ford", model: "P700",         year: 2014, mileage: 187400, vin: "1FDXE45P4EHB08834" },
  { unitNumber: "Truck 09", make: "Ford", model: "P700",         year: 2013, mileage: 201300, vin: "1FDXE45P2DHB19561" },
  { unitNumber: "Truck 10", make: "Ford", model: "P1000",        year: 2015, mileage: 163800, vin: "1FDXE4FS9FHB20293" },
  { unitNumber: "Truck 11", make: "Ford", model: "P1000",        year: 2014, mileage: 178500, vin: "1FDXE4FS7EHB31047" },
  { unitNumber: "Truck 12", make: "Ford", model: "P700",         year: 2012, mileage: 224100, vin: "1FDXE45P0CHB41729" },
];

async function fix() {
  console.log("Clearing existing vehicles...");
  await db.delete(vehicles);

  console.log("Inserting corrected fleet...");
  await db.insert(vehicles).values(
    FLEET.map((v) => ({ ...v, type: "van" as const }))
  );

  console.log("Done — 12 vehicles updated.");
  process.exit(0);
}

fix().catch((e) => { console.error(e); process.exit(1); });
