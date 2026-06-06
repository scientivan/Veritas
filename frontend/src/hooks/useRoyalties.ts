"use client";

import {useReadContract, useWriteContract} from "wagmi";
import {useCallback} from "react";
import type {Hex} from "viem";
import {V1_HOOK_ABI} from "@/lib/abis";
import {V1_HOOK_ADDRESS} from "@/lib/contracts";

/**
 * Reads pending royalties for a creator+token pair from v1 VeritasHook,
 * and exposes a claim function.
 */
export function useRoyalties(creatorAddress: Hex | undefined, ipTokenAddress: Hex | undefined) {
  const {data: pendingRaw, refetch} = useReadContract({
    address: V1_HOOK_ADDRESS,
    abi: V1_HOOK_ABI,
    functionName: "pendingRoyalties",
    args: creatorAddress && ipTokenAddress ? [creatorAddress, ipTokenAddress] : undefined,
    query: {
      enabled: !!creatorAddress && !!ipTokenAddress,
      refetchInterval: 15_000,
    },
  });

  const {writeContractAsync, isPending: isClaiming} = useWriteContract();

  const claim = useCallback(async () => {
    if (!ipTokenAddress) return;
    await writeContractAsync({
      address: V1_HOOK_ADDRESS,
      abi: V1_HOOK_ABI,
      functionName: "claimRoyalties",
      args: [ipTokenAddress],
    });
    await refetch();
  }, [ipTokenAddress, writeContractAsync, refetch]);

  return {
    pendingRoyalties: (pendingRaw as bigint | undefined) ?? 0n,
    isClaiming,
    claim,
  };
}
