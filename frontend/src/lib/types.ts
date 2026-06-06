/** Risk tier derived from the Dilution Risk Score. */
export type RiskTier = "low" | "elevated" | "high";

/** Launchpad pool lifecycle phase (mirrors v1 VeritasHook.Phase). */
export type LaunchpadPhase = "INACTIVE" | "LAUNCHPAD" | "GRADUATED";

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

  /** Present when this pool has a linked v1 bonding-curve launchpad. */
  launchpad?: LaunchpadInfo;
}

/** Bonding-curve launchpad data linked to a Pool. */
export interface LaunchpadInfo {
  /** v1 VeritasHook pool ID (bytes32). */
  poolId: `0x${string}`;
  /** ERC-20 IP token address. */
  ipToken: `0x${string}`;
  /** Raise token address (e.g. USDC). */
  raiseToken: `0x${string}`;
  /** Current lifecycle phase. */
  phase: LaunchpadPhase;
  /** Funds raised so far (in raiseToken units, 6 decimals for USDC). */
  fundsRaised: bigint;
  /** Graduation hard cap (same units as fundsRaised). */
  hardCap: bigint;
  /** Cumulative IP tokens sold on the curve. */
  tokensSold: bigint;
  /** Total IP tokens allocated to the curve. */
  curveAllocation: bigint;
  /** Pending royalties (in IP token units). */
  pendingRoyalties?: bigint;
}

/** A registered IP token owned by the connected creator. */
export interface CreatorIPToken {
  /** ERC-20 IP token address. */
  tokenAddress: `0x${string}`;
  /** Human-readable token name. */
  name: string;
  /** Token symbol. */
  symbol: string;
  /** Attestation ID in v2 VeritasRegistry. */
  attestationId: `0x${string}`;
  /** DRS score at time of registration (0..10000). */
  drsAtRegistration: number;
  /** Live DRS (may have changed since registration). */
  liveDRS?: number;
  /** IPFS metadata URI. */
  tokenURI: string;
  /** Linked launchpad pool, if one was initialized. */
  launchpad?: LaunchpadInfo;
}
