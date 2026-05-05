export type InspectionStatus = "OK" | "Repair Needed" | "N/A" | "A/D";

export type InspectionComponent = {
  id: number;
  name: string;
  regulation: string;
  description: string;
  requiresAccess: boolean; // true if asterisk in form (items 1-7, 16-18)
  affectsSafety: boolean;  // true for items 1-15, 19-20
  tractorOnly?: boolean;      // true for 18, 19, 20
  vansOnly?: boolean;         // true for 17 ("Straight Trucks and Vans Only")
  evNotApplicable?: boolean;  // true for 12 (Fuel System)
};

export type InspectionItemResult = {
  componentId: number;
  status: InspectionStatus;
  dateRepaired?: string; // MM/DD/YY if Repair Needed and fixed
  notes?: string;
};

export type Inspection = {
  id: string;
  vehicleId: string;
  inspectorName: string;
  inspectorId: string;
  stationName: string;
  stationNumber: string;
  vehicleUnitNumber: string;
  inspectionDate: string;
  outOfService: boolean;
  outOfServiceDocs?: string;
  results: InspectionItemResult[];
  // Notification Section (only filled if any defects)
  notificationDate?: string;
  notifiedAOBCName?: string;
  agreedRepairDate?: string;
  status: "Draft" | "Complete" | "Defects Pending Repair" | "Out of Service";
};

export type Vehicle = {
  id: string;
  unitNumber: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  type: "van" | "tractor";
  latestInspection?: Inspection;
};
