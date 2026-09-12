"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { getLocationsForOrg } from "@/lib/actions/driver-locations";

type Location = { id: number; name: string; terminalId: string | null };

type LocationContextValue = {
  locations: Location[];
  selectedLocationIds: number[];
  setSelectedLocationIds: (ids: number[]) => void;
  allSelected: boolean;
};

const LocationContext = createContext<LocationContextValue>({
  locations: [],
  selectedLocationIds: [],
  setSelectedLocationIds: () => {},
  allSelected: true,
});

const STORAGE_KEY = "mgops_location_filter";

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationIds, setSelectedLocationIdsRaw] = useState<number[]>([]);

  useEffect(() => {
    getLocationsForOrg().then(locs => {
      setLocations(locs);
      // Restore from localStorage, default to all selected
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed: number[] = JSON.parse(stored);
          // Only keep ids that still exist
          const valid = parsed.filter(id => locs.some(l => l.id === id));
          setSelectedLocationIdsRaw(valid.length > 0 ? valid : locs.map(l => l.id));
        } else {
          setSelectedLocationIdsRaw(locs.map(l => l.id));
        }
      } catch {
        setSelectedLocationIdsRaw(locs.map(l => l.id));
      }
    }).catch(() => {});
  }, []);

  function setSelectedLocationIds(ids: number[]) {
    setSelectedLocationIdsRaw(ids);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch {}
  }

  const allSelected = locations.length === 0 || locations.every(l => selectedLocationIds.includes(l.id));

  return (
    <LocationContext.Provider value={{ locations, selectedLocationIds, setSelectedLocationIds, allSelected }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationContext() {
  return useContext(LocationContext);
}
