/** Risk tier derived from the Dilution Risk Score. */
export type RiskTier = "low" | "elevated" | "high";

/** A content attestation + its pool, as the UI consumes it. Scores are 0..1. */
export interface Pool {
  id: string;
  /** Content title. */
  title: string;
  /** Short content medium label, e.g. "Illustration", "Photograph", "AI image". */
  medium: string;
  creator: string;
  creatorAddress: `0x${string}`;
  /** A solid color used as the mock content swatch (no external images in mock mode). */
  swatch: string;

  /** Dilution Risk Score, 0..1. */
  drs: number;
  /** Duplicate-density component D, 0..1 (maintained on-chain via Reactive when `living`). */
  d: number;
  /** AI-replicability component A, 0..1 (set once by the oracle at attestation). */
  a: number;

  /** Base LP fee, hundredths of a bip (3000 = 0.30%). */
  baseFeeBps: number;
  /** Max LP fee cap, hundredths of a bip. */
  maxFeeBps: number;
  /** True when DRS exceeds the protocol gate and the pool is blocked. */
  gated: boolean;

  /** USD TVL (assumed $1/token, testnet). null when no pool exists. */
  tvlUsd: number | null;
  /** APY. null when not applicable (no meaningful APY on testnet). */
  apyPct: number | null;
  /** Near-duplicates detected on-chain. */
  duplicateCount: number;
  /** True when D is autonomously maintained on-chain by the Reactive RSC. */
  living: boolean;

  ipfsCid: string;
  pHash: `0x${string}`;
  attestedAt: number;
}
