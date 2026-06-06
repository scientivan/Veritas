"use client";

import {Loader2, CoinsIcon} from "lucide-react";
import {useAccount} from "wagmi";
import type {Hex} from "viem";
import {Button} from "./ui/Button";
import {ExplorerLink} from "./ExplorerLink";
import {useRoyalties} from "@/hooks/useRoyalties";
import {cn} from "@/lib/utils";

interface Props {
  ipTokenAddress: Hex;
  ipTokenSymbol?: string;
  className?: string;
}

export function RoyaltyClaimCard({ipTokenAddress, ipTokenSymbol = "IP", className}: Props) {
  const {address} = useAccount();
  const {pendingRoyalties, isClaiming, claim} = useRoyalties(address, ipTokenAddress);

  const hasRoyalties = pendingRoyalties > 0n;

  // Format with 4 significant decimals (IP token is 18 decimals)
  const fmtRoyalties = (v: bigint) => {
    const n = Number(v) / 1e18;
    if (n === 0) return "0";
    if (n < 0.0001) return "<0.0001";
    return n.toFixed(4);
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-full",
            hasRoyalties ? "bg-primary/20 text-primary-ink" : "bg-surface text-muted"
          )}
        >
          <CoinsIcon className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Royalties</p>
          <p className="text-xs text-muted">0.2% of every post-graduation swap</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className={cn("font-mono text-sm font-semibold", hasRoyalties ? "text-ink" : "text-muted")}>
            {fmtRoyalties(pendingRoyalties)}{" "}
            <span className="font-sans text-xs text-muted">{ipTokenSymbol}</span>
          </p>
          <p className="text-xs text-muted">pending</p>
        </div>

        <Button
          variant="primary"
          size="sm"
          disabled={!hasRoyalties || isClaiming || !address}
          onClick={claim}
        >
          {isClaiming ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Claiming
            </>
          ) : (
            "Claim"
          )}
        </Button>
      </div>
    </div>
  );
}
