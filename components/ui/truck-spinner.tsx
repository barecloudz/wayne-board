"use client";

interface TruckSpinnerProps {
  size?: number;
  className?: string;
}

export default function TruckSpinner({ size = 64, className }: TruckSpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={className}
      style={{ width: size, height: size, flexShrink: 0 }}
    >
      <style>{`
        @keyframes truck-orbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .truck-orbit { animation-play-state: paused !important; }
        }
      `}</style>
      <svg
        viewBox="220 -5 240 240"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Tire tracks — static rings */}
        <circle cx="340" cy="115" r="70" fill="none" stroke="#1C4836" strokeWidth="5.4" strokeLinecap="round" strokeDasharray="15 424.8" opacity="0.58" transform="rotate(-102.3 340 115)" />
        <circle cx="340" cy="115" r="70" fill="none" stroke="#1C4836" strokeWidth="5.2" strokeLinecap="round" strokeDasharray="15 424.8" opacity="0.46" transform="rotate(-117 340 115)" />
        <circle cx="340" cy="115" r="70" fill="none" stroke="#1C4836" strokeWidth="5"   strokeLinecap="round" strokeDasharray="15 424.8" opacity="0.35" transform="rotate(-131.8 340 115)" />
        <circle cx="340" cy="115" r="70" fill="none" stroke="#1C4836" strokeWidth="4.8" strokeLinecap="round" strokeDasharray="15 424.8" opacity="0.25" transform="rotate(-146.5 340 115)" />
        <circle cx="340" cy="115" r="70" fill="none" stroke="#1C4836" strokeWidth="4.6" strokeLinecap="round" strokeDasharray="15 424.8" opacity="0.16" transform="rotate(-161.2 340 115)" />
        <circle cx="340" cy="115" r="70" fill="none" stroke="#1C4836" strokeWidth="4.4" strokeLinecap="round" strokeDasharray="15 424.8" opacity="0.09" transform="rotate(-176 340 115)" />
        <circle cx="340" cy="115" r="70" fill="none" stroke="#1C4836" strokeWidth="4.2" strokeLinecap="round" strokeDasharray="15 424.8" opacity="0.04" transform="rotate(-190.7 340 115)" />

        <circle cx="340" cy="115" r="52" fill="none" stroke="#1C4836" strokeWidth="5.4" strokeLinecap="round" strokeDasharray="15 311.7" opacity="0.58" transform="rotate(-106.5 340 115)" />
        <circle cx="340" cy="115" r="52" fill="none" stroke="#1C4836" strokeWidth="5.2" strokeLinecap="round" strokeDasharray="15 311.7" opacity="0.46" transform="rotate(-126.4 340 115)" />
        <circle cx="340" cy="115" r="52" fill="none" stroke="#1C4836" strokeWidth="5"   strokeLinecap="round" strokeDasharray="15 311.7" opacity="0.35" transform="rotate(-146.2 340 115)" />
        <circle cx="340" cy="115" r="52" fill="none" stroke="#1C4836" strokeWidth="4.8" strokeLinecap="round" strokeDasharray="15 311.7" opacity="0.25" transform="rotate(-166 340 115)" />
        <circle cx="340" cy="115" r="52" fill="none" stroke="#1C4836" strokeWidth="4.6" strokeLinecap="round" strokeDasharray="15 311.7" opacity="0.16" transform="rotate(-185.8 340 115)" />
        <circle cx="340" cy="115" r="52" fill="none" stroke="#1C4836" strokeWidth="4.4" strokeLinecap="round" strokeDasharray="15 311.7" opacity="0.09" transform="rotate(-205.7 340 115)" />
        <circle cx="340" cy="115" r="52" fill="none" stroke="#1C4836" strokeWidth="4.2" strokeLinecap="round" strokeDasharray="15 311.7" opacity="0.04" transform="rotate(-225.5 340 115)" />

        {/* Truck — orbits the donut center */}
        <g
          className="truck-orbit"
          style={{
            transformBox: "view-box",
            transformOrigin: "340px 115px",
            animation: "truck-orbit 1.6s linear infinite",
          }}
        >
          <g transform="translate(340,54)">
            {/* Truck tilted at slip angle */}
            <g transform="rotate(26)">
              {/* Drop shadow */}
              <rect x="-30" y="-15" width="58" height="30" rx="4" fill="#1C4836" opacity="0.16" />
              {/* Rear tires */}
              <rect x="-17" y="-16.5" width="7" height="4" rx="1.5" fill="#1C4836" />
              <rect x="-17" y="12.5"  width="7" height="4" rx="1.5" fill="#1C4836" />
              {/* Front tires (steered) */}
              <g transform="rotate(-24 14 -14.5)">
                <rect x="10.5" y="-16.5" width="7" height="4" rx="1.5" fill="#1C4836" />
              </g>
              <g transform="rotate(-24 14 14.5)">
                <rect x="10.5" y="12.5" width="7" height="4" rx="1.5" fill="#1C4836" />
              </g>
              {/* Cargo body */}
              <path d="M-28 -14 L17 -14 Q25 -14 27 -8 L27 8 Q25 14 17 14 L-28 14 Q-31 14 -31 11 L-31 -11 Q-31 -14 -28 -14 Z" fill="#2F7055" stroke="#1C4836" strokeWidth="1.4" strokeLinejoin="round" />
              {/* Cab section (darker green) */}
              <path d="M-28 -14 L4 -14 L4 14 L-28 14 Q-31 14 -31 11 L-31 -11 Q-31 -14 -28 -14 Z" fill="#1C4836" />
              {/* Cab/cargo divider */}
              <path d="M4 -14 L4 14" stroke="#1C4836" strokeWidth="1.4" />
              {/* Windshield area */}
              <path d="M18 -12.4 Q24.2 -12 25.6 -7.6 L25.6 7.6 Q24.2 12 18 12.4 Z" fill="#1C4836" />
              {/* Side panel detail */}
              <rect x="-29.5" y="-10" width="2.4" height="20" rx="1" fill="#1C4836" opacity="0.55" />
              <rect x="-18"   y="-13" width="1.4" height="26"   fill="#1C4836" opacity="0.2" />
              <rect x="-7"    y="-13" width="1.4" height="26"   fill="#1C4836" opacity="0.2" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
