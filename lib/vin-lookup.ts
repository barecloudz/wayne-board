// Local VIN prefix lookup for commercial vehicles that NHTSA vPIC doesn't classify well.
// VIN positions: 1=country, 2=make, 3=type, 4=GVW/brake, 5=series, 6=body, ...

export type VinLookup = { make: string; model: string };

// Ford P-Series step vans: WMI=1FD, position 5 (index 4) = 'P'
// Position 4 (index 3) is the GVW rating — maps to approximate P-series model
const FORD_P_GVW: Record<string, string> = {
  E: "P500",   // ~6,000–8,500 lbs
  H: "P700",   // ~8,500–10,000 lbs
  J: "P1000",  // ~10,001–14,000 lbs
  K: "P1100",  // ~14,001–16,000 lbs
  L: "P1200",  // ~16,001–19,500 lbs
};

export function vinPrefixLookup(vin: string): VinLookup | null {
  const v = vin.toUpperCase();

  // Ford P-Series: WMI starts 1FD, series code (pos 5) = 'P'
  if (v.startsWith("1FD") && v[4] === "P") {
    const gvw = v[3];
    return { make: "Ford", model: FORD_P_GVW[gvw] ?? "P-Series" };
  }

  // Workhorse W-Series step vans: WMI 5B4, series code 'P'
  if (v.startsWith("5B4") && v[4] === "P") {
    return { make: "Workhorse", model: "W-Series" };
  }

  return null;
}
