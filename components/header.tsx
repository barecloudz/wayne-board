import Image from "next/image";
import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/wayne-logo.png"
            alt="Wayne Logo"
            width={32}
            height={32}
            className="object-contain"
            priority
          />
          <div className="flex flex-col leading-tight">
            <span className="text-base font-semibold text-slate-900">
              Wayne Board
            </span>
            <span className="text-xs text-slate-500">FedEx Operations Suite</span>
          </div>
        </Link>
        <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-3 py-1 rounded-full">
          Demo Preview
        </span>
      </div>
    </header>
  );
}
