import type { Metadata } from "next";
import Image from "next/image";
import LoginForm from "@/app/login-form";

export const metadata: Metadata = { title: "Dashboard Login" };

export default function AdminLoginPage() {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-4"
      style={{ background: "linear-gradient(160deg, #4D148C 0%, #7B2FC0 50%, #FF6200 100%)" }}
    >
      <div className="w-full max-w-[440px] flex flex-col items-center">
        <div className="bg-white rounded-3xl p-3 mb-8 shadow-[0_8px_40px_rgba(0,0,0,0.3)]">
          <Image src="/wayne-logo.png" alt="MyGroundOps" width={100} height={62} className="object-contain" />
        </div>
        <h1 className="text-[36px] font-extrabold text-white tracking-tight leading-none mb-2 text-center">
          MyGroundOps
        </h1>
        <p className="text-[15px] text-white/60 text-center mb-8">
          Management Portal · Admin Access Only
        </p>

        <div className="bg-white rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.4)] w-full">
          <div className="h-[5px]" style={{ background: "linear-gradient(90deg, #4D148C, #FF6200)" }} />
          <LoginForm variant="card" />
        </div>

        <p className="text-center text-[13px] text-white/30 mt-6">
          &copy; {new Date().getFullYear()} MyGroundOps INC
        </p>
      </div>
    </div>
  );
}
