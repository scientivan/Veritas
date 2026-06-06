import {MIN_SQRT_PRICE, MAX_SQRT_PRICE} from "./swap";

/**
 * Bonding-curve helpers for trading a launchpad pool (v1 VeritasHook).
 *
 * During the LAUNCHPAD phase swaps are routed through the quadratic curve
 * P(S) = a·S² + b (buy-only). After graduation the pool is a normal CLMM and
 * both directions work. Buys are exact-input: pay the raise token, get the IP
 * token. Direction depends on which currency the IP token sorted into.
 */

const E36 = 10n ** 36n;

/**
 * Current curve price in raise-token units per 1 IP token.
 * Mirrors the contract: scaledPrice = b + a·S²/1e36 (1e18 scale); human = /1e18.
 */
export function curvePrice(curveA: bigint, curveB: bigint, tokensSold: bigint): number {
  const scaled = curveB + (curveA * tokensSold * tokensSold) / E36;
  return Number(scaled) / 1e18;
}

/**
 * SwapParams for a curve/CLMM trade. Buy = pay the raise token, receive IP.
 * The IP token is currency0 when ipIsToken0, else currency1; the raise token is
 * the other. Paying the raise token therefore means:
 *   ipIsToken0  -> raise is currency1 -> zeroForOne = false (one-for-zero)
 *   !ipIsToken0 -> raise is currency0 -> zeroForOne = true
 */
export function buildCurveSwapParams(ipIsToken0: boolean, side: "buy" | "sell", amountIn: bigint) {
  const buyZeroForOne = !ipIsToken0;
  const zeroForOne = side === "buy" ? buyZeroForOne : !buyZeroForOne;
  return {
    zeroForOne,
    amountSpecified: -amountIn, // negative => exact input
    sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE + 1n : MAX_SQRT_PRICE - 1n,
  };
}

/** Estimated IP tokens out for a raise-token input, at the current marginal curve price. */
export function estimateTokensOut(raiseIn: number, price: number): number {
  if (price <= 0) return 0;
  // 0.15% protocol fee is taken on the curve before pricing.
  return (raiseIn * 0.9985) / price;
}
