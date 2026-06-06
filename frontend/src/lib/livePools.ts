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
}

const POOLS: LivePool[] = [
  {
    attestationId: "0x40e6a7dc19b5b6314b6084ff13db1475e0ac3c9859fb884b969e2ab861a1a4b9",
    poolId: "0xac25408919c0932a0f5e1250f93a4ac9ab7fb88b8f8edf466b9d3dd8a14259af",
    token0: "0xeD55FB324761b65F62C524caC8dE39154C8797A5",
    token1: "0xF0337F1aa72844F9a2628338DFf3bBcF77af0bf3",
    baseFeeBps: 3000,
    maxFeeBps: 10000,
    drsGateThreshold: 8500,
    token0PriceUsd: 1,
    token1PriceUsd: 3000,
  },
  {
    attestationId: "0x1105152961f82de0774f53cf7164180584a12d4e7449a3f9bf636d285dac881c",
    poolId: "0xf19c91f52ef5aae79127bd943fac3031c160d7d9ed5244b5e00a721ae87f2d2b",
    token0: "0x782BEc7Dc157a7a5b569ce07cF949DE803ac5508",
    token1: "0xE388f7DB82a0ca0923e970cea5cD2867a4452ef7",
    baseFeeBps: 3000,
    maxFeeBps: 10000,
    drsGateThreshold: 8500,
    token0PriceUsd: 1,
    token1PriceUsd: 3000,
  },
  {
    attestationId: "0x2cd1bffbf7ffca4bf7827d1c9d6722bd02080dd3e852e37bfc63beeb6ca5900e",
    poolId: "0x3dc931d45e7b1ead40e0684a12453fb6a40c7e9b1752209858700d4ab965a5eb",
    token0: "0x22023CDF642e658b19A5352269600F7b4e24ACb8",
    token1: "0x96a2d5f51FAe7ADF0740A9ec18987bD33f4D7CEa",
    baseFeeBps: 3000,
    maxFeeBps: 10000,
    drsGateThreshold: 8500,
    token0PriceUsd: 1,
    token1PriceUsd: 3000,
  },
  {
    attestationId: "0x224e1cadba8dfbee555ead7d55e5a5b76e0e638b07fbda93a4d8c98979d5fecf",
    poolId: "0x0634ba9699e1760f4072e8e22a54061d3fb751d786c5bcb14f4f8382c27f67f7",
    token0: "0x202eA4453060d91A3b14BF5591751fB0eb40ca72",
    token1: "0x6131802ED6D45982fB5AA270e007E349635BC338",
    baseFeeBps: 3000,
    maxFeeBps: 10000,
    drsGateThreshold: 8500,
    token0PriceUsd: 1,
    token1PriceUsd: 3000,
  },
];

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
