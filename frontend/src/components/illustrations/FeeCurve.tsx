"use client";

import {motion, useReducedMotion} from "motion/react";

/**
 * The pricing mechanism made visible: LP fee scales linearly with DRS
 * (base 0.30% -> max 1.00%), and pools above the 0.85 gate are rejected.
 * Brand blue carries the fee line (the mechanism); red marks only the gated
 * zone (risk semantics). Draws itself in on scroll; static under reduced motion.
 */
const W = 640;
const H = 280;
const PL = 56; // left pad
const PR = 28;
const PT = 28;
const PB = 44;

const GATE = 0.85;
const BASE = 0.3;
const MAX = 1.0;

const x = (drs: number) => PL + drs * (W - PL - PR);
const y = (feePct: number) => {
  // map fee 0.30..1.00 -> plot top..bottom (inverted)
  const t = (feePct - BASE) / (MAX - BASE);
  return H - PB - t * (H - PT - PB);
};

const feeAt = (drs: number) => BASE + (MAX - BASE) * drs;

export function FeeCurve({className}: {className?: string}) {
  const reduce = useReducedMotion();

  const lineStart = {x: x(0), y: y(feeAt(0))};
  const gatePt = {x: x(GATE), y: y(feeAt(GATE))};
  const lineEnd = {x: x(1), y: y(feeAt(1))};
  const linePath = `M ${lineStart.x} ${lineStart.y} L ${lineEnd.x} ${lineEnd.y}`;

  const draw = reduce
    ? {}
    : {
        initial: {pathLength: 0},
        whileInView: {pathLength: 1},
        viewport: {once: true, margin: "-15%"},
        transition: {duration: 1.1, ease: [0.16, 1, 0.3, 1] as const},
      };

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="LP fee scales with the Dilution Risk Score from 0.30% to 1.00%, and pools above the 0.85 gate are rejected.">
        {/* horizontal gridlines */}
        {[0.3, 0.475, 0.65, 0.825, 1.0].map((f) => (
          <line
            key={f}
            x1={PL}
            x2={W - PR}
            y1={y(f)}
            y2={y(f)}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}

        {/* gated zone (DRS > 0.85): risk-red wash + boundary */}
        <rect
          x={x(GATE)}
          y={PT}
          width={W - PR - x(GATE)}
          height={H - PT - PB}
          fill="var(--risk-high)"
          opacity={0.08}
        />
        <line
          x1={x(GATE)}
          x2={x(GATE)}
          y1={PT}
          y2={H - PB}
          stroke="var(--risk-high)"
          strokeWidth={1.5}
          strokeDasharray="3 4"
          opacity={0.8}
        />
        <text x={x(GATE) + 8} y={PT + 14} className="fill-[var(--risk-high)] font-mono" fontSize="11">
          gate 0.85
        </text>

        {/* area under the fee line */}
        {!reduce ? null : null}

        {/* the fee line: base -> max, brand blue */}
        <motion.path
          d={linePath}
          fill="none"
          stroke="var(--primary-ink)"
          strokeWidth={3}
          strokeLinecap="round"
          {...draw}
        />

        {/* endpoints */}
        <circle cx={lineStart.x} cy={lineStart.y} r={4.5} fill="var(--primary-ink)" />
        <circle cx={gatePt.x} cy={gatePt.y} r={4.5} fill="var(--risk-high)" />

        {/* x ticks (DRS) */}
        {ticks.map((t) => (
          <text
            key={t}
            x={x(t)}
            y={H - PB + 20}
            textAnchor="middle"
            className="fill-[var(--faint)] font-mono"
            fontSize="11"
          >
            {t.toFixed(2)}
          </text>
        ))}
        <text x={(PL + (W - PR)) / 2} y={H - 6} textAnchor="middle" className="fill-[var(--muted)]" fontSize="12">
          Dilution Risk Score
        </text>

        {/* y labels (fee) */}
        <text x={PL - 10} y={y(BASE) + 4} textAnchor="end" className="fill-[var(--faint)] font-mono" fontSize="11">
          0.30%
        </text>
        <text x={PL - 10} y={y(MAX) + 4} textAnchor="end" className="fill-[var(--faint)] font-mono" fontSize="11">
          1.00%
        </text>
      </svg>
    </figure>
  );
}
