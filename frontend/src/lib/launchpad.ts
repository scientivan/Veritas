import {parseEther, keccak256, encodeAbiParameters, type Address, type Hex} from "viem";
import {V1_HOOK_ADDRESS, RAISE_TOKEN_ADDRESS} from "./contracts";

/**
 * Helpers for the v1 bonding-curve launchpad (VeritasHook at V1_HOOK_ADDRESS).
 *
 * Flow to open a launchpad for a freshly launched IP token:
 *   1. v1 VeritasRegistry.registerIP(token, receiver, uri)  - marks the token verified
 *   2. PoolManager.initialize(key, SQRT_PRICE_1_1)           - hook caches treasury
 *   3. IPToken.approve(hook, curveAllocation + lpAllocation)
 *   4. VeritasHook.initializeLaunchpad(key, curve, lp, hardCap, treasury)
 *
 * The pool pairs the IP token with the raise token (Mock USDC). currency0/1 are
 * sorted by address as Uniswap v4 requires.
 */

/** Static 0.30% fee + standard spacing (the v1 hook does not require a dynamic fee). */
export const LAUNCHPAD_FEE = 3000;
export const LAUNCHPAD_TICK_SPACING = 60;

/** sqrt(1) * 2^96: neutral init price; the curve bypasses the AMM until graduation. */
export const SQRT_PRICE_1_1 = 79228162514264337593543950336n;

export type LaunchpadPoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

/** Uniswap v4 PoolId = keccak256(abi.encode(PoolKey)). Computed client-side so we
 *  can read VeritasHook.launchpads(poolId) and persist the pool without an indexer. */
export function computePoolId(key: LaunchpadPoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            {name: "currency0", type: "address"},
            {name: "currency1", type: "address"},
            {name: "fee", type: "uint24"},
            {name: "tickSpacing", type: "int24"},
            {name: "hooks", type: "address"},
          ],
        },
      ],
      [
        {
          currency0: key.currency0,
          currency1: key.currency1,
          fee: key.fee,
          tickSpacing: key.tickSpacing,
          hooks: key.hooks,
        },
      ]
    )
  );
}

/** Build the sorted v4 PoolKey pairing the IP token with the raise token. */
export function buildLaunchpadKey(ipToken: Address): {key: LaunchpadPoolKey; ipIsToken0: boolean} {
  const ip = ipToken.toLowerCase();
  const raise = RAISE_TOKEN_ADDRESS.toLowerCase();
  const ipIsToken0 = ip < raise;
  const [currency0, currency1] = ipIsToken0
    ? [ipToken, RAISE_TOKEN_ADDRESS]
    : [RAISE_TOKEN_ADDRESS, ipToken];
  return {
    key: {
      currency0,
      currency1,
      fee: LAUNCHPAD_FEE,
      tickSpacing: LAUNCHPAD_TICK_SPACING,
      hooks: V1_HOOK_ADDRESS,
    },
    ipIsToken0,
  };
}

/**
 * Split a token supply into the curve / LP / creator allocations.
 *
 * Choosing curveAllocation = 2 × lpAllocation makes the hook's curve-parameter
 * constraints (pFinal·T > H and H ≥ pFinal·T/3) hold for ANY positive hardCap,
 * so the launchpad never reverts with InvalidCurveParams regardless of the raise
 * target the creator picks. The creator keeps the remaining 10%.
 */
export function defaultAllocations(totalSupply: bigint): {
  curveAllocation: bigint;
  lpAllocation: bigint;
  creatorKeep: bigint;
} {
  const curveAllocation = (totalSupply * 60n) / 100n; // 60% on the curve
  const lpAllocation = (totalSupply * 30n) / 100n; // 30% reserved for CLMM (curve = 2 × lp)
  const creatorKeep = totalSupply - curveAllocation - lpAllocation; // 10%
  return {curveAllocation, lpAllocation, creatorKeep};
}

/** Parse a human raise-target (in raise-token units) to wei. Returns 0n on bad input. */
export function parseHardCap(value: string): bigint {
  try {
    return value ? parseEther(value) : 0n;
  } catch {
    return 0n;
  }
}

export enum LaunchpadPhase {
  INACTIVE = 0,
  LAUNCHPAD = 1,
  GRADUATED = 2,
}

/** Decoded shape of VeritasHook.launchpads(poolId). */
export interface LaunchpadConfig {
  phase: LaunchpadPhase;
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
  veritasTreasury: Address;
}

/**
 * Decode the flat 12-value return of VeritasHook.launchpads(poolId) (a public
 * mapping getter over a struct) into a LaunchpadConfig. viem returns multiple
 * outputs as a positional tuple, so index by position.
 */
export function decodeLaunchpads(raw: readonly unknown[] | undefined): LaunchpadConfig | undefined {
  if (!raw || raw.length < 12) return undefined;
  return {
    phase: Number(raw[0]) as LaunchpadPhase,
    migrating: Boolean(raw[1]),
    launchTokenIs0: Boolean(raw[2]),
    curveAllocation: raw[3] as bigint,
    lpAllocation: raw[4] as bigint,
    tokensSold: raw[5] as bigint,
    fundsRaised: raw[6] as bigint,
    hardCap: raw[7] as bigint,
    curveA: raw[8] as bigint,
    curveB: raw[9] as bigint,
    graduationSqrtPriceX96: raw[10] as bigint,
    veritasTreasury: raw[11] as Address,
  };
}

/** Fraction of the hard cap raised so far, 0..1. */
export function raiseProgress(c: Pick<LaunchpadConfig, "fundsRaised" | "hardCap">): number {
  if (c.hardCap === 0n) return 0;
  const pct = Number((c.fundsRaised * 10000n) / c.hardCap) / 10000;
  return Math.min(1, pct);
}

/** A locally-tracked opened launchpad (no indexer needed to rediscover it). */
export interface LaunchpadRecord {
  attestationId: Hex;
  ipToken: Address;
  poolId: Hex;
  raiseToken: Address;
  ipIsToken0: boolean;
  tokenName: string;
  tokenSymbol: string;
  hardCap: string;
  openedAt: number;
}
