"use client";

import {useState, useCallback, useEffect} from "react";
import type {Hex} from "viem";

/**
 * Tracks an LP's liquidity positions per pool, in localStorage keyed by wallet.
 *
 * The PoolModifyLiquidityTest router holds positions under its own address (not the
 * end user), so there's no reliable per-wallet position read on-chain. We instead
 * record the net token0 the user has provided through the app, enough to drive a
 * "My Positions" view. Live pool state (DRS, fee, TVL) is still read on-chain.
 */
export interface LpPosition {
  attestationId: Hex;
  /** Net token0 provided, in wei (1e18), as a string. */
  netToken0: string;
  updatedAt: number;
}

const STORAGE_KEY = "veritas-lp-positions";

function keyFor(address?: string) {
  return `${STORAGE_KEY}:${(address ?? "anon").toLowerCase()}`;
}

export function useLpPositions(address?: string) {
  const [positions, setPositions] = useState<LpPosition[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(address));
      setPositions(raw ? (JSON.parse(raw) as LpPosition[]) : []);
    } catch {
      setPositions([]);
    }
  }, [address]);

  const adjust = useCallback(
    (attestationId: Hex, deltaWei: bigint) => {
      setPositions((prev) => {
        const existing = prev.find((p) => p.attestationId.toLowerCase() === attestationId.toLowerCase());
        const current = existing ? BigInt(existing.netToken0) : 0n;
        let next = current + deltaWei;
        if (next < 0n) next = 0n;
        const rest = prev.filter((p) => p.attestationId.toLowerCase() !== attestationId.toLowerCase());
        const updated: LpPosition[] =
          next === 0n
            ? rest
            : [{attestationId, netToken0: next.toString(), updatedAt: Date.now()}, ...rest];
        try {
          localStorage.setItem(keyFor(address), JSON.stringify(updated));
        } catch {}
        return updated;
      });
    },
    [address]
  );

  const recordProvide = useCallback((id: Hex, wei: bigint) => adjust(id, wei), [adjust]);
  const recordRemove = useCallback((id: Hex, wei: bigint) => adjust(id, -wei), [adjust]);

  return {positions, recordProvide, recordRemove};
}
