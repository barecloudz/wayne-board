"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function LogoutButton({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(orgSlug ? `/login/${orgSlug}` : "/sign-in");
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20
        text-[12px] font-semibold text-white/80 hover:bg-white/10 transition-all"
    >
      <LogOut className="w-3.5 h-3.5" />
      Sign Out
    </button>
  );
}
