import {parseEther, zeroHash, type Address} from "viem";
import {HOOK_ADDRESS} from "./contracts";
import type {LivePool} from "./livePools";

/** Minimal PoolManager ABI for reading pool state. */
export const POOL_MANAGER_ABI_SLICE = [
  {
    name: "getSlot0",
    type: "function",
    stateMutability: "view",
    inputs: [{name: "id", type: "bytes32"}],
    outputs: [
      {name: "sqrtPriceX96", type: "uint160"},
      {name: "tick", type: "int24"},
      {name: "protocolFee", type: "uint24"},
      {name: "lpFee", type: "uint24"},
    ],
  },
] as const;

/** Uniswap v4 dynamic-fee flag (0x800000); the pool was initialized with it. */
const DYNAMIC_FEE_FLAG = 0x800000;
const TICK_SPACING = 60;
// Full-range position (usable tick bounds for tickSpacing 60).
export const TICK_LOWER = -887220;
export const TICK_UPPER = 887220;

/** Demo sizes: mint plenty (positions can be one-sided at the live price), provide/
 * remove a round unit of liquidity. Approvals use max so allowance never limits. */
export const MINT_AMOUNT = parseEther("10000");
export const LIQUIDITY_UNIT = parseEther("1");
export const MAX_UINT256 = (2n ** 256n - 1n) as bigint;

export const TEST_ERC20_ABI = [
  {type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{name: "to", type: "address"}, {name: "amount", type: "uint256"}], outputs: []},
  {type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{name: "spender", type: "address"}, {name: "amount", type: "uint256"}], outputs: [{type: "bool"}]},
  {type: "function", name: "balanceOf", stateMutability: "view", inputs: [{name: "account", type: "address"}], outputs: [{type: "uint256"}]},
  {type: "function", name: "allowance", stateMutability: "view", inputs: [{name: "owner", type: "address"}, {name: "spender", type: "address"}], outputs: [{type: "uint256"}]},
] as const;

export const ROUTER_ABI = [
  {
    type: "function",
    name: "modifyLiquidity",
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
          {name: "tickLower", type: "int24"},
          {name: "tickUpper", type: "int24"},
          {name: "liquidityDelta", type: "int256"},
          {name: "salt", type: "bytes32"},
        ],
      },
      {name: "hookData", type: "bytes"},
    ],
    outputs: [{name: "delta", type: "int256"}],
  },
] as const;

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

export function buildPoolKey(pool: LivePool): PoolKey {
  return {
    currency0: pool.token0,
    currency1: pool.token1,
    fee: pool.poolFee ?? DYNAMIC_FEE_FLAG,
    tickSpacing: TICK_SPACING,
    hooks: pool.hooksAddress ?? HOOK_ADDRESS,
  };
}

export function liquidityParams(delta: bigint) {
  return {tickLower: TICK_LOWER, tickUpper: TICK_UPPER, liquidityDelta: delta, salt: zeroHash};
}

const Q96 = 2n ** 96n;

/**
 * Convert a token0 input amount to a full-range liquidity delta.
 * Derived from x*y=k: for a full-range position, L = amount0 * sqrtPrice.
 * sqrtPriceX96 is the Q96-encoded sqrt price from PoolManager.getSlot0.
 * Falls back to 1:1 (sqrtPriceX96 = 2^96) when price is not yet loaded.
 */
export function computeLiquidityDelta(amount0: bigint, sqrtPriceX96: bigint): bigint {
  const sqrtP = sqrtPriceX96 > 0n ? sqrtPriceX96 : Q96;
  return (amount0 * sqrtP) / Q96;
}

/** Estimate the token1 counterpart for a given token0 amount at current price (display only). */
export function estimateToken1(amount0: number, sqrtPriceX96: bigint): number {
  const sqrtP = Number(sqrtPriceX96) / Number(Q96);
  return amount0 * sqrtP * sqrtP;
}
