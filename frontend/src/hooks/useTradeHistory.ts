"use client";

import {useState, useCallback, useEffect} from "react";
import type {Hex} from "viem";

/**
 * Collector buy/sell history, persisted in localStorage and keyed by wallet.
 *
 * The public Unichain RPC caps eth_getLogs to a 10000-block range, so a reliable
 * full swap history cannot be reconstructed from on-chain logs alone. We instead
 * record each trade the collector makes through the app at confirmation time,
 * the same pragmatic pattern used for launched IPs.
 */
export interface TradeRecord {
  /** Attestation id of the IP token traded (the marketplace/pool key). */
  attestationId: Hex;
  side: "buy" | "sell";
  /** IP token symbol/name for display. */
  title: string;
  /** Amount of the input token spent (1e18, human string). */
  amountIn: string;
  /** Input token label (e.g. "ETH" for a buy, the IP symbol for a sell). */
  amountInLabel: string;
  txHash: Hex;
  at: number;
}

const STORAGE_KEY = "veritas-trade-history";

function keyFor(address?: string) {
  return `${STORAGE_KEY}:${(address ?? "anon").toLowerCase()}`;
}

export function useTradeHistory(address?: string) {
  const [trades, setTrades] = useState<TradeRecord[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(address));
      setTrades(raw ? (JSON.parse(raw) as TradeRecord[]) : []);
    } catch {
      setTrades([]);
    }
  }, [address]);

  const addTrade = useCallback(
    (t: TradeRecord) => {
      setTrades((prev) => {
        const next = [t, ...prev];
        try {
          localStorage.setItem(keyFor(address), JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [address]
  );

  return {trades, addTrade};
}
