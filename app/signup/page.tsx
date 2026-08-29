"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, Eye, EyeOff, ChevronRight } from "lucide-react";

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const inputStyle = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  autoCapitalize,
  autoCorrect,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoCapitalize?: string;
  autoCorrect?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      className="w-full px-4 py-3 rounded-xl text-[15px] text-white placeholder-white/20 outline-none transition-all"
      style={inputStyle}
      onFocus={(e) => (e.target.style.borderColor = "#16A34A")}
      onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
    />
  );
}

export default function SignupPage() {
  const router = useRouter();

  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [driverId, setDriverId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const slug = toSlug(companyName);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!companyName.trim() || !ownerName.trim() || !driverId.trim() || !password || !confirmPassword) {
      setError("All fields are required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!slug) {
      setError("Company name is invalid.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          slug,
          ownerName: ownerName.trim(),
          driverId: driverId.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Signup failed. Please try again.");
        setLoading(false);
        return;
      }
      router.push(`/login/${data.slug}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "#0A0F1E" }}
    >
      {/* Branding */}
      <div className="mb-8 flex flex-col items-center gap-4">
        <Image src="/logo-icon.png" alt="MyGroundOps" width={64} height={64} className="rounded-2xl" />
        <div className="text-center">
          <h1 className="text-[24px] font-extrabold text-white tracking-tight leading-tight">
            Create your account
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            Set up your station on MyGroundOps
          </p>
        </div>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-[440px] rounded-2xl overflow-hidden"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="h-[3px]" style={{ background: "linear-gradient(90deg, #16A34A, #4ADE80)" }} />

        <form onSubmit={handleSubmit} className="px-7 py-7 flex flex-col gap-4">
          {/* Company name */}
          <Field label="Company Name">
            <TextInput
              value={companyName}
              onChange={setCompanyName}
              placeholder="Acme Logistics LLC"
            />
          </Field>

          {/* Live slug preview */}
          {slug && (
            <div
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[12px]"
              style={{ background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.2)" }}
            >
              <span style={{ color: "rgba(255,255,255,0.4)" }}>Your login URL:</span>
              <span className="font-semibold" style={{ color: "#4ADE80" }}>
                mygroundops.com/login/{slug}
              </span>
            </div>
          )}

          {/* Owner name */}
          <Field label="Your Name">
            <TextInput
              value={ownerName}
              onChange={setOwnerName}
              placeholder="Jane Smith"
            />
          </Field>

          {/* FedEx Driver ID */}
          <Field label="FedEx Driver ID">
            <TextInput
              value={driverId}
              onChange={setDriverId}
              placeholder="e.g. 1234567"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </Field>

          {/* Password */}
          <Field label="Password">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full px-4 py-3 pr-11 rounded-xl text-[15px] text-white placeholder-white/20 outline-none transition-all"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = "#16A34A")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>

          {/* Confirm password */}
          <Field label="Confirm Password">
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full px-4 py-3 pr-11 rounded-xl text-[15px] text-white placeholder-white/20 outline-none transition-all"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = "#16A34A")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((p) => !p)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>

          {error && (
            <p className="text-[12px] text-center" style={{ color: "#f87171" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl text-[14px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 mt-1"
            style={{ background: "#16A34A" }}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Creating account…" : (
              <>
                Get Started <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-center text-[12px] pt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
            Already have an account?{" "}
            <a href="/" className="font-semibold transition-colors" style={{ color: "#4ADE80" }}>
              Sign in
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
