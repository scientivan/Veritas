"use client";

import {useMemo, useState} from "react";
import Link from "next/link";
import {useAccount} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {ArrowUpRight, AlertTriangle, ShieldCheck} from "lucide-react";
import {useAttestations} from "@/hooks/useAttestations";
import {useLivePoolTvl} from "@/hooks/useLivePoolTvl";
import {getLivePoolList, hasLivePool} from "@/lib/livePools";
import {dynamicFeeBps, DRS_GATE, BASE_FEE_BPS, MAX_FEE_BPS} from "@/lib/drs";
import {ASSUMED_ANNUAL_TURNOVER} from "@/lib/poolMeta";
import {RiskPill} from "./RiskPill";
import {ILSimulator} from "./ILSimulator";
import {formatFeeBps, formatPct, formatUsd, cn} from "@/lib/utils";
import type {Pool} from "@/lib/types";

function poolApy(pool: Pool): number | null {
  if (pool.gated) return null;
  return (dynamicFeeBps(pool.drs, pool.baseFeeBps, pool.maxFeeBps) / 10000) * ASSUMED_ANNUAL_TURNOVER;
}

function gateDistance(pool: Pool): number {
  return Math.max(0, DRS_GATE - pool.drs);
}

/* ── Gate Proximity Card ──────────────────────────────────────────────── */
function GateProximityCard({pool}: {pool: Pool}) {
  const dist = gateDistance(pool);
  const pct = Math.min(1, pool.drs / DRS_GATE);
  const isClose = pool.drs >= DRS_GATE * 0.7;
  const isGated = pool.gated;

  return (
    <Link
      href={`/pool/${pool.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-surface/40 p-4 transition-colors hover:bg-surface/80"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{pool.title}</p>
          <p className="mt-0.5 text-xs text-muted">DRS: {formatPct(pool.drs)}</p>
        </div>
        {isGated ? (
          <span className="shrink-0 rounded-full bg-risk-high/15 px-2 py-0.5 text-xs font-medium text-risk-high">
            Gated
          </span>
        ) : isClose ? (
          <AlertTriangle className="size-4 shrink-0 text-risk-mid" strokeWidth={2.25} aria-hidden />
        ) : (
          <ShieldCheck className="size-4 shrink-0 text-risk-low" strokeWidth={2.25} aria-hidden />
        )}
      </div>

      {/* Progress bar */}
      <div>
        <div className="mb-1 flex justify-between text-[10px] text-faint">
          <span>0%</span>
          <span>Gate 85%</span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${(pool.drs / DRS_GATE) * 100}%`,
              background: isGated
                ? "var(--risk-high)"
                : isClose
                ? "var(--risk-mid)"
                : "var(--risk-low)",
            }}
          />
          {/* Gate marker */}
          <div
            className="absolute top-0 h-full w-px bg-risk-high/60"
            style={{left: "100%"}}
          />
        </div>
      </div>

      {!isGated && (
        <p className="text-xs text-faint">
          {(dist * 100).toFixed(0)} ppts from gate
          {isClose && " — consider reducing exposure"}
        </p>
      )}
    </Link>
  );
}

/* ── Comparison Table ─────────────────────────────────────────────────── */
function PoolCompareTable({pools, tvlMap}: {pools: Pool[]; tvlMap: Map<string, number | null>}) {
  const [sortKey, setSortKey] = useState<"drs" | "apy" | "gate">("gate");

  const sorted = useMemo(() => {
    return [...pools]
      .filter((p) => hasLivePool(p.id))
      .sort((a, b) => {
        if (sortKey === "drs") return a.drs - b.drs;
        if (sortKey === "apy") return (poolApy(b) ?? -1) - (poolApy(a) ?? -1);
        return gateDistance(b) - gateDistance(a); // "safest" first
      });
  }, [pools, sortKey]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-faint">Sort:</span>
        {(["gate", "drs", "apy"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              sortKey === k
                ? "bg-primary/15 text-primary-ink"
                : "text-muted hover:bg-surface hover:text-ink"
            )}
          >
            {k === "gate" ? "Safest first" : k === "drs" ? "DRS" : "APY est."}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_0.5fr] gap-3 border-b border-border bg-surface/40 px-4 py-2 text-[11px] uppercase tracking-wider text-faint md:grid">
          <span>Pool</span>
          <span>DRS</span>
          <span className="text-right">Dynamic fee</span>
          <span className="text-right">APY (est.)</span>
          <span className="text-right">Gate distance</span>
          <span />
        </div>
        <div className="divide-y divide-border">
          {sorted.map((p) => {
            const apy = poolApy(p);
            const dist = gateDistance(p);
            const tvl = tvlMap.get(p.id.toLowerCase());
            return (
              <div
                key={p.id}
                className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_0.5fr] md:items-center"
              >
                <div className="col-span-2 md:col-span-1">
                  <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                  {tvl !== undefined && tvl !== null && (
                    <p className="font-mono text-xs text-faint">TVL {formatUsd(tvl)} (sim.)</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <RiskPill drs={p.drs} gated={p.gated} size="sm" />
                  <span className="font-mono text-xs tnum text-muted">{formatPct(p.drs)}</span>
                </div>
                <p className="text-right font-mono text-sm tnum text-ink md:block">
                  {p.gated ? (
                    <span className="text-risk-high">Gated</span>
                  ) : (
                    formatFeeBps(dynamicFeeBps(p.drs, p.baseFeeBps, p.maxFeeBps))
                  )}
                </p>
                <p className="text-right font-mono text-sm tnum text-ink">
                  {apy !== null ? `${apy.toFixed(1)}%` : "-"}
                </p>
                <div className="flex flex-col items-end gap-0.5">
                  <span
                    className={cn(
                      "font-mono text-sm tnum",
                      p.gated ? "text-risk-high" : dist < 0.1 ? "text-risk-mid" : "text-risk-low"
                    )}
                  >
                    {p.gated ? "0%" : `${(dist * 100).toFixed(0)}%`}
                  </span>
                  <span className="text-[10px] text-faint">from gate</span>
                </div>
                <Link
                  href={`/pool/${p.id}`}
                  className="flex items-center justify-end gap-1 text-xs text-primary-ink hover:underline"
                >
                  View
                  <ArrowUpRight className="size-3" strokeWidth={2.25} aria-hidden />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Main dashboard ───────────────────────────────────────────────────── */
export function PortfolioDashboard() {
  const {isConnected} = useAccount();
  const {pools} = useAttestations();
  const tvlMap = useLivePoolTvl(getLivePoolList());

  // Pick the pool with the lowest DRS (safest) for the IL simulator default.
  const safestPool = useMemo(
    () => pools.filter((p) => !p.gated && hasLivePool(p.id)).sort((a, b) => a.drs - b.drs)[0],
    [pools]
  );

  const [simPool, setSimPool] = useState<string | null>(null);
  const activeDrs = useMemo(() => {
    const id = simPool ?? safestPool?.id;
    return pools.find((p) => p.id === id)?.drs ?? 0;
  }, [simPool, safestPool, pools]);

  const livePools = pools.filter((p) => hasLivePool(p.id));

  return (
    <div className="flex flex-col gap-12">
      {/* Section 1: Pool comparison */}
      <section>
        <div className="mb-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Pool comparison
          </h2>
          <p className="mt-1 text-sm text-muted">
            All live Veritas v4 pools, sorted by safety margin. Higher gate distance = more runway
            before the hook blocks new swaps.
          </p>
        </div>
        <PoolCompareTable pools={pools} tvlMap={tvlMap} />
      </section>

      {/* Section 2: Gate proximity alerts */}
      <section>
        <div className="mb-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Gate proximity
          </h2>
          <p className="mt-1 text-sm text-muted">
            How close each pool&apos;s DRS is to the protocol gate threshold (85%). When gated, no
            new swaps are accepted.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {livePools.map((p) => (
            <GateProximityCard key={p.id} pool={p} />
          ))}
        </div>
      </section>

      {/* Section 3: IL Protection Simulator */}
      <section>
        <div className="mb-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            IL protection simulator
          </h2>
          <p className="mt-1 text-sm text-muted">
            Estimate whether the dynamic fee compensates for impermanent loss as DRS rises. The
            protocol&apos;s key thesis: higher dilution risk = higher fee that protects LP returns.
          </p>
        </div>

        {/* Pool selector */}
        {livePools.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="self-center text-xs text-faint">Simulating:</span>
            {livePools.map((p) => (
              <button
                key={p.id}
                onClick={() => setSimPool(p.id)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  (simPool === p.id || (!simPool && p.id === safestPool?.id))
                    ? "border-primary-ink/30 bg-primary/10 text-primary-ink"
                    : "border-border text-muted hover:border-border-strong hover:text-ink"
                )}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface/40 p-5">
          <ILSimulator currentDrs={activeDrs} />
        </div>

        <p className="mt-3 text-xs text-faint">
          Model assumptions: fee APY = dynamic fee rate × {ASSUMED_ANNUAL_TURNOVER}× annual
          turnover (testnet, no real volume). IL uses the x*y=k constant-product formula.
          Price drop is assumed linear with DRS. Adjust the slider to explore different scenarios.
        </p>
      </section>

      {/* Wallet prompt */}
      {!isConnected && (
        <div className="rounded-xl border border-border bg-surface/40 p-6 text-center">
          <p className="text-sm text-muted">
            Connect your wallet to see which pools you&apos;ve interacted with and track your
            positions.
          </p>
          <div className="mt-4 inline-flex [&_button]:text-sm">
            <ConnectButton />
          </div>
        </div>
      )}
    </div>
  );
}
