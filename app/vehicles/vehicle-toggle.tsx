"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setVehicleActive } from "@/lib/actions/vehicles";
import { Loader2 } from "lucide-react";

export default function VehicleToggle({
  vehicleId,
  active,
}: {
  vehicleId: number;
  active: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleToggle() {
    startTransition(async () => {
      await setVehicleActive(vehicleId, !active);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-40 ${
        active
          ? "text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200"
          : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
      }`}
    >
      {isPending ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : active ? (
        "Deactivate"
      ) : (
        "Reactivate"
      )}
    </button>
  );
}
