import type {RiskTier} from "./types";

/** Protocol DRS gate: above this, pool creation is rejected (0.85). */
export const DRS_GATE = 0.85;
/** Default fee bounds, hundredths of a bip. */
export const BASE_FEE_BPS = 3000; // 0.30%
export const MAX_FEE_BPS = 10000; // 1.00%

/** Map a DRS (0..1) to a coarse risk tier. */
export function tierForDrs(drs: number): RiskTier {
  if (drs >= 0.7) return "high";
  if (drs >= 0.3) return "elevated";
  return "low";
}

/** noisy-OR combination of the two risk channels: DRS = 1 - (1-D)(1-A). */
export function combineDrs(d: number, a: number): number {
  return 1 - (1 - d) * (1 - a);
}

/** DRS-calibrated dynamic LP fee, hundredths of a bip: base + (max-base)*DRS. */
export function dynamicFeeBps(drs: number, base = BASE_FEE_BPS, max = MAX_FEE_BPS): number {
  return Math.round(base + (max - base) * drs);
}

/** Static presentation metadata per tier. Color is a CSS var token; never used alone. */
export const TIER_META: Record<
  RiskTier,
  {label: string; token: string; cssVar: string; description: string}
> = {
  low: {
    label: "Low",
    token: "risk-low",
    cssVar: "var(--risk-low)",
    description: "Unique provenance. Open at a low fee.",
  },
  elevated: {
    label: "Elevated",
    token: "risk-mid",
    cssVar: "var(--risk-mid)",
    description: "Some duplication or AI likeness. Open at a higher fee.",
  },
  high: {
    label: "High",
    token: "risk-high",
    cssVar: "var(--risk-high)",
    description: "Heavily diluted or AI-replicated. Pool creation gated.",
  },
};
