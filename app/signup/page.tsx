"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, Eye, EyeOff, ChevronRight } from "lucide-react";

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const inputStyle = {
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  color: "#0F172A",
};

const inputBlurBorder = "#E2E8F0";
const inputFocusBorder = "#16A34A";

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
        style={{ color: "#64748B" }}
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
      className="w-full px-4 py-3 rounded-xl text-[15px] outline-none transition-all placeholder-slate-300"
      style={inputStyle}
      onFocus={(e) => (e.target.style.borderColor = inputFocusBorder)}
      onBlur={(e) => (e.target.style.borderColor = inputBlurBorder)}
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
  const [plan, setPlan] = useState<"starter" | "pro">("starter");
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
          plan,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Signup failed. Please try again.");
        setLoading(false);
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        router.push(`/login/${slug}`);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: "#F8FAFC" }}
    >
      {/* Back link */}
      <div className="w-full max-w-[440px] mb-4">
        <a
          href="/"
          className="flex items-center gap-1.5 text-[13px] font-medium transition-colors"
          style={{ color: "#475569" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </a>
      </div>

      {/* Branding */}
      <div className="mb-8 flex flex-col items-center gap-4">
        <Image src="/logo-icon.png" alt="MyGroundOps" width={64} height={64} className="rounded-2xl" />
        <div className="text-center">
          <h1 className="text-[24px] font-extrabold tracking-tight leading-tight" style={{ color: "#0F172A" }}>
            Start your free trial
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "#94A3B8" }}>
            14 days free — no charge until your trial ends
          </p>
        </div>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-[440px] rounded-2xl overflow-hidden"
        style={{
          background: "#ffffff",
          border: "1px solid #E2E8F0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)",
        }}
      >
        {/* Green top accent bar */}
        <div className="h-[3px]" style={{ background: "linear-gradient(90deg, #16A34A, #4ADE80)" }} />

        <form onSubmit={handleSubmit} className="px-7 py-7 flex flex-col gap-4">
          {/* Plan selector */}
          <Field label="Choose Your Plan">
            <div className="flex gap-3">
              {(["starter", "pro"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlan(p)}
                  className="flex-1 py-3 px-4 rounded-xl text-left transition-all"
                  style={{
                    background: plan === p ? "#F0FDF4" : "#ffffff",
                    border: `1px solid ${plan === p ? "#16A34A" : "#E2E8F0"}`,
                  }}
                >
                  <div className="text-[13px] font-bold capitalize" style={{ color: "#0F172A" }}>{p}</div>
                  <div className="text-[12px]" style={{ color: "#475569" }}>
                    ${p === "starter" ? "99" : "199"}/mo
                  </div>
                </button>
              ))}
            </div>
          </Field>

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
              style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}
            >
              <span style={{ color: "#475569" }}>Your login URL:</span>
              <span className="font-semibold" style={{ color: "#16A34A" }}>
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
                className="w-full px-4 py-3 pr-11 rounded-xl text-[15px] outline-none transition-all placeholder-slate-300"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = inputFocusBorder)}
                onBlur={(e) => (e.target.style.borderColor = inputBlurBorder)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: "#94A3B8" }}
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
                className="w-full px-4 py-3 pr-11 rounded-xl text-[15px] outline-none transition-all placeholder-slate-300"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = inputFocusBorder)}
                onBlur={(e) => (e.target.style.borderColor = inputBlurBorder)}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((p) => !p)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: "#94A3B8" }}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>

          {error && (
            <p className="text-[12px] text-center" style={{ color: "#DC2626" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl text-[14px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 mt-1"
            style={{ background: "#16A34A" }}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Redirecting to checkout…" : (
              <>
                Start Free Trial <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* 14 days free badge strip */}
          <div
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-medium"
            style={{ background: "#F0FDF4", color: "#16A34A" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1.5l1.5 3 3.5.5-2.5 2.5.5 3.5L7 9.5l-3 1.5.5-3.5L2 5l3.5-.5L7 1.5z" stroke="#16A34A" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
            </svg>
            14 days free — cancel anytime
          </div>

          <p className="text-center text-[11px]" style={{ color: "#94A3B8" }}>
            By signing up you agree to our{" "}
            <a href="/terms" className="font-semibold underline" style={{ color: "#475569" }}>Terms of Service</a>
            {" "}and{" "}
            <a href="/privacy" className="font-semibold underline" style={{ color: "#475569" }}>Privacy Policy</a>.
          </p>

          <p className="text-center text-[12px] pt-1" style={{ color: "#475569" }}>
            Already have an account?{" "}
            <a href="/sign-in" className="font-semibold transition-colors" style={{ color: "#16A34A" }}>
              Sign in
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
