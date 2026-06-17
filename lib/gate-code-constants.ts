export const DEFAULT_GATE_AREAS = [
  "East Hendersonville",
  "West Hendersonville",
  "North Hendersonville",
  "Zirconia",
];

// Keep GATE_AREAS export for backwards-compat
export const GATE_AREAS = DEFAULT_GATE_AREAS;
export type GateArea = string;

export type GateCodeRow = {
  id: number;
  location: string;
  roadName: string | null;
  code: string;
  addedByName: string;
  active: boolean;
  createdAt: Date | null;
  reportCount: number;
  myReport: boolean;
};
