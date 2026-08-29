"use client";

import dynamic from "next/dynamic";

const TruckViewer = dynamic(() => import("./TruckViewer"), { ssr: false });

export default function TiresClient() {
  return (
    <div className="flex-1 flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      <TruckViewer />
    </div>
  );
}
