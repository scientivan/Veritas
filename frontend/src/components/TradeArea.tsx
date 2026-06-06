"use client";

import type {Hex} from "viem";
import type {Pool} from "@/lib/types";
import type {LivePool} from "@/lib/livePools";
import {useLaunchpadPools} from "@/hooks/useLaunchpadPools";
import {TradePanel} from "./TradePanel";
import {CurveTradePanel} from "./CurveTradePanel";

/**
 * Picks the right trade UI for a token:
 *  - a creator-opened bonding-curve launchpad (from localStorage) -> CurveTradePanel
 *  - a seeded v2 dynamic-fee pool -> TradePanel (AMM swap)
 *  - otherwise -> not tradeable yet
 */
export function TradeArea({pool, seededLivePool}: {pool: Pool; seededLivePool: LivePool | null}) {
  const {getByAttestation} = useLaunchpadPools();
  const launchpad = getByAttestation(pool.id as Hex);

  if (launchpad) {
    return <CurveTradePanel pool={pool} record={launchpad} />;
  }

  if (seededLivePool && !pool.gated) {
    return <TradePanel pool={pool} livePool={seededLivePool} />;
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
