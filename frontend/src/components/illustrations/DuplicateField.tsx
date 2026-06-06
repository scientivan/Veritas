"use client";

import {motion, useReducedMotion} from "motion/react";

/**
 * The dilution thesis, abstract: one unique work (solid ink) surrounded by copies
 * that keep appearing across the content space (faint, looping in). To an AMM every
 * cell looks identical; only one is original. Neutral by construction, a single blue
 * outline marks the "detected" near-duplicate. Static composed frame under reduced motion.
 */
const COLS = 14;
const ROWS = 8;
const GAP = 30;
const S = 12; // cell size
const OX = 18;
const OY = 18;

// Deterministic pseudo-scatter so SSR and client match (no Math.random).
function rng(i: number) {
  const v = Math.sin(i * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

// The unique original sits a third in; copies are every other lit cell.
const ORIGIN = {c: 4, r: 4};

type Cell = {i: number; c: number; r: number; x: number; y: number; on: boolean; delay: number};

const CELLS: Cell[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c;
    const on = rng(i) > 0.52;
    CELLS.push({
      i,
      c,
      r,
      x: OX + c * GAP,
      y: OY + r * GAP,
      on,
      delay: (rng(i + 99) * 2.6) % 2.6,
    });
  }
}

const W = OX * 2 + (COLS - 1) * GAP + S;
const H = OY * 2 + (ROWS - 1) * GAP + S;

// One near-duplicate the "detector" picks out: nearest lit cell to the origin.
const DETECTED = CELLS.filter((c) => c.on && !(c.c === ORIGIN.c && c.r === ORIGIN.r)).sort(
  (a, b) =>
    Math.hypot(a.c - ORIGIN.c, a.r - ORIGIN.r) - Math.hypot(b.c - ORIGIN.c, b.r - ORIGIN.r)
)[0];

export function DuplicateField({className}: {className?: string}) {
  const reduce = useReducedMotion();
  const originX = OX + ORIGIN.c * GAP;
  const originY = OY + ORIGIN.r * GAP;

  return (
    <figure className={className} aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* copies: faint neutral squares that breathe in and out, suggesting proliferation */}
        {CELLS.map((cell) => {
          if (cell.c === ORIGIN.c && cell.r === ORIGIN.r) return null;
          const base = cell.on ? 0.16 : 0.05;
          return (
            <motion.rect
              key={cell.i}
              x={cell.x}
              y={cell.y}
              width={S}
              height={S}
              rx={2}
              fill="var(--ink)"
              initial={{opacity: base}}
              animate={
                reduce
                  ? {opacity: base}
                  : {opacity: cell.on ? [0.06, 0.22, 0.06] : [0.03, 0.08, 0.03]}
              }
              transition={
                reduce
                  ? undefined
                  : {duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: cell.delay}
              }
            />
          );
        })}

        {/* the detector's pick: a near-duplicate, outlined in brand blue */}
        {DETECTED && (
          <motion.rect
            x={DETECTED.x - 3}
            y={DETECTED.y - 3}
            width={S + 6}
            height={S + 6}
            rx={3}
            fill="none"
            stroke="var(--primary-ink)"
            strokeWidth={1.5}
            initial={{opacity: 0.25}}
            animate={reduce ? {opacity: 0.6} : {opacity: [0.2, 0.85, 0.2]}}
            transition={reduce ? undefined : {duration: 3.2, repeat: Infinity, ease: "easeInOut"}}
          />
        )}

        {/* the one original: solid, unmistakable */}
        <rect x={originX} y={originY} width={S} height={S} rx={2} fill="var(--ink)" />
        <rect
          x={originX - 4}
          y={originY - 4}
          width={S + 8}
          height={S + 8}
          rx={3}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1}
          opacity={0.45}
        />
      </svg>
    </figure>
  );
}
