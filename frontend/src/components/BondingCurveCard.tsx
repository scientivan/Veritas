"use client";

import {TrendingUp, Lock, Zap} from "lucide-react";
import type {LaunchpadInfo} from "@/lib/types";
import {cn} from "@/lib/utils";

const PHASE_LABEL: Record<LaunchpadInfo["phase"], string> = {
  INACTIVE: "Inactive",
  LAUNCHPAD: "Launchpad",
  GRADUATED: "Graduated",
};

const PHASE_COLOR: Record<LaunchpadInfo["phase"], string> = {
  INACTIVE: "text-muted bg-surface",
  LAUNCHPAD: "text-amber-600 bg-amber-500/10",
  GRADUATED: "text-green-600 bg-green-500/10",
};

interface Props {
  launchpad: LaunchpadInfo;
  className?: string;
}

export function BondingCurveCard({launchpad, className}: Props) {
  const {phase, fundsRaised, hardCap, tokensSold, curveAllocation} = launchpad;

  const raisePct = hardCap > 0n ? Number((fundsRaised * 10000n) / hardCap) / 100 : 0;
  const tokenPct =
    curveAllocation > 0n ? Number((tokensSold * 10000n) / curveAllocation) / 100 : 0;

  // Format USDC (6 decimals)
  const fmtUsdc = (v: bigint) => {
    const n = Number(v) / 1e6;
    return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
  };

  return (
    <div className={cn("flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {phase === "GRADUATED" ? (
            <Lock className="size-4 text-green-600" />
          ) : (
            <Zap className="size-4 text-amber-500" />
          )}
          <span className="text-sm font-semibold text-ink">Bonding Curve</span>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", PHASE_COLOR[phase])}>
          {PHASE_LABEL[phase]}
        </span>
      </div>

      {phase === "LAUNCHPAD" && (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Raise progress</span>
              <span className="font-semibold text-ink">
                {fmtUsdc(fundsRaised)} / {fmtUsdc(hardCap)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{width: `${Math.min(raisePct, 100)}%`}}
              />
            </div>
            <p className="text-right text-xs text-muted">{raisePct.toFixed(1)}% funded</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Tokens sold</span>
              <span className="font-semibold text-ink">{tokenPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary-ink/60 transition-all"
                style={{width: `${Math.min(tokenPct, 100)}%`}}
              />
            </div>
          </div>
        </>
      )}

      {phase === "GRADUATED" && (
        <div className="flex items-center gap-2 rounded-xl bg-green-500/10 p-3 text-sm">
          <TrendingUp className="size-4 text-green-600 shrink-0" />
          <span className="text-green-700 dark:text-green-400">
            Raised {fmtUsdc(fundsRaised)}. Now live as a CLMM pool with LP locked permanently.
          </span>
        </div>
      )}

      {phase === "INACTIVE" && (
        <p className="text-sm text-muted">Pool initialized but launchpad not yet started.</p>
      )}
    </div>
  );
}
