"use client";

import {useReadContract} from "wagmi";
import type {Hex} from "viem";
import {V1_HOOK_ABI} from "@/lib/abis";
import {V1_HOOK_ADDRESS} from "@/lib/contracts";
import {decodeLaunchpads} from "@/lib/launchpad";
import type {LaunchpadPhase, LaunchpadInfo} from "@/lib/types";

const PHASE_MAP: Record<number, LaunchpadPhase> = {
  0: "INACTIVE",
  1: "LAUNCHPAD",
  2: "GRADUATED",
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

  const result = decodeLaunchpads(data as readonly unknown[] | undefined);

  if (!result || !poolId || !ipToken || !raiseToken) {
    return {launchpad: null, isLoading};
  }

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
