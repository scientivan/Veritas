import type {Address} from "viem";
import {HOOK_ADDRESS} from "./contracts";
import type {LivePool} from "./livePools";

/**
 * Swap helpers for collector buy/sell. Trades execute through the deployed
 * PoolSwapTest router (V1_SWAP_ROUTER_ADDRESS), which is hook-agnostic: it locks
 * the PoolManager and calls swap() in the unlock callback, so it works against
 * the v2 dynamic-fee pools just as well as the v1 bonding-curve pools.
 *
 * Token model (see livePools.ts): token0 = the attested IP asset, token1 = the
 * ETH-equivalent. So buying the IP token spends token1 (oneForZero, zeroForOne =
 * false); selling it returns token1 (zeroForOne = true).
 */

const Q96 = 2n ** 96n;

/** v4 sqrt-price bounds. Used as the (effectively unbounded) swap price limit. */
export const MIN_SQRT_PRICE = 4295128739n;
export const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;

/** Uniswap v4 dynamic-fee flag (0x800000); the pools were initialized with it. */
const DYNAMIC_FEE_FLAG = 0x800000;
const TICK_SPACING = 60;

export const POOL_SWAP_TEST_ABI = [
  {
    type: "function",
    name: "swap",
    stateMutability: "payable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          {name: "currency0", type: "address"},
          {name: "currency1", type: "address"},
          {name: "fee", type: "uint24"},
          {name: "tickSpacing", type: "int24"},
          {name: "hooks", type: "address"},
        ],
      },
      {
        name: "params",
        type: "tuple",
        components: [
          {name: "zeroForOne", type: "bool"},
          {name: "amountSpecified", type: "int256"},
          {name: "sqrtPriceLimitX96", type: "uint160"},
        ],
      },
      {
        name: "testSettings",
        type: "tuple",
        components: [
          {name: "takeClaims", type: "bool"},
          {name: "settleUsingBurn", type: "bool"},
        ],
      },
      {name: "hookData", type: "bytes"},
    ],
    outputs: [{name: "delta", type: "int256"}],
  },
] as const;

export type SwapKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

export function buildSwapKey(pool: LivePool): SwapKey {
  return {
    currency0: pool.token0,
    currency1: pool.token1,
    fee: DYNAMIC_FEE_FLAG,
    tickSpacing: TICK_SPACING,
    hooks: HOOK_ADDRESS,
  };
}

/**
 * Build SwapParams for an exact-input swap.
 * @param buy true = buy the IP token (token1 -> token0); false = sell it.
 * @param amountIn exact input amount (1e18). v4 uses a negative amountSpecified
 *   to mean "exact input".
 */
export function buildSwapParams(buy: boolean, amountIn: bigint) {
  const zeroForOne = !buy; // selling token0 (IP) is zeroForOne; buying is oneForZero
  return {
    zeroForOne,
    amountSpecified: -amountIn, // negative => exact input
    sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE + 1n : MAX_SQRT_PRICE - 1n,
  };
}

/** PoolSwapTest settings: move real ERC-20s (no ERC-6909 claims, no burn). */
export const SWAP_TEST_SETTINGS = {takeClaims: false, settleUsingBurn: false} as const;

/**
 * Price of 1 token0 (IP asset) expressed in token1 (ETH-equivalent), derived from
 * the Q96 sqrt price: price1per0 = (sqrtPriceX96 / 2^96)^2.
 */
export function priceToken1PerToken0(sqrtPriceX96: bigint): number {
  if (sqrtPriceX96 <= 0n) return 0;
  const sqrtP = Number(sqrtPriceX96) / Number(Q96);
  return sqrtP * sqrtP;
}
