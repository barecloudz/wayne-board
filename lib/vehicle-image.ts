export function getVehicleImage(model: string): string | null {
  const m = model.toLowerCase();
  if (m.includes("transit")) return "/transit.png";
  if (m.includes("p1000") || m.includes("promaster 1000")) return "/p1000.png";
  return null;
}
