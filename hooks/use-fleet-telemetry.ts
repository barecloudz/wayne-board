"use client";

import { useRef, useState, useCallback, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TiltState {
  rotateX: number;   // degrees, -MAX..MAX
  rotateY: number;
  glowX: number;     // 0..1 normalized cursor position within element
  glowY: number;
  isHovered: boolean;
}

export interface FleetTelemetryOptions {
  maxTilt?: number;      // degrees, default 8
  glowRadius?: number;   // px, default 320
  glowOpacity?: number;  // 0..1, default 0.15
  perspective?: number;  // px, default 800
  easing?: number;       // lerp factor per frame, default 0.12 (lower = smoother)
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useFleetTelemetry
 *
 * Cursor-reactive 3D tilt + radial glow for fleet dashboard cards.
 *
 * Usage:
 *   const { ref, tilt, glowStyle, cardStyle, handlers } = useFleetTelemetry();
 *   <div ref={ref} style={cardStyle} {...handlers}>
 *     <div style={glowStyle} className="pointer-events-none absolute inset-0 rounded-2xl" />
 *     ...content...
 *   </div>
 */
export function useFleetTelemetry<T extends HTMLElement = HTMLDivElement>(
  opts: FleetTelemetryOptions = {}
) {
  const {
    maxTilt     = 8,
    glowRadius  = 320,
    glowOpacity = 0.15,
    perspective = 800,
    easing      = 0.12,
  } = opts;

  const ref        = useRef<T>(null);
  const rafRef     = useRef<number>(0);
  const targetRef  = useRef({ rx: 0, ry: 0, gx: 0.5, gy: 0.5 });
  const currentRef = useRef({ rx: 0, ry: 0, gx: 0.5, gy: 0.5 });

  const [tilt, setTilt] = useState<TiltState>({
    rotateX: 0, rotateY: 0, glowX: 0.5, glowY: 0.5, isHovered: false,
  });

  // Animation loop — lerps current toward target for buttery motion
  const startLoop = useCallback(() => {
    const loop = () => {
      const cur = currentRef.current;
      const tgt = targetRef.current;
      const lerp = (a: number, b: number) => a + (b - a) * easing;

      cur.rx = lerp(cur.rx, tgt.rx);
      cur.ry = lerp(cur.ry, tgt.ry);
      cur.gx = lerp(cur.gx, tgt.gx);
      cur.gy = lerp(cur.gy, tgt.gy);

      setTilt(prev => ({
        ...prev,
        rotateX: cur.rx,
        rotateY: cur.ry,
        glowX: cur.gx,
        glowY: cur.gy,
      }));

      const settled =
        Math.abs(cur.rx - tgt.rx) < 0.01 &&
        Math.abs(cur.ry - tgt.ry) < 0.01 &&
        Math.abs(cur.gx - tgt.gx) < 0.001 &&
        Math.abs(cur.gy - tgt.gy) < 0.001;

      if (!settled) rafRef.current = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, [easing]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<T>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x  = e.clientX - rect.left;
      const y  = e.clientY - rect.top;
      const nx = (x / rect.width)  * 2 - 1;  // -1..1
      const ny = (y / rect.height) * 2 - 1;

      targetRef.current = {
        rx: -ny * maxTilt,
        ry:  nx * maxTilt,
        gx:  x / rect.width,
        gy:  y / rect.height,
      };
      startLoop();
    },
    [maxTilt, startLoop]
  );

  const onMouseEnter = useCallback(() => {
    setTilt(prev => ({ ...prev, isHovered: true }));
  }, []);

  const onMouseLeave = useCallback(() => {
    targetRef.current = { rx: 0, ry: 0, gx: 0.5, gy: 0.5 };
    setTilt(prev => ({ ...prev, isHovered: false }));
    startLoop();
  }, [startLoop]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── Derived styles ──────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    transform: `perspective(${perspective}px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
    transition: tilt.isHovered ? "none" : "transform 0.6s cubic-bezier(0.23,1,0.32,1)",
    willChange: "transform",
    position: "relative",
  };

  // Radial spotlight that follows cursor within the card
  const glowStyle: React.CSSProperties = {
    background: `radial-gradient(${glowRadius}px circle at ${tilt.glowX * 100}% ${tilt.glowY * 100}%, rgba(255,255,255,${glowOpacity}), transparent 70%)`,
    opacity: tilt.isHovered ? 1 : 0,
    transition: "opacity 0.3s ease",
    borderRadius: "inherit",
  };

  const handlers = { onMouseMove, onMouseEnter, onMouseLeave } as const;

  return { ref, tilt, cardStyle, glowStyle, handlers };
}

// ── Brand-colored glow variant (for dark driver/fleet cards) ──────────────────

export function useBrandGlow<T extends HTMLElement = HTMLDivElement>(
  opts: FleetTelemetryOptions & { color?: string } = {}
) {
  const { color = "var(--brand)", glowOpacity = 0.12, glowRadius = 320, ...rest } = opts;
  const telemetry = useFleetTelemetry<T>({ ...rest, glowOpacity, glowRadius });

  // Replace white glow with brand-color glow
  const brandGlowStyle: React.CSSProperties = {
    ...telemetry.glowStyle,
    background: `radial-gradient(${glowRadius}px circle at ${telemetry.tilt.glowX * 100}% ${telemetry.tilt.glowY * 100}%, ${color}${Math.round(glowOpacity * 255).toString(16).padStart(2, "0")}, transparent 70%)`,
  };

  return { ...telemetry, brandGlowStyle };
}
