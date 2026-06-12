"use client";

import {useMemo, useState} from "react";
import Link from "next/link";
import {useAccount, useReadContracts} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {ArrowUpRight, ArrowDownLeft, Wallet, Layers, History} from "lucide-react";
import {formatEther} from "viem";
import type {Address, Hex} from "viem";
import {useAttestations} from "@/hooks/useAttestations";
import {useLivePoolTvl} from "@/hooks/useLivePoolTvl";
import {useLpPositions} from "@/hooks/useLpPositions";
import {useOnChainLaunchpads} from "@/hooks/useOnChainLaunchpads";
import {useTradeHistory} from "@/hooks/useTradeHistory";
import {getLivePool, getLivePoolList, hasLivePool} from "@/lib/livePools";
import {LaunchpadPhase} from "@/lib/launchpad";
import {curvePrice} from "@/lib/curve";
import {dynamicFeeBps, DRS_GATE} from "@/lib/drs";
import {ASSUMED_ANNUAL_TURNOVER} from "@/lib/poolMeta";
import {RiskPill} from "./RiskPill";
import {ILSimulator} from "./ILSimulator";
import {ExplorerLink} from "./ExplorerLink";
import {formatFeeBps, formatPct, formatUsd, cn} from "@/lib/utils";
import type {Pool} from "@/lib/types";

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{name: "account", type: "address"}],
    outputs: [{name: "", type: "uint256"}],
  },
] as const;

interface HoldingCandidate {
  token: Address;
  attestationId: Hex;
  title: string;
  drs: number;
  /** USDC-denominated unit price, or null when no price is known. */
  priceUsd: number | null;
  href: string;
}

function poolApy(pool: Pool): number | null {
  if (pool.gated) return null;
  return (dynamicFeeBps(pool.drs, pool.baseFeeBps, pool.maxFeeBps) / 10000) * ASSUMED_ANNUAL_TURNOVER;
}

export function PortfolioDashboard() {
  const {address, isConnected} = useAccount();
  const {pools} = useAttestations();
  const {entries: launchpadEntries} = useOnChainLaunchpads();
  const {positions} = useLpPositions(address);
  const {trades} = useTradeHistory(address);
  const tvlMap = useLivePoolTvl(getLivePoolList());

  /* ── LP positions ──────────────────────────────────────────────── */
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

  /* ── Collection (IP-token holdings) ────────────────────────────── */
  const candidates = useMemo<HoldingCandidate[]>(() => {
    const map = new Map<string, HoldingCandidate>();
    // Launchpad tokens (active curve or graduated), the collector buys these.
    for (const e of launchpadEntries) {
      if (e.phase === LaunchpadPhase.INACTIVE) continue;
      const key = e.tokenAddress.toLowerCase();
      if (map.has(key)) continue;
      map.set(key, {
        token: e.tokenAddress,
        attestationId: e.attestationId,
        title: e.tokenName || e.attestationId.slice(0, 8) + "…",
        drs: e.drs,
        priceUsd: e.curveA > 0n ? curvePrice(e.curveA, e.curveB, e.tokensSold) : null,
        href:
          (e.phase === LaunchpadPhase.GRADUATED
            ? `/pool/${e.attestationId}`
            : `/trade/${e.attestationId}`) + `?token=${e.tokenAddress}`,
      });
    }
    // Seeded live v4 pools (the demo content pools).
    for (const p of pools) {
      if (p.gated || !hasLivePool(p.id)) continue;
      const lp = getLivePool(p.id)!;
      const key = lp.token0.toLowerCase();
      if (map.has(key)) continue;
      map.set(key, {
        token: lp.token0,
        attestationId: p.id as Hex,
        title: p.title,
        drs: p.drs,
        priceUsd: lp.token0PriceUsd ?? 1,
        href: `/trade/${p.id}?token=${lp.token0}`,
      });
    }
    return [...map.values()];
  }, [launchpadEntries, pools]);

  const {data: balData} = useReadContracts({
    contracts:
      address && candidates.length > 0
        ? candidates.map((c) => ({
            address: c.token,
            abi: ERC20_BALANCE_ABI,
            functionName: "balanceOf" as const,
            args: [address] as const,
          }))
        : [],
    query: {enabled: !!address && candidates.length > 0},
  });

  const holdings = useMemo(() => {
    if (!balData) return [];
    return candidates
      .map((c, i) => {
        const bal = (balData[i]?.result as bigint | undefined) ?? 0n;
        const tokens = Number(formatEther(bal));
        return {...c, tokens, valueUsd: c.priceUsd != null ? tokens * c.priceUsd : null};
      })
      .filter((h) => h.tokens > 1e-9);
  }, [balData, candidates]);

  const collectionValue = holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0);

  /* ── IL simulator ──────────────────────────────────────────────── */
  const simChoices = myPositions.length > 0 ? myPositions.map((m) => m.pool) : livePools;
  const [simPool, setSimPool] = useState<string | null>(null);
  const activeDrs = useMemo(() => {
    const id = simPool ?? simChoices[0]?.id;
    return pools.find((p) => p.id === id)?.drs ?? 0;
  }, [simPool, simChoices, pools]);

  if (!isConnected) {
    return (
      <div className="flex flex-col gap-12">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-10 text-center">
          <Wallet className="size-8 text-muted" strokeWidth={1.5} />
          <p className="text-muted">
            Connect your wallet to see your liquidity positions, collection, and trade history.
          </p>
          <ConnectButton />
        </div>
        <SimulatorSection
          simChoices={simChoices}
          simPool={simPool}
          setSimPool={setSimPool}
          activeDrs={activeDrs}
          hasPositions={false}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-12">
      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Liquidity positions" value={String(myPositions.length)} icon={<Layers className="size-4" />} />
        <SummaryCard label="IP tokens held" value={String(holdings.length)} icon={<Wallet className="size-4" />} />
        <SummaryCard label="Collection value (sim.)" value={formatUsd(collectionValue)} icon={<ArrowUpRight className="size-4" />} />
      </div>

      {/* Section 1: Liquidity positions */}
      <section>
        <SectionTitle
          title="My liquidity"
          subtitle="Pools you've provided liquidity to, with each one's live Dilution Risk Score and DRS-calibrated fee. The fee rises automatically as dilution risk climbs, your built-in IL compensation."
        />
        {myPositions.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-8 text-muted" strokeWidth={1.5} />}
            title="No positions yet"
            body={
              <>
                Provide liquidity to a pool in{" "}
                <Link href="/pools" className="text-primary-ink hover:underline">
                  Available Pools
                </Link>{" "}
                and it will show up here with its live value and fee.
              </>
            }
          />
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

      {/* Section 2: Collection */}
      <section>
        <SectionTitle
          title="My collection"
          subtitle="Every IP token you hold, bought on a bonding curve or in a graduated pool, valued from live curve / pool state."
        />
        {holdings.length === 0 ? (
          <EmptyState
            icon={<Wallet className="size-8 text-muted" strokeWidth={1.5} />}
            title="Your collection is empty"
            body={
              <>
                Buy DRS-verified IP tokens in the{" "}
                <Link href="/market" className="text-primary-ink hover:underline">
                  marketplace
                </Link>{" "}
                and they will show up here with their live value.
              </>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {holdings.map((h) => (
              <Link
                key={h.token}
                href={h.href}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong"
              >
                <RiskPill drs={h.drs} gated={false} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{h.title}</p>
                  <p className="font-mono text-xs text-muted">{formatPct(h.drs)} DRS</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm tabular-nums text-ink">
                    {h.valueUsd != null ? formatUsd(h.valueUsd) : "-"}
                  </p>
                  <p className="text-[11px] text-muted">{h.tokens.toFixed(2)} tokens</p>
                </div>
                <ArrowUpRight className="size-4 text-muted" strokeWidth={2.25} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Section 3: Trade history */}
      <section>
        <SectionTitle
          title="Trade history"
          subtitle="A record of every buy and sell you make in the marketplace, each linked to its on-chain transaction."
        />
        {trades.length === 0 ? (
          <EmptyState
            icon={<History className="size-8 text-muted" strokeWidth={1.5} />}
            title="No trades yet"
            body={
              <>
                Your buys and sells are recorded here as you trade in the{" "}
                <Link href="/market" className="text-primary-ink hover:underline">
                  marketplace
                </Link>
                .
              </>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {trades.map((t, i) => {
              const buy = t.side === "buy";
              return (
                <div
                  key={`${t.txHash}-${i}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      buy ? "bg-risk-low/15 text-risk-low" : "bg-risk-high/10 text-risk-high"
                    )}
                  >
                    {buy ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      <span className="capitalize">{t.side}</span>{" "}
                      <Link href={`/trade/${t.attestationId}`} className="hover:underline">
                        {t.title}
                      </Link>
                    </p>
                    <p className="text-xs text-muted">{new Date(t.at).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm tabular-nums text-ink">
                      {t.amountIn} {t.amountInLabel}
                    </p>
                    <p className="text-[11px] text-muted">
                      <ExplorerLink value={t.txHash} type="tx" prefixChars={6} />
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 4: IL protection simulator */}
      <SimulatorSection
        simChoices={simChoices}
        simPool={simPool}
        setSimPool={setSimPool}
        activeDrs={activeDrs}
        hasPositions={myPositions.length > 0}
      />
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function SummaryCard({label, value, icon}: {label: string; value: string; icon: React.ReactNode}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5">
      <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-primary-ink">
        {icon}
      </span>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
        <p className="font-display text-lg font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}

function SectionTitle({title, subtitle}: {title: string; subtitle: string}) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>
    </div>
  );
}

function EmptyState({icon, title, body}: {icon: React.ReactNode; title: string; body: React.ReactNode}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
      {icon}
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      <p className="max-w-sm text-sm text-muted">{body}</p>
    </div>
  );
}

function SimulatorSection({
  simChoices,
  simPool,
  setSimPool,
  activeDrs,
  hasPositions,
}: {
  simChoices: Pool[];
  simPool: string | null;
  setSimPool: (id: string) => void;
  activeDrs: number;
  hasPositions: boolean;
}) {
  return (
    <section>
      <SectionTitle
        title="IL protection simulator"
        subtitle="Estimate whether the dynamic fee compensates for impermanent loss as DRS rises, the protocol's core thesis: higher dilution risk means a higher fee that protects LP returns."
      />

      {simChoices.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="self-center text-xs text-faint">{hasPositions ? "Your pools:" : "Simulating:"}</span>
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
        Model: fee APY = dynamic fee × {ASSUMED_ANNUAL_TURNOVER}× annual turnover (testnet, no real volume); IL uses
        the x·y=k constant-product formula; price drop assumed linear with DRS. The gate sits at{" "}
        {formatPct(DRS_GATE)}.
      </p>
    </section>
  );
}
