import {createPublicClient, formatUnits, http} from "viem";
import {ASSUMED_TOKEN_PRICE_USD} from "./poolMeta";
import type {Address, Hex} from "viem";
import {unichainSepolia} from "./chains";
import {POOL_MANAGER_ADDRESS} from "./contracts";

/**
 * Real Uniswap v4 pools opened through the Veritas hook (liquidity added + swap
 * executed). Keyed by the attestation they were registered against. Mirrors
 * contracts/deployments/pool.json.
 */
export interface LivePool {
  attestationId: Hex;
  poolId: Hex;
  token0: Address;
  token1: Address;
  baseFeeBps: number;
  maxFeeBps: number;
  drsGateThreshold: number;
  /** USD price per 1 token0 unit (18-dec). Defaults to ASSUMED_TOKEN_PRICE_USD if absent. */
  token0PriceUsd?: number;
  /** USD price per 1 token1 unit (18-dec). Defaults to ASSUMED_TOKEN_PRICE_USD if absent. */
  token1PriceUsd?: number;
  /** v4 pool fee in the PoolKey. Defaults to DYNAMIC_FEE_FLAG (0x800000). Launchpad-graduated
   *  pools use a static fee (3000) set at initialization time. */
  poolFee?: number;
  /** Hook address in the PoolKey. Defaults to HOOK_ADDRESS (v2 DRS hook). Launchpad-graduated
   *  pools were opened by V1_HOOK_ADDRESS and must use that address in their pool key. */
  hooksAddress?: Address;
  /** Whether token0 supports permissionless mint(address,uint256). Defaults to true.
   *  IP tokens deployed by IPTokenFactory have a fixed supply and no public mint. */
  token0Mintable?: boolean;
}

// Seed data cleared: all pools now derive from on-chain IPRegistered events.
const POOLS: LivePool[] = [];

const BY_ATTESTATION = new Map(POOLS.map((p) => [p.attestationId.toLowerCase(), p]));

export function getLivePool(attestationId: string): LivePool | undefined {
  return BY_ATTESTATION.get(attestationId.toLowerCase());
}

export function hasLivePool(attestationId: string): boolean {
  return BY_ATTESTATION.has(attestationId.toLowerCase());
}

/** All live v4 pools opened through the hook. */
export function getLivePoolList(): LivePool[] {
  return POOLS;
}

/** Minimal ERC20 slice. The pools use Uniswap's TestERC20 whose decimals() reverts,
 * so we never call it and assume the standard 18. */
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

const tvlClient = createPublicClient({
  chain: unichainSepolia,
  transport: http(),
});

/**
 * Real (assumed $1/token) TVL for a live pool. Because each pool uses an
 * exclusive fresh token pair, the PoolManager's ERC20 balance of token0/token1
 * equals that pool's reserves. Returns null on read failure.
 */
export async function getLivePoolTvl(
  pool: LivePool
): Promise<{tvlTokens: number; tvlUsd: number} | null> {
  try {
    const [bal0, bal1] = await Promise.all([
      tvlClient.readContract({address: pool.token0, abi: ERC20_ABI, functionName: "balanceOf", args: [POOL_MANAGER_ADDRESS]}),
      tvlClient.readContract({address: pool.token1, abi: ERC20_ABI, functionName: "balanceOf", args: [POOL_MANAGER_ADDRESS]}),
    ]);
    const tokens0 = Number(formatUnits(bal0 as bigint, DECIMALS));
    const tokens1 = Number(formatUnits(bal1 as bigint, DECIMALS));
    const tvlTokens = tokens0 + tokens1;
    const p0 = pool.token0PriceUsd ?? ASSUMED_TOKEN_PRICE_USD;
    const p1 = pool.token1PriceUsd ?? ASSUMED_TOKEN_PRICE_USD;
    return {tvlTokens, tvlUsd: tokens0 * p0 + tokens1 * p1};
  } catch {
    return null;
  }
}
