"use client";

import {useState} from "react";
import {useAccount} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {toast} from "sonner";
import {Lock} from "lucide-react";
import type {Pool} from "@/lib/types";
import {Button} from "./ui/Button";
import {dynamicFeeBps} from "@/lib/drs";
import {formatFeeBps, formatUsd, cn} from "@/lib/utils";

export function LpDashboard({pool, tvlUsd}: {pool: Pool; tvlUsd?: number | null}) {
  const {isConnected} = useAccount();
  const [mode, setMode] = useState<"provide" | "remove">("provide");
  const [amount, setAmount] = useState("");

  if (pool.gated) {
    return (
      <div className="rounded-2xl border border-border bg-surface/40 p-6">
        <div className="flex items-center gap-2 text-risk-high">
          <Lock className="size-4" strokeWidth={2.25} aria-hidden />
          <span className="text-sm font-medium">Pool gated</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This content&apos;s Dilution Risk Score is above the protocol gate, so no pool exists to
          provide liquidity to. The gate protects LPs from a near-certain dilution loss.
        </p>
      </div>
    );
  }

  function submit() {
    const n = Number(amount);
    if (!n || n <= 0) {
      toast.error("Enter an amount first");
      return;
    }
    toast.success(`${mode === "provide" ? "Provided" : "Removed"} ${amount} ETH of liquidity`, {
      description: "Demo action. No transaction was sent.",
    });
    setAmount("");
  }

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-bg p-1">
        {(["provide", "remove"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg py-2 text-sm font-medium capitalize transition-colors",
              mode === m ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="text-xs text-muted">Amount</span>
        <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-border bg-bg px-3 focus-within:border-border-strong">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.0"
            className="h-12 w-full bg-transparent font-mono text-lg tnum text-ink placeholder:text-faint focus:outline-none"
          />
          <span className="font-mono text-sm text-muted">ETH</span>
        </div>
      </label>

      <dl className="mt-4 flex flex-col gap-2 text-sm">
        <Row label="Current LP fee" value={formatFeeBps(dynamicFeeBps(pool.drs, pool.baseFeeBps, pool.maxFeeBps))} />
        <Row label="TVL" value={tvlUsd != null ? `${formatUsd(tvlUsd)} (sim.)` : "-"} />
        <Row label="Pool APY" value="- (n/a on testnet)" subtle />
        <Row label="Risk surcharge funds" value="LP insurance reserve" subtle />
      </dl>

      <div className="mt-5">
        {isConnected ? (
          <Button className="w-full" size="lg" onClick={submit}>
            {mode === "provide" ? "Provide liquidity" : "Remove liquidity"}
          </Button>
        ) : (
          <div className="[&_button]:w-full">
            <ConnectButton.Custom>
              {({openConnectModal}) => (
                <Button className="w-full" size="lg" onClick={openConnectModal}>
                  Connect wallet to provide
                </Button>
              )}
            </ConnectButton.Custom>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({label, value, subtle}: {label: string; value: string; subtle?: boolean}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("font-mono tnum", subtle ? "text-muted" : "text-ink")}>{value}</dd>
    </div>
  );
}
