"use client";

import {useReadContract} from "wagmi";
import type {Hex} from "viem";
import {V1_HOOK_ABI} from "@/lib/abis";
import {V1_HOOK_ADDRESS} from "@/lib/contracts";
import type {LaunchpadPhase, LaunchpadInfo} from "@/lib/types";

const PHASE_MAP: Record<number, LaunchpadPhase> = {
  0: "INACTIVE",
  1: "LAUNCHPAD",
  2: "GRADUATED",
};

type LaunchpadResult = {
  phase: number;
  migrating: boolean;
  launchTokenIs0: boolean;
  curveAllocation: bigint;
  lpAllocation: bigint;
  tokensSold: bigint;
  fundsRaised: bigint;
  hardCap: bigint;
  curveA: bigint;
  curveB: bigint;
  graduationSqrtPriceX96: bigint;
  veritasTreasury: `0x${string}`;
};

/**
 * Reads launchpad config from v1 VeritasHook for a given pool ID.
 * Returns null while loading or if pool has no launchpad.
 */
export function useBondingCurve(
  poolId: Hex | null,
  ipToken?: Hex,
  raiseToken?: Hex
): {launchpad: LaunchpadInfo | null; isLoading: boolean} {
  const {data, isLoading} = useReadContract({
    address: V1_HOOK_ADDRESS,
    abi: V1_HOOK_ABI,
    functionName: "launchpads",
    args: poolId ? [poolId] : undefined,
    query: {enabled: !!poolId},
  });

  if (!data || !poolId || !ipToken || !raiseToken) {
    return {launchpad: null, isLoading};
  }

  const result = data as LaunchpadResult;

  return {
    launchpad: {
      poolId,
      ipToken,
      raiseToken,
      phase: PHASE_MAP[result.phase] ?? "INACTIVE",
      fundsRaised: result.fundsRaised,
      hardCap: result.hardCap,
      tokensSold: result.tokensSold,
      curveAllocation: result.curveAllocation,
    },
    isLoading,
  };
}
