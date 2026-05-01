import Image from "next/image";
import Link from "next/link";

export default function MobileHeader() {
  return (
    <header className="md:hidden flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 sticky top-0 z-40">
      <Link href="/" className="flex items-center gap-2.5">
        <Image src="/wayne-logo.png" alt="Wayne" width={44} height={28} className="object-contain" />
        <span className="text-sm font-bold text-slate-900">Wayne Board</span>
      </Link>
      <span className="bg-yellow-50 border border-yellow-200 text-yellow-700 text-[11px] font-semibold px-2.5 py-1 rounded-full">
        Demo
      </span>
    </header>
  );
}
