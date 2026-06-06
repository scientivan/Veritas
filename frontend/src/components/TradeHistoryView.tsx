"use client";

import {useAccount} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import Link from "next/link";
import {ArrowDownLeft, ArrowUpRight, History} from "lucide-react";
import {useTradeHistory} from "@/hooks/useTradeHistory";
import {ExplorerLink} from "./ExplorerLink";
import {cn} from "@/lib/utils";

export function TradeHistoryView() {
  const {address, isConnected} = useAccount();
  const {trades} = useTradeHistory(address);

  if (!isConnected) {
    return (
      <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="text-muted">Connect your wallet to see your trade history.</p>
        <ConnectButton />
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
        <History className="size-8 text-muted" strokeWidth={1.5} />
        <p className="font-display text-lg font-semibold text-ink">No trades yet</p>
        <p className="max-w-sm text-sm text-muted">
          Your buys and sells are recorded here as you trade in the{" "}
          <Link href="/market" className="text-primary-ink hover:underline">
            marketplace
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-2">
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
  );
}
