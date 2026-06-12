export const GATE_AREAS = [
  "East Hendersonville",
  "West Hendersonville",
  "North Hendersonville",
  "Zirconia",
] as const;

export type GateArea = (typeof GATE_AREAS)[number];

export type GateCodeRow = {
  id: number;
  location: string;
  code: string;
  addedByName: string;
  active: boolean;
  createdAt: Date | null;
  reportCount: number;
  myReport: boolean;
};
