"use client";

import {useMemo} from "react";
import Link from "next/link";
import {useAccount, useReadContracts} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {Wallet, ArrowRight} from "lucide-react";
import {formatEther} from "viem";
import {useAttestations} from "@/hooks/useAttestations";
import {getLivePool, hasLivePool} from "@/lib/livePools";
import {TEST_ERC20_ABI} from "@/lib/liquidity";
import {RiskPill} from "./RiskPill";
import {formatUsd} from "@/lib/utils";

export function CollectorPortfolio() {
  const {address, isConnected} = useAccount();
  const {pools} = useAttestations();

  const tradeable = useMemo(
    () => pools.filter((p) => !p.gated && hasLivePool(p.id)),
    [pools]
  );

  // The wallet's IP-token (token0) balance for each tradeable pool.
  const {data} = useReadContracts({
    contracts:
      address && tradeable.length > 0
        ? tradeable.map((p) => {
            const lp = getLivePool(p.id)!;
            return {
              address: lp.token0,
              abi: TEST_ERC20_ABI,
              functionName: "balanceOf" as const,
              args: [address] as const,
            };
          })
        : [],
    query: {enabled: !!address && tradeable.length > 0},
  });

  const holdings = useMemo(() => {
    if (!data) return [];
    return tradeable
      .map((p, i) => {
        const lp = getLivePool(p.id)!;
        const bal = (data[i]?.result as bigint | undefined) ?? 0n;
        const tokens = Number(formatEther(bal));
        // Value at the IP token's assumed unit price (token0PriceUsd, ~$1 on the
        // seeded demo). The raw pool ratio is demo-calibrated and not a USD price.
        return {pool: p, tokens, valueUsd: tokens * (lp.token0PriceUsd ?? 1)};
      })
      .filter((h) => h.tokens > 0);
  }, [data, tradeable]);

  const totalValue = holdings.reduce((sum, h) => sum + h.valueUsd, 0);

  if (!isConnected) {
    return (
      <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="text-muted">Connect your wallet to see your collection.</p>
        <ConnectButton />
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
        <Wallet className="size-8 text-muted" strokeWidth={1.5} />
        <p className="font-display text-lg font-semibold text-ink">Your collection is empty</p>
        <p className="max-w-sm text-sm text-muted">
          Buy DRS-verified IP tokens in the{" "}
          <Link href="/market" className="text-primary-ink hover:underline">
            marketplace
          </Link>{" "}
          and they will show up here with their live value.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-5">
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="text-xs uppercase tracking-wide text-muted">Collection value (sim.)</p>
        <p className="mt-1 font-display text-3xl font-semibold text-ink">{formatUsd(totalValue)}</p>
        <p className="mt-1 text-xs text-muted">
          {holdings.length} IP token{holdings.length === 1 ? "" : "s"} held · priced from live pool
          state
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {holdings.map(({pool, tokens, valueUsd}) => (
          <Link
            key={pool.id}
            href={`/trade/${pool.id}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong"
          >
            <RiskPill drs={pool.drs} gated={false} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{pool.title}</p>
              <p className="text-xs text-muted">by {pool.creator}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm tabular-nums text-ink">{formatUsd(valueUsd)}</p>
              <p className="text-[11px] text-muted">{tokens.toFixed(2)} tokens</p>
            </div>
            <ArrowRight className="size-4 text-muted" strokeWidth={2.25} />
          </Link>
        ))}
      </div>
    </div>
  );
}
