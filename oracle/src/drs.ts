import {config} from "./config.js";

/** Protocol DRS gate: above this (0.85) pool creation is rejected on-chain. */
export const DRS_GATE = 0.85;
export const BASE_FEE_BPS = 3000; // 0.30%
export const MAX_FEE_BPS = 10000; // 1.00%

/** noisy-OR combination of the two risk channels: DRS = 1 - (1-D)(1-A). */
export function combineDrs(d: number, a: number): number {
  return 1 - (1 - clamp01(d)) * (1 - clamp01(a));
}

/** Duplicate density from a set of corpus similarities: D = 1 - exp(-λ·Σ sim^β).
 *  Similarities below the threshold are ignored (not near-duplicates). The threshold
 *  is per-embedder: DINOv2 space is well-spread (~0.55), CLIP space is denser (~0.88). */
export function duplicateDensity(similarities: number[], threshold = config.simThreshold): number {
  const acc = similarities
    .filter((s) => s >= threshold)
    .reduce((sum, s) => sum + Math.pow(clamp01(s), config.beta), 0);
  return 1 - Math.exp(-config.lambdaD * acc);
}

/** DRS-calibrated dynamic LP fee, hundredths of a bip: base + (max-base)·DRS. */
export function dynamicFeeBps(drs: number, base = BASE_FEE_BPS, max = MAX_FEE_BPS): number {
  return Math.round(base + (max - base) * clamp01(drs));
}

/** Convert a 0..1 score to the on-chain uint16 scale (0..10000), clamped to maxScore. */
export function toScore16(value: number): number {
  const scaled = Math.round(clamp01(value) * 10000);
  return Math.min(scaled, config.maxScore);
}

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
