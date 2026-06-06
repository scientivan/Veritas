"use client";

import {useEffect, useState} from "react";
import Link from "next/link";
import {useAccount, useReadContract} from "wagmi";
import {Loader2, TrendingUp, ArrowRight, CheckCircle2, AlertCircle} from "lucide-react";
import type {Hex, Address} from "viem";
import {Button} from "./ui/Button";
import {ExplorerLink} from "./ExplorerLink";
import {useIPLaunch} from "@/hooks/useIPLaunch";
import {useLaunchpadPools} from "@/hooks/useLaunchpadPools";
import {RAISE_TOKEN_ADDRESS, RAISE_TOKEN_SYMBOL, V1_HOOK_ADDRESS} from "@/lib/contracts";
import {V1_HOOK_ABI} from "@/lib/abis";
import {
  parseHardCap,
  defaultAllocations,
  buildLaunchpadKey,
  computePoolId,
  decodeLaunchpads,
  LaunchpadPhase,
} from "@/lib/launchpad";

const TOTAL_SUPPLY_ABI = [
  {name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{name: "", type: "uint256"}]},
] as const;

/**
 * Opens a bonding-curve launchpad for an ALREADY-registered IP token, in place —
 * no need to re-run Verify / Attest & Mint / Register. Reads the token's supply
 * on-chain, then runs the 4-tx openLaunchpad sequence and persists the result.
 */
export function OpenLaunchpadInline({
  attestationId,
  ipToken,
  tokenName,
  tokenSymbol,
  tokenURI,
}: {
  attestationId: Hex;
  ipToken: Address;
  tokenName: string;
  tokenSymbol: string;
  tokenURI: string;
}) {
  const {address} = useAccount();
  const {state, openLaunchpad} = useIPLaunch();
  const {addLaunchpad} = useLaunchpadPools();
  const [hardCap, setHardCap] = useState("1000");

  const {data: totalSupply} = useReadContract({
    address: ipToken,
    abi: TOTAL_SUPPLY_ABI,
    functionName: "totalSupply",
  });

  // On-chain phase is the source of truth for "is the curve live" (not localStorage,
  // which can hold a phantom record from a previously-reverted open).
  const launchPoolId = computePoolId(buildLaunchpadKey(ipToken).key);
  const {data: lpData} = useReadContract({
    address: V1_HOOK_ADDRESS,
    abi: V1_HOOK_ABI,
    functionName: "launchpads",
    args: [launchPoolId],
  });
  const cfg = decodeLaunchpads(lpData as readonly unknown[] | undefined);
  const liveOnChain = !!cfg && Number(cfg.phase) !== LaunchpadPhase.INACTIVE;

  const isOpening = state.step === "opening";
  const isDone = state.step === "opened" || liveOnChain;

  // Persist the opened launchpad so the marketplace / studio pick it up.
  useEffect(() => {
    if (isDone && state.poolId && state.ipIsToken0 !== null) {
      addLaunchpad({
        attestationId,
        ipToken,
        poolId: state.poolId,
        raiseToken: RAISE_TOKEN_ADDRESS,
        ipIsToken0: state.ipIsToken0,
        tokenName,
        tokenSymbol,
        hardCap,
        openedAt: Date.now(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, state.poolId, state.ipIsToken0]);

  if (isDone) {
    return (
      <div className="rounded-xl border border-risk-low/30 bg-risk-low/5 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-risk-low">
          <CheckCircle2 className="size-4" />
          Bonding curve is live
        </p>
        <Link
          href={`/trade/${attestationId}`}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary-ink hover:underline"
        >
          View in marketplace
          <ArrowRight className="size-3.5" strokeWidth={2.25} />
        </Link>
      </div>
    );
  }

  const supply = (totalSupply as bigint | undefined) ?? 0n;
  const {curveAllocation, lpAllocation} = defaultAllocations(supply);
  const capValid = parseHardCap(hardCap) > 0n;
  const canOpen = !!address && supply > 0n && capValid && !isOpening;

  return (
    <div className="rounded-xl border border-dashed border-border bg-bg p-4">
      <p className="text-sm font-medium text-ink">Open a bonding curve</p>
      <p className="mt-1 text-xs text-muted">
        Let collectors buy this IP on a fair-launch curve and raise initial capital — your token is
        already registered, so this is a one-step action.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          Raise target ({RAISE_TOKEN_SYMBOL})
          <input
            type="number"
            min="1"
            step="any"
            value={hardCap}
            onChange={(e) => setHardCap(e.target.value)}
            disabled={isOpening}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-primary-ink focus:outline-none"
          />
        </label>
        <Button size="sm" disabled={!canOpen} onClick={() => void openLaunchpad({
          ipToken,
          royaltyReceiver: address as Hex,
          tokenURI: tokenURI || `ipfs://veritas/${tokenSymbol}`,
          totalSupply: supply,
          hardCap: parseHardCap(hardCap),
        })}>
          {isOpening ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Opening…
            </>
          ) : (
            <>
              <TrendingUp className="size-3.5" strokeWidth={2.25} />
              Open bonding curve
            </>
          )}
        </Button>
      </div>

      {supply > 0n && (
        <p className="mt-2 text-[11px] text-faint">
          60% sold on the curve · 30% reserved for the graduated pool · 10% kept by you
          {" "}({fmtK(curveAllocation)} / {fmtK(lpAllocation)} {tokenSymbol}).
        </p>
      )}

      {isOpening && state.openStatus && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-primary-ink">
          <Loader2 className="size-3 animate-spin" />
          {state.openStatus} (4 transactions)
        </p>
      )}
      {state.openTxHash && (
        <p className="mt-2 text-[11px] text-muted">
          Tx: <ExplorerLink value={state.openTxHash} type="tx" prefixChars={6} />
        </p>
      )}
      {state.step === "error" && state.error && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-risk-high">
          <AlertCircle className="mt-0.5 size-3 shrink-0" />
          {state.error.slice(0, 140)}
        </p>
      )}
    </div>
  );
}

function fmtK(wei: bigint): string {
  const n = Number(wei) / 1e18;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return n.toFixed(0);
}
