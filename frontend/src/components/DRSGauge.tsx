"use client";

import {useEffect, useState} from "react";
import {animate, useReducedMotion} from "motion/react";
import {tierForDrs, TIER_META} from "@/lib/drs";
import {RiskPill} from "./RiskPill";
import {formatPct, cn} from "@/lib/utils";

const CX = 110;
const CY = 110;
const R = 86;
const SW = 16;
const START = 135;
const SWEEP = 270;

function polar(deg: number, r = R) {
  const rad = (deg * Math.PI) / 180;
  return {x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad)};
}

function arcPath(fromDeg: number, toDeg: number, r = R) {
  const a = polar(fromDeg, r);
  const b = polar(toDeg, r);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

const TRACK = arcPath(START, START + SWEEP);

/** The product's hero reading: an animated risk gauge with its D / A breakdown. */
export function DRSGauge({
  drs,
  d,
  a,
  gated = false,
  className,
}: {
  drs: number;
  d: number;
  a: number;
  gated?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? drs : 0);
  const tier = tierForDrs(drs);
  const meta = TIER_META[tier];

  useEffect(() => {
    if (reduce) {
      setShown(drs);
      return;
    }
    const controls = animate(0, drs, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setShown,
    });
    return () => controls.stop();
  }, [drs, reduce]);

  const marker = polar(START + SWEEP * shown);

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div
        className="relative"
        role="img"
        aria-label={`Dilution Risk Score ${formatPct(drs)}, ${gated ? "gated" : meta.label} risk`}
      >
        <svg width="220" height="200" viewBox="0 0 220 196" fill="none">
          <defs>
            <linearGradient id="drs-spectrum" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--risk-low)" />
              <stop offset="50%" stopColor="var(--risk-mid)" />
              <stop offset="100%" stopColor="var(--risk-high)" />
            </linearGradient>
          </defs>
          {/* Faint spectrum track: shows where the value sits on the risk scale. */}
          <path
            d={TRACK}
            stroke="url(#drs-spectrum)"
            strokeWidth={SW}
            strokeLinecap="round"
            opacity={0.18}
          />
          {/* Value arc, solid tier color, revealed up to the score. */}
          <path
            d={TRACK}
            stroke={meta.cssVar}
            strokeWidth={SW}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={`${Math.max(shown, 0.0001)} 1`}
          />
          {/* Value marker. */}
          <circle cx={marker.x} cy={marker.y} r={7.5} fill="var(--bg)" />
          <circle cx={marker.x} cy={marker.y} r={5} fill={meta.cssVar} />
        </svg>

        {/* Center readout. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
          <div className="font-mono text-5xl font-semibold leading-none tnum text-ink">
            {Math.round(shown * 100)}
            <span className="text-2xl text-muted">%</span>
          </div>
          <div className="mt-1.5 text-[11px] uppercase tracking-[0.18em] text-faint">DRS</div>
        </div>
      </div>

      <div className="-mt-2">
        <RiskPill drs={drs} gated={gated} />
      </div>

      {/* D / A breakdown: the two channels that compose the score. */}
      <div className="mt-5 grid w-full max-w-[260px] grid-cols-1 gap-2.5">
        <Channel label="Duplication" sub="D" value={d} />
        <Channel label="AI replicability" sub="A" value={a} />
      </div>
    </div>
  );
}

function Channel({label, sub, value}: {label: string; sub: string; value: number}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">
            {label} <span className="font-mono text-faint">{sub}</span>
          </span>
          <span className="font-mono tnum text-ink">{formatPct(value)}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary-ink/70 transition-[width] duration-700 ease-out"
            style={{width: `${Math.round(value * 100)}%`}}
          />
        </div>
      </div>
    </div>
  );
}
