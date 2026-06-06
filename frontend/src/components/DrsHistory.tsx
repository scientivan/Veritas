import {tierForDrs, TIER_META} from "@/lib/drs";
import type {Pool} from "@/lib/types";

/** Deterministic mock DRS series trending to the pool's current score (seeded by id). */
function series(pool: Pool, n = 28): number[] {
  let seed = [...pool.id].reduce((a, c) => a + c.charCodeAt(0), 7);
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const end = pool.drs;
  const start = Math.max(0.02, end * 0.35);
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const base = start + (end - start) * Math.pow(t, 1.4);
    pts.push(Math.min(0.98, Math.max(0.01, base + (rnd() - 0.5) * 0.06)));
  }
  pts[n - 1] = end;
  return pts;
}

const W = 600;
const H = 170;
const PAD = 10;

export function DrsHistory({pool}: {pool: Pool}) {
  const pts = series(pool);
  const tier = tierForDrs(pool.drs);
  const color = TIER_META[tier].cssVar;
  const gid = `drs-fill-${pool.id}`;

  const xy = pts.map((v, i) => {
    const x = PAD + (i / (pts.length - 1)) * (W - 2 * PAD);
    const y = H - PAD - v * (H - 2 * PAD);
    return [x, y] as const;
  });
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W - PAD} ${H - PAD} L${PAD} ${H - PAD} Z`;
  const [lastX, lastY] = xy[xy.length - 1];
  const guide = (v: number) => H - PAD - v * (H - 2 * PAD);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Dilution Risk Score history">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Tier threshold guides at 0.30 and 0.70. */}
      {[0.3, 0.7].map((v) => (
        <line
          key={v}
          x1={PAD}
          x2={W - PAD}
          y1={guide(v)}
          y2={guide(v)}
          stroke="var(--border)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="6" fill="var(--bg)" />
      <circle cx={lastX} cy={lastY} r="3.5" fill={color} />
    </svg>
  );
}
