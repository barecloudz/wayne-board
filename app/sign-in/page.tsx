"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

function toSlug(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export default function SignInPage() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const slug = toSlug(value.trim());
    if (slug) router.push(`/login/${slug}`);
  }

  const slug = toSlug(value.trim());

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "#0A0F1E" }}
    >
      <div className="mb-8 flex flex-col items-center gap-4">
        <Image src="/logo-icon.png" alt="MyGroundOps" width={64} height={64} className="rounded-2xl" />
        <div className="text-center">
          <h1 className="text-[24px] font-extrabold text-white tracking-tight">Sign In</h1>
          <p className="text-[13px] mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            Enter your company URL to continue
          </p>
        </div>
      </div>

      <div
        className="w-full max-w-[400px] rounded-2xl overflow-hidden"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="h-[3px]" style={{ background: "linear-gradient(90deg, #16A34A, #4ADE80)" }} />
        <form onSubmit={handleSubmit} className="px-7 py-7 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              Company URL
            </label>
            <div
              className="flex items-center rounded-xl overflow-hidden"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <span className="pl-4 text-[13px] whitespace-nowrap flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
                /login/
              </span>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="your-company"
                autoCapitalize="none"
                autoCorrect="off"
                className="flex-1 min-w-0 px-2 py-3 text-[15px] text-white placeholder-white/20 outline-none bg-transparent"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!slug}
            className="w-full py-3.5 rounded-xl text-[14px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 mt-1"
            style={{ background: "#16A34A" }}
          >
            Continue
          </button>

          <p className="text-center text-[12px]" style={{ color: "rgba(255,255,255,0.35)" }}>
            Don&apos;t have an account?{" "}
            <a href="/signup" className="font-semibold" style={{ color: "#4ADE80" }}>
              Get started
            </a>
          </p>
        </form>
      </div>

      <p className="mt-8 text-[12px]" style={{ color: "rgba(255,255,255,0.2)" }}>
        Powered by{" "}
        <a href="/" className="hover:text-white/40 transition-colors">
          MyGroundOps
        </a>
      </p>
    </div>
  );
}
