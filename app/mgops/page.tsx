"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0F1E" }}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-[320px]">
        <input
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="Access key"
          className="px-4 py-3 rounded-xl text-[14px] outline-none"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
          autoFocus
        />
        {error && <p className="text-red-400 text-[13px]">{error}</p>}
        <button
          type="submit"
          className="py-3 rounded-xl text-[14px] font-bold"
          style={{ background: "#16A34A", color: "#fff" }}
        >
          Continue
        </button>
      </form>
    </div>
  );
}
