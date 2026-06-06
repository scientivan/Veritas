"use client";

import {useState, useMemo} from "react";
import {dynamicFeeBps, DRS_GATE, BASE_FEE_BPS, MAX_FEE_BPS} from "@/lib/drs";
import {ASSUMED_ANNUAL_TURNOVER} from "@/lib/poolMeta";
import {formatPct} from "@/lib/utils";

const W = 560;
const H = 220;
const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 36;
const CHART_W = W - PAD_L - PAD_R;
const CHART_H = H - PAD_T - PAD_B;
const TURNOVER = ASSUMED_ANNUAL_TURNOVER;

/**
 * Impermanent loss from the constant-product formula.
 * priceRatio = P_end / P_start (< 1 for a price drop).
 * Returns the loss as a fraction (e.g. 0.06 = 6% IL).
 */
function calcIL(priceRatio: number): number {
  if (priceRatio <= 0) return 1;
  return Math.abs(2 * Math.sqrt(priceRatio) / (1 + priceRatio) - 1);
}

const N = 85; // sample points from DRS 0% to 85%

interface ILSimulatorProps {
  /** Current DRS for the pool being viewed (0..1). Optional for standalone use. */
  currentDrs?: number;
}

export function ILSimulator({currentDrs}: ILSimulatorProps) {
  const [maxPriceDrop, setMaxPriceDrop] = useState(0.5); // 50% price drop at gate

  // Build series: 0 to DRS_GATE (85%), step 1%.
  const series = useMemo(() => {
    return Array.from({length: N + 1}, (_, i) => {
      const drs = i / 100; // 0.00 to 0.85
      const feeFraction = dynamicFeeBps(drs, BASE_FEE_BPS, MAX_FEE_BPS) / 10000;
      const feeApy = feeFraction * TURNOVER * 100; // percent

      // Linear model: as DRS rises from 0 to 85%, image token price falls proportionally.
      const priceRatio = 1 - maxPriceDrop * (drs / DRS_GATE);
      const ilPct = calcIL(priceRatio) * 100; // percent

      const netApy = feeApy - ilPct;
      return {drs, feeApy, ilPct, netApy};
    });
  }, [maxPriceDrop]);

  // Find breakeven DRS (where net APY crosses 0 from above).
  const breakeven = useMemo(() => {
    for (let i = 1; i < series.length; i++) {
      if (series[i - 1].netApy >= 0 && series[i].netApy < 0) {
        return series[i - 1].drs + (series[i].drs - series[i - 1].drs) * (series[i - 1].netApy / (series[i - 1].netApy - series[i].netApy));
      }
    }
    return null;
  }, [series]);

  const maxY = Math.max(60, ...series.map((p) => p.feeApy));
  const minY = Math.min(-20, ...series.map((p) => p.netApy));
  const yRange = maxY - minY;

  const toX = (drs: number) => PAD_L + (drs / DRS_GATE) * CHART_W;
  const toY = (pct: number) => PAD_T + (1 - (pct - minY) / yRange) * CHART_H;
  const zeroY = toY(0);

  const feePoints = series.map((p) => `${toX(p.drs).toFixed(1)},${toY(p.feeApy).toFixed(1)}`).join(" ");
  const ilPoints = series.map((p) => `${toX(p.drs).toFixed(1)},${toY(p.ilPct).toFixed(1)}`).join(" ");
  const netPoints = series.map((p) => `${toX(p.drs).toFixed(1)},${toY(p.netApy).toFixed(1)}`).join(" ");

  // Green fill: fee > IL (net > 0)
  const protectedFill = series
    .map((p, i) => {
      const x = toX(p.drs);
      const y = p.netApy >= 0 ? toY(p.feeApy) : zeroY;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .concat(
      series
        .slice()
        .reverse()
        .map((p, i) => {
          const x = toX(p.drs);
          const y = p.netApy >= 0 ? toY(p.ilPct) : zeroY;
          return `L${x.toFixed(1)} ${y.toFixed(1)}`;
        })
    )
    .join(" ") + " Z";

  const yLabels = [0, 20, 40];
  const drsMarker = currentDrs !== undefined ? currentDrs : null;

  const currentPt = drsMarker !== null ? series[Math.round(drsMarker * 100)] : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Control */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">
            Assumed price drop at DRS gate (85%):
            <span className="ml-2 font-mono font-semibold text-ink">{Math.round(maxPriceDrop * 100)}%</span>
          </label>
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={maxPriceDrop}
            onChange={(e) => setMaxPriceDrop(parseFloat(e.target.value))}
            className="w-48 accent-[var(--color-primary-ink)]"
          />
        </div>
        {breakeven !== null && (
          <div className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs">
            <span className="text-muted">Breakeven DRS: </span>
            <span className="font-mono font-semibold text-ink">{formatPct(breakeven)}</span>
            <span className="ml-2 text-faint">fee income = IL loss above this level</span>
          </div>
        )}
      </div>

      {/* Chart */}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-label="IL vs fee APY simulation">
        <defs>
          <linearGradient id="il-protect-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--risk-low)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--risk-low)" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Zero line */}
        <line
          x1={PAD_L}
          x2={PAD_L + CHART_W}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--border)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* Gate line */}
        <line
          x1={PAD_L + CHART_W}
          x2={PAD_L + CHART_W}
          y1={PAD_T}
          y2={PAD_T + CHART_H}
          stroke="var(--risk-high)"
          strokeWidth="1"
          strokeOpacity="0.5"
          strokeDasharray="3 3"
        />
        <text
          x={PAD_L + CHART_W - 4}
          y={PAD_T + 10}
          fill="var(--risk-high)"
          fontSize="9"
          textAnchor="end"
          opacity="0.7"
        >
          Gate 85%
        </text>

        {/* Y-axis labels */}
        {yLabels.map((v) => (
          <g key={v}>
            <line
              x1={PAD_L - 4}
              x2={PAD_L + CHART_W}
              y1={toY(v)}
              y2={toY(v)}
              stroke="var(--border)"
              strokeWidth="0.5"
            />
            <text x={PAD_L - 6} y={toY(v) + 3} fontSize="9" fill="var(--color-faint)" textAnchor="end">
              {v}%
            </text>
          </g>
        ))}

        {/* Protected fill */}
        <path d={protectedFill} fill="url(#il-protect-fill)" />

        {/* Fee APY line */}
        <polyline
          points={feePoints}
          fill="none"
          stroke="var(--risk-low)"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* IL line */}
        <polyline
          points={ilPoints}
          fill="none"
          stroke="var(--risk-high)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeDasharray="5 3"
        />

        {/* Net APY line */}
        <polyline
          points={netPoints}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeOpacity="0.4"
        />

        {/* Breakeven dot */}
        {breakeven !== null && (
          <circle cx={toX(breakeven)} cy={zeroY} r="4" fill="var(--color-ink)" opacity="0.5" />
        )}

        {/* Current DRS marker */}
        {drsMarker !== null && drsMarker <= DRS_GATE && (
          <>
            <line
              x1={toX(drsMarker)}
              x2={toX(drsMarker)}
              y1={PAD_T}
              y2={PAD_T + CHART_H}
              stroke="var(--color-primary-ink)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.7"
            />
            <text
              x={toX(drsMarker) + 4}
              y={PAD_T + 10}
              fontSize="9"
              fill="var(--color-primary-ink)"
              opacity="0.7"
            >
              Now {formatPct(drsMarker)}
            </text>
          </>
        )}

        {/* X-axis labels */}
        {[0, 0.25, 0.5, 0.75, 0.85].map((v) => (
          <text key={v} x={toX(v)} y={H - 6} fontSize="9" fill="var(--color-faint)" textAnchor="middle">
            {Math.round(v * 100)}%
          </text>
        ))}
        <text x={PAD_L + CHART_W / 2} y={H} fontSize="9" fill="var(--color-faint)" textAnchor="middle">
          DRS
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-faint">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-6 bg-[var(--risk-low)]" />
          Fee APY
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-6 border-t-2 border-dashed border-[var(--risk-high)]" />
          IL loss
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-[var(--color-ink)] opacity-40" />
          Net (fee minus IL)
        </span>
      </div>

      {currentPt && (
        <div className="rounded-lg border border-border bg-surface/60 px-4 py-3 text-sm">
          <p className="font-medium text-ink">
            At current DRS ({formatPct(currentDrs!)}):
          </p>
          <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-faint">Fee APY</p>
              <p className="font-mono font-semibold text-risk-low">{currentPt.feeApy.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-faint">Est. IL loss</p>
              <p className="font-mono font-semibold text-risk-high">{currentPt.ilPct.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-faint">Net est.</p>
              <p className={`font-mono font-semibold ${currentPt.netApy >= 0 ? "text-risk-low" : "text-risk-high"}`}>
                {currentPt.netApy >= 0 ? "+" : ""}{currentPt.netApy.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
