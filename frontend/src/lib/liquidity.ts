import {parseEther, zeroHash, type Address} from "viem";
import {HOOK_ADDRESS} from "./contracts";
import type {LivePool} from "./livePools";

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
    fee: DYNAMIC_FEE_FLAG,
    tickSpacing: TICK_SPACING,
    hooks: HOOK_ADDRESS,
  };
}

export function liquidityParams(delta: bigint) {
  return {tickLower: TICK_LOWER, tickUpper: TICK_UPPER, liquidityDelta: delta, salt: zeroHash};
}
