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
  {
    attestationId: "0xeca8861a2533832cfd036228c91a9a8271944ea6c2df9d84f00c75373117a1c3",
    poolId: "0xefadbb4f8d6458547bf2ecf5f8eefbda292f54d11dcd6637c4da9722d149817f",
    token0: "0x11d83a56d06963c72817C76854C0710Fe88C4582",
    token1: "0x406EC8B57837e83802B0E699cFCB46b2efA2b8cC",
    baseFeeBps: 3000,
    maxFeeBps: 10000,
    drsGateThreshold: 8500,
  },
  {
    attestationId: "0x64e1d0819681e2b7820138e89bceeb333a3b10a9d87286bd857fcb8b9cb0f3e6",
    poolId: "0x8c8868a674b13f69f1644074137c7c99ac5f3201edacb8808df8af1657a0053c",
    token0: "0xa7E576AD9878bD3C7285AeEC808708432f2c933C",
    token1: "0xBdCD508Aa37575b25a8311c544f7E47e50D65556",
    baseFeeBps: 3000,
    maxFeeBps: 10000,
    drsGateThreshold: 8500,
  },
  {
    attestationId: "0x59c69769faae70b3491acdae9a7898384982645a3d7887e44776c2dfa474c199",
    poolId: "0x297db603fd8ee23d074f7e3b610e39a6f926d15908a1d416cadec37a3246bf21",
    token0: "0x08433d25448631971c3D17f385520fA7eCE0e312",
    token1: "0x1246331C7b611f8C17bf13ceFD044967bc6EED5b",
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
