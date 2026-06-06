import {useMemo} from "react";
import {useReadContracts} from "wagmi";
import {formatUnits} from "viem";
import {POOL_MANAGER_ADDRESS} from "@/lib/contracts";
import {getLivePool, type LivePool} from "@/lib/livePools";

/** Minimal ERC20 slice: balanceOf + decimals. */
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{name: "account", type: "address"}],
    outputs: [{name: "", type: "uint256"}],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{name: "", type: "uint8"}],
  },
] as const;

/**
 * Real (assumed $1/token, testnet) TVL for live pools. Because each pool uses
 * an exclusive fresh token pair, the PoolManager's ERC20 balance of token0 and
 * token1 equals that pool's reserves. Returns a map keyed by lowercased
 * attestationId. Pools without a record return null TVL.
 */
export function useLivePoolTvl(pools: LivePool[]): Map<string, number | null> {
  const contracts = useMemo(
    () =>
      pools.flatMap((p) => [
        {address: p.token0, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [POOL_MANAGER_ADDRESS] as [`0x${string}`]},
        {address: p.token0, abi: ERC20_ABI, functionName: "decimals" as const},
        {address: p.token1, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [POOL_MANAGER_ADDRESS] as [`0x${string}`]},
        {address: p.token1, abi: ERC20_ABI, functionName: "decimals" as const},
      ]),
    [pools]
  );

  const {data} = useReadContracts({contracts, query: {enabled: contracts.length > 0}});

  return useMemo(() => {
    const map = new Map<string, number | null>();
    pools.forEach((p, idx) => {
      const base = idx * 4;
      const bal0 = data?.[base];
      const dec0 = data?.[base + 1];
      const bal1 = data?.[base + 2];
      const dec1 = data?.[base + 3];
      if (
        bal0?.status === "success" &&
        dec0?.status === "success" &&
        bal1?.status === "success" &&
        dec1?.status === "success"
      ) {
        const tokens0 = Number(formatUnits(bal0.result as bigint, dec0.result as number));
        const tokens1 = Number(formatUnits(bal1.result as bigint, dec1.result as number));
        map.set(p.attestationId.toLowerCase(), tokens0 + tokens1);
      } else {
        map.set(p.attestationId.toLowerCase(), null);
      }
    });
    return map;
  }, [pools, data]);
}

/** Convenience: live TVL (USD, assumed $1/token) for a single attestation, or null. */
export function useSingleLivePoolTvl(attestationId: string): number | null {
  const pool = getLivePool(attestationId);
  const pools = useMemo(() => (pool ? [pool] : []), [pool]);
  const map = useLivePoolTvl(pools);
  return pool ? map.get(pool.attestationId.toLowerCase()) ?? null : null;
}
