"use client";

import {useMemo} from "react";
import {Loader2} from "lucide-react";
import type {Hex} from "viem";
import type {Pool} from "@/lib/types";
import type {LivePool} from "@/lib/livePools";
import {useOnChainLaunchpads} from "@/hooks/useOnChainLaunchpads";
import {buildLaunchpadKey, computePoolId, type LaunchpadRecord} from "@/lib/launchpad";
import {RAISE_TOKEN_ADDRESS} from "@/lib/contracts";
import {TradePanel} from "./TradePanel";
import {CurveTradePanel} from "./CurveTradePanel";

/**
 * Picks the right trade UI for a token:
 *  - a launched IP token with a bonding-curve launchpad -> CurveTradePanel
 *  - a seeded v2 dynamic-fee pool -> TradePanel (AMM swap)
 *  - otherwise -> not tradeable yet
 *
 * The launchpad is resolved from PERSISTENT state, not in-session memory, so it
 * shows for any visitor (e.g. a collector who didn't open it):
 *   1. pool.tokenAddress (resolved server-side, already disambiguated by ?token=)
 *   2. on-chain IPRegistered events (useOnChainLaunchpads) as a fallback
 * CurveTradePanel reads the live launchpad phase on-chain itself, so it renders
 * the correct buy/sell/inactive state regardless of how the token was found.
 */
export function TradeArea({pool, seededLivePool}: {pool: Pool; seededLivePool: LivePool | null}) {
  const {entries, isLoading} = useOnChainLaunchpads();

  // Fallback discovery: match the on-chain registration by the specific token
  // when known, else by attestation id.
  const onChainEntry = useMemo(() => {
    const wantToken = pool.tokenAddress?.toLowerCase();
    return (
      entries.find((e) =>
        wantToken
          ? e.tokenAddress.toLowerCase() === wantToken
          : e.attestationId.toLowerCase() === pool.id.toLowerCase()
      ) ?? null
    );
  }, [entries, pool.tokenAddress, pool.id]);

  const ipToken = pool.tokenAddress ?? onChainEntry?.tokenAddress;

  if (ipToken) {
    // CurveTradePanel recomputes the pool key + id from ipToken, so the only
    // field it truly needs is a correct ipToken; the rest is for display.
    const {key, ipIsToken0} = buildLaunchpadKey(ipToken);
    const record: LaunchpadRecord = {
      attestationId: pool.id as Hex,
      ipToken,
      poolId: computePoolId(key),
      raiseToken: RAISE_TOKEN_ADDRESS,
      ipIsToken0,
      tokenName: onChainEntry?.tokenName || pool.title,
      tokenSymbol: pool.tokenSymbol || onChainEntry?.tokenSymbol || "",
      hardCap: "0",
      openedAt: 0,
    };
    return <CurveTradePanel pool={pool} record={record} />;
  }

  if (seededLivePool && !pool.gated) {
    return <TradePanel pool={pool} livePool={seededLivePool} />;
  }

  // The server didn't pre-resolve a token and the on-chain list is still loading:
  // wait before declaring "not tradeable" to avoid a misleading flash.
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface/40 p-6 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" />
        Checking launchpad status...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-6">
      <h3 className="text-sm font-medium text-ink">Not tradeable yet</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {pool.gated
          ? "This content is gated by its Dilution Risk Score, so no pool exists to trade against."
          : "This IP token does not have a live pool yet. Once its creator opens a launchpad, you can trade it here."}
      </p>
    </div>
  );
}
