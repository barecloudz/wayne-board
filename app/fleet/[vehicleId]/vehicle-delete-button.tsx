"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { deleteVehicle } from "@/lib/actions/vehicles";

export default function VehicleDeleteButton({ vehicleId }: { vehicleId: number }) {
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    startTransition(async () => {
      await deleteVehicle(vehicleId);
      router.push("/fleet");
    });
  }

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold
          border border-red-200 text-red-500 bg-white hover:bg-red-50 hover:border-red-300
          active:scale-[0.98] transition-all duration-150"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete Truck
      </button>

      {confirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-sm">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </div>
                <h2 className="text-[16px] font-extrabold text-slate-900">Delete Truck?</h2>
              </div>
              <p className="text-[13px] text-slate-500">
                This will permanently delete the truck and all its inspection history. This cannot be undone.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => setConfirm(false)}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200
                  text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-red-500 text-white
                  hover:bg-red-600 transition-colors disabled:opacity-50
                  flex items-center justify-center gap-2"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
