import { cookies } from "next/headers";

/**
 * Returns the active location ID from the mgops-location cookie,
 * or null if "all" / cookie is missing.
 */
export async function getActiveLocationId(): Promise<number | null> {
  const jar = await cookies();
  const value = jar.get("mgops-location")?.value;
  if (!value || value === "all") return null;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}
