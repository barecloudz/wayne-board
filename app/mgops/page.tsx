"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function MgopsLoginPage() {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/mgops/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      router.push("/mgops/orgs");
    } else {
      setError("Invalid credentials");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#F8FAFC" }}>
      <div
        className="flex flex-col items-center w-full max-w-[360px] rounded-2xl px-8 py-10"
        style={{ background: "#ffffff", border: "1px solid #E2E8F0", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}
      >
        <Image src="/logo-icon.png" alt="MyGroundOps" width={48} height={48} className="object-contain rounded-xl mb-4" />
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-6" style={{ color: "#94A3B8" }}>
          Super Admin
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
          <input
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="Access key"
            className="px-4 py-3 rounded-xl text-[14px] outline-none w-full"
            style={{
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
              color: "#0F172A",
            }}
            autoFocus
          />
          {error && <p className="text-red-500 text-[13px]">{error}</p>}
          <button
            type="submit"
            className="py-3 rounded-xl text-[14px] font-bold w-full"
            style={{ background: "#16A34A", color: "#fff" }}
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
