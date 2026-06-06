"use client";

import {useMemo, useState} from "react";
import {useReadContracts} from "wagmi";
import {Lock, Loader2} from "lucide-react";
import {DRSGauge} from "./DRSGauge";
import {REGISTRY_ABI} from "@/lib/abis";
import {REGISTRY_ADDRESS} from "@/lib/contracts";
import {combineDrs, DRS_GATE, dynamicFeeBps, tierForDrs, TIER_META} from "@/lib/drs";
import {formatFeeBps, formatPct, cn} from "@/lib/utils";

/** Real attestation trio (low / medium / high) from the seeded dataset. */
const TRIO: {label: string; caption: string; id: `0x${string}`; hue: number}[] = [
  {
    label: "Unique",
    caption: "Original work, no duplicates",
    id: "0xf87daf94ea2f9f4f5ffaa5950abd1dd285b9ff75b1b4d72c42409cea7e40d109",
    hue: 32,
  },
  {
    label: "Common",
    caption: "Some duplication and AI likeness",
    id: "0xfe31192bd6a23aee0a3b90e4458e638d3e0a0d8bbf3bfd0afe559635a1f45ce6",
    hue: 70,
  },
  {
    label: "AI-replicated",
    caption: "Heavily AI-replicable",
    id: "0x627552c29a1413b8d10d928241b3514902f2abfe3d49c838c4093fc9b8c2832a",
    hue: 305,
  },
];

function saturateD(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 0.4;
  if (count === 2) return 0.6;
  if (count <= 3) return 0.75;
  if (count <= 5) return 0.85;
  if (count <= 10) return 0.9;
  if (count <= 20) return 0.95;
  return 0.98;
}

type OnChainRecord = {
  aiReplicabilityScore: number;
  offchainD: number;
  dilutionCount: number;
};

type GaugeData = {drs: number; d: number; a: number; gated: boolean};

function deriveGauge(rec: OnChainRecord): GaugeData {
  const a = rec.aiReplicabilityScore / 10000;
  const offchainD = rec.offchainD / 10000;
  const onchainD = saturateD(rec.dilutionCount);
  const d = Math.max(offchainD, onchainD);
  const drs = combineDrs(d, a);
  return {drs, d, a, gated: drs > DRS_GATE};
}

export function HeroGauge() {
  const [i, setI] = useState(0);

  const contracts = useMemo(
    () =>
      TRIO.map((t) => ({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "getRecord" as const,
        args: [t.id] as [`0x${string}`],
      })),
    []
  );

  const {data: records, isLoading} = useReadContracts({contracts});

  const gauges = useMemo<(GaugeData | null)[]>(
    () =>
      TRIO.map((_, idx) => {
        const res = records?.[idx];
        if (!res || res.status !== "success" || !res.result) return null;
        return deriveGauge(res.result as unknown as OnChainRecord);
      }),
    [records]
  );

  const {label, caption, hue} = TRIO[i];
  const gauge = gauges[i];

  // Concise spoken summary so screen-reader users hear the score change on switch.
  const liveSummary = gauge
    ? gauge.gated
      ? `${label}: Dilution Risk Score ${formatPct(gauge.drs)}, ${TIER_META[tierForDrs(gauge.drs)].label}. Pool gated.`
      : `${label}: Dilution Risk Score ${formatPct(gauge.drs)}, ${TIER_META[tierForDrs(gauge.drs)].label}. LP fee ${formatFeeBps(dynamicFeeBps(gauge.drs))}.`
    : `${label}: loading on-chain score.`;

  return (
    <div className="w-full max-w-md rounded-[20px] border border-border bg-surface p-6 sm:p-8">
      {/* Three contrasting demo assets as independent toggles, not a tab pattern. */}
      <div
        role="group"
        aria-label="Demo content tiers"
        className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-bg p-1"
      >
        {TRIO.map((d, idx) => {
          const active = idx === i;
          return (
            <button
              key={d.label}
              type="button"
              aria-pressed={active}
              onClick={() => setI(idx)}
              className={cn(
                "flex min-h-10 items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors",
                active
                  ? "bg-surface-2 text-ink"
                  : "text-muted hover:bg-surface-2/60 hover:text-ink"
              )}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      <div className="mt-7">
        {gauge ? (
          <DRSGauge key={i} drs={gauge.drs} d={gauge.d} a={gauge.a} gated={gauge.gated} />
        ) : (
          <div className="flex h-[220px] items-center justify-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {isLoading ? "Reading live score…" : "Score unavailable"}
          </div>
        )}
      </div>

      <Outcome gauge={gauge} caption={caption} label={label} hue={hue} />

      <p className="sr-only" aria-live="polite">
        {liveSummary}
      </p>
    </div>
  );
}

function Outcome({
  gauge,
  caption,
  label,
  hue,
}: {
  gauge: GaugeData | null;
  caption: string;
  label: string;
  hue: number;
}) {
  return (
    <div className="mt-6 rounded-xl border border-border bg-bg/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="size-9 shrink-0 rounded-lg"
            style={{background: `oklch(0.62 0.14 ${hue})`}}
            aria-hidden
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">{label}</div>
            <div className="truncate text-xs text-muted">{caption}</div>
          </div>
        </div>
        {gauge?.gated ? (
          <div className="flex items-center gap-1.5 font-mono text-sm text-risk-high">
            <Lock className="size-4" strokeWidth={2.25} aria-hidden />
            Gated
          </div>
        ) : gauge ? (
          <div className="text-right">
            <div className="font-mono text-sm font-semibold tnum text-ink">
              {formatFeeBps(dynamicFeeBps(gauge.drs))}
            </div>
            <div className="text-[11px] text-muted">LP fee</div>
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        {!gauge
          ? "Reading the live Dilution Risk Score from the Unichain Sepolia registry."
          : gauge.gated
            ? `DRS ${formatPct(gauge.drs)} is above the ${formatPct(DRS_GATE)} gate, so the pool can't be created. That protects LPs from a near-certain dilution loss.`
            : `DRS ${formatPct(gauge.drs)} sets the fee, compensating LPs for the dilution risk they underwrite.`}
      </p>
    </div>
  );
}
