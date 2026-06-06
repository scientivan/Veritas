"use client";

import {useMemo, useState} from "react";
import Link from "next/link";
import {useAccount} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {ArrowUpRight, Wallet} from "lucide-react";
import {formatEther} from "viem";
import {useAttestations} from "@/hooks/useAttestations";
import {useLivePoolTvl} from "@/hooks/useLivePoolTvl";
import {useLpPositions} from "@/hooks/useLpPositions";
import {getLivePoolList, hasLivePool} from "@/lib/livePools";
import {dynamicFeeBps, DRS_GATE} from "@/lib/drs";
import {ASSUMED_ANNUAL_TURNOVER} from "@/lib/poolMeta";
import {RiskPill} from "./RiskPill";
import {ILSimulator} from "./ILSimulator";
import {formatFeeBps, formatPct, formatUsd, cn} from "@/lib/utils";
import type {Pool} from "@/lib/types";

function poolApy(pool: Pool): number | null {
  if (pool.gated) return null;
  return (dynamicFeeBps(pool.drs, pool.baseFeeBps, pool.maxFeeBps) / 10000) * ASSUMED_ANNUAL_TURNOVER;
}

export function PortfolioDashboard() {
  const {address, isConnected} = useAccount();
  const {pools} = useAttestations();
  const {positions} = useLpPositions(address);
  const tvlMap = useLivePoolTvl(getLivePoolList());

  // Join locally-tracked positions with live on-chain pool data.
  const myPositions = useMemo(() => {
    return positions
      .map((pos) => {
        const pool = pools.find((p) => p.id.toLowerCase() === pos.attestationId.toLowerCase());
        if (!pool) return null;
        return {pool, netToken0: Number(formatEther(BigInt(pos.netToken0)))};
      })
      .filter((x): x is {pool: Pool; netToken0: number} => x !== null);
  }, [positions, pools]);

  const livePools = useMemo(
    () => pools.filter((p) => hasLivePool(p.id) && !p.gated),
    [pools]
  );

  // IL simulator targets your positions if you have any, else all providable pools.
  const simChoices = myPositions.length > 0 ? myPositions.map((m) => m.pool) : livePools;
  const [simPool, setSimPool] = useState<string | null>(null);
  const activeDrs = useMemo(() => {
    const id = simPool ?? simChoices[0]?.id;
    return pools.find((p) => p.id === id)?.drs ?? 0;
  }, [simPool, simChoices, pools]);

  return (
    <div className="flex flex-col gap-12">
      {/* Section 1 — My positions */}
      <section>
        <div className="mb-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            My positions
          </h2>
          <p className="mt-1 text-sm text-muted">
            Pools you&apos;ve provided liquidity to, with each one&apos;s live Dilution Risk Score and
            DRS-calibrated fee. The fee rises automatically as dilution risk climbs — that&apos;s your
            built-in IL compensation.
          </p>
        </div>

        {!isConnected ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-10 text-center">
            <p className="text-muted">Connect your wallet to see your liquidity positions.</p>
            <ConnectButton />
          </div>
        ) : myPositions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
            <Wallet className="size-8 text-muted" strokeWidth={1.5} />
            <p className="font-display text-lg font-semibold text-ink">No positions yet</p>
            <p className="max-w-sm text-sm text-muted">
              Provide liquidity to a pool in{" "}
              <Link href="/pools" className="text-primary-ink hover:underline">
                Available Pools
              </Link>{" "}
              and it will show up here with its live value and fee.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_0.6fr] gap-3 border-b border-border bg-surface/40 px-4 py-2.5 text-[11px] uppercase tracking-wider text-faint md:grid">
              <span>Pool</span>
              <span>Dilution risk</span>
              <span className="text-right">Your liquidity</span>
              <span className="text-right">Dynamic fee</span>
              <span />
            </div>
            <div className="divide-y divide-border">
              {myPositions.map(({pool, netToken0}) => {
                const tvl = tvlMap.get(pool.id.toLowerCase());
                const apy = poolApy(pool);
                return (
                  <div
                    key={pool.id}
                    className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3.5 md:grid-cols-[2fr_1fr_1fr_1fr_0.6fr] md:items-center"
                  >
                    <div className="col-span-2 md:col-span-1">
                      <p className="truncate text-sm font-medium text-ink">{pool.title}</p>
                      {tvl != null && (
                        <p className="font-mono text-xs text-faint">Pool TVL {formatUsd(tvl)} (sim.)</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <RiskPill drs={pool.drs} gated={pool.gated} size="sm" />
                      <span className="font-mono text-xs tnum text-muted">{formatPct(pool.drs)}</span>
                    </div>
                    <div className="flex flex-col md:items-end">
                      <span className="font-mono text-sm tnum text-ink">{netToken0.toFixed(2)}</span>
                      <span className="text-[10px] text-faint">token0 units</span>
                    </div>
                    <div className="flex flex-col md:items-end">
                      <span className="font-mono text-sm tnum text-ink">
                        {formatFeeBps(dynamicFeeBps(pool.drs, pool.baseFeeBps, pool.maxFeeBps))}
                      </span>
                      {apy !== null && <span className="text-[10px] text-faint">~{apy.toFixed(1)}% APY est.</span>}
                    </div>
                    <Link
                      href={`/pool/${pool.id}`}
                      className="flex items-center justify-end gap-1 text-xs text-primary-ink hover:underline"
                    >
                      Manage
                      <ArrowUpRight className="size-3" strokeWidth={2.25} aria-hidden />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Section 2 — IL protection simulator */}
      <section>
        <div className="mb-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            IL protection simulator
          </h2>
          <p className="mt-1 text-sm text-muted">
            Estimate whether the dynamic fee compensates for impermanent loss as DRS rises — the
            protocol&apos;s core thesis: higher dilution risk ⇒ higher fee that protects LP returns.
          </p>
        </div>

        {simChoices.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="self-center text-xs text-faint">
              {myPositions.length > 0 ? "Your pools:" : "Simulating:"}
            </span>
            {simChoices.map((p) => (
              <button
                key={p.id}
                onClick={() => setSimPool(p.id)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  simPool === p.id || (!simPool && p.id === simChoices[0]?.id)
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
          Model: fee APY = dynamic fee × {ASSUMED_ANNUAL_TURNOVER}× annual turnover (testnet, no real
          volume); IL uses the x·y=k constant-product formula; price drop assumed linear with DRS. The
          gate sits at {formatPct(DRS_GATE)}.
        </p>
      </section>
    </div>
  );
}
