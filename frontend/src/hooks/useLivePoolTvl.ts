import {useMemo} from "react";
import {useReadContracts} from "wagmi";
import {formatUnits} from "viem";
import {POOL_MANAGER_ADDRESS} from "@/lib/contracts";
import {getLivePool, type LivePool} from "@/lib/livePools";
import {ASSUMED_TOKEN_PRICE_USD} from "@/lib/poolMeta";

const UNICHAIN_SEPOLIA_ID = 1301;

/** Minimal ERC20 slice. The pools use Uniswap's TestERC20 whose decimals() reverts,
 * so we never call it and assume the standard 18 (TestERC20 is 18-decimal). */
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{name: "account", type: "address"}],
    outputs: [{name: "", type: "uint256"}],
  },
] as const;

const DECIMALS = 18;

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
        {address: p.token0, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [POOL_MANAGER_ADDRESS] as [`0x${string}`], chainId: UNICHAIN_SEPOLIA_ID},
        {address: p.token1, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [POOL_MANAGER_ADDRESS] as [`0x${string}`], chainId: UNICHAIN_SEPOLIA_ID},
      ]),
    [pools]
  );

  const {data} = useReadContracts({contracts, query: {enabled: contracts.length > 0}});

  return useMemo(() => {
    const map = new Map<string, number | null>();
    pools.forEach((p, idx) => {
      const base = idx * 2;
      const bal0 = data?.[base];
      const bal1 = data?.[base + 1];
      if (bal0?.status === "success" && bal1?.status === "success") {
        const tokens0 = Number(formatUnits(bal0.result as bigint, DECIMALS));
        const tokens1 = Number(formatUnits(bal1.result as bigint, DECIMALS));
        const p0 = p.token0PriceUsd ?? ASSUMED_TOKEN_PRICE_USD;
        const p1 = p.token1PriceUsd ?? ASSUMED_TOKEN_PRICE_USD;
        map.set(p.attestationId.toLowerCase(), tokens0 * p0 + tokens1 * p1);
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
