import {createPublicClient, formatUnits, http} from "viem";
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
}

const POOLS: LivePool[] = [
  {
    attestationId: "0xf87daf94ea2f9f4f5ffaa5950abd1dd285b9ff75b1b4d72c42409cea7e40d109",
    poolId: "0xf9372b93c55a14646ad479553fbc979e6e396962d46a9dae2780480ddbf0ff0e",
    token0: "0x74E11722a8d4C0761D76B6d209A06A8C32e25493",
    token1: "0xff4a15916048847513c5e5942F33a4cc48a61f81",
    baseFeeBps: 3000,
    maxFeeBps: 10000,
    drsGateThreshold: 8500,
  },
  {
    attestationId: "0xfe31192bd6a23aee0a3b90e4458e638d3e0a0d8bbf3bfd0afe559635a1f45ce6",
    poolId: "0x0cb69e91fdd412bf4b4a2ee03e2909b949c483778b116d4c6a54ced862aa0316",
    token0: "0x458c6527d7FdeA7362c18224fBB1a283FD12B147",
    token1: "0x5104De50672Bda310652Db9DF29Cb00953859cdb",
    baseFeeBps: 3000,
    maxFeeBps: 10000,
    drsGateThreshold: 8500,
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
    const [bal0, dec0, bal1, dec1] = await Promise.all([
      tvlClient.readContract({address: pool.token0, abi: ERC20_ABI, functionName: "balanceOf", args: [POOL_MANAGER_ADDRESS]}),
      tvlClient.readContract({address: pool.token0, abi: ERC20_ABI, functionName: "decimals"}),
      tvlClient.readContract({address: pool.token1, abi: ERC20_ABI, functionName: "balanceOf", args: [POOL_MANAGER_ADDRESS]}),
      tvlClient.readContract({address: pool.token1, abi: ERC20_ABI, functionName: "decimals"}),
    ]);
    const tokens0 = Number(formatUnits(bal0 as bigint, dec0 as number));
    const tokens1 = Number(formatUnits(bal1 as bigint, dec1 as number));
    const tvlTokens = tokens0 + tokens1;
    // Assumed $1 per token on testnet.
    return {tvlTokens, tvlUsd: tvlTokens};
  } catch {
    return null;
  }
}
