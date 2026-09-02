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
      style={{ background: "#F8FAFC" }}
    >
      {/* Branding */}
      <div className="mb-8 flex flex-col items-center gap-4">
        <Image src="/logo-icon.png" alt="MyGroundOps" width={64} height={64} className="rounded-2xl" />
        <div className="text-center">
          <h1 className="text-[24px] font-extrabold tracking-tight" style={{ color: "#0F172A" }}>
            Sign In
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "#94A3B8" }}>
            Enter your company URL to continue
          </p>
        </div>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-[400px] rounded-2xl overflow-hidden"
        style={{
          background: "#ffffff",
          border: "1px solid #E2E8F0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)",
        }}
      >
        {/* Green top accent bar */}
        <div className="h-[3px]" style={{ background: "linear-gradient(90deg, #16A34A, #4ADE80)" }} />

        <form onSubmit={handleSubmit} className="px-7 py-7 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: "#64748B" }}
            >
              Company URL
            </label>
            <div
              className="flex items-center rounded-xl overflow-hidden transition-all"
              style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}
              onFocusCapture={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#16A34A";
              }}
              onBlurCapture={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#E2E8F0";
              }}
            >
              <span
                className="pl-4 text-[13px] whitespace-nowrap flex-shrink-0"
                style={{ color: "#94A3B8" }}
              >
                /login/
              </span>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="your-company"
                autoCapitalize="none"
                autoCorrect="off"
                className="flex-1 min-w-0 px-2 py-3 text-[15px] outline-none bg-transparent placeholder-slate-300"
                style={{ color: "#0F172A" }}
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

          <p className="text-center text-[12px]" style={{ color: "#475569" }}>
            Don&apos;t have an account?{" "}
            <a href="/signup" className="font-semibold transition-colors" style={{ color: "#16A34A" }}>
              Get started
            </a>
          </p>
        </form>
      </div>

      <p className="mt-8 text-[12px]" style={{ color: "#94A3B8" }}>
        Powered by{" "}
        <a href="/" className="hover:underline transition-colors" style={{ color: "#94A3B8" }}>
          MyGroundOps
        </a>
      </p>
    </div>
  );
}
