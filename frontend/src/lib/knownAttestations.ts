import type {Hex} from "viem";

/**
 * Curated list of real on-chain attestation IDs on Unichain Sepolia (1301).
 * Source of truth: contracts/deployments/seeded-dataset.json. The public RPC
 * caps eth_getLogs at a 10000-block range, so wide scans from block 0 always
 * error; the listing reads these known IDs directly via getRecord instead.
 */
export const KNOWN_ATTESTATION_IDS: Hex[] = [];

/**
 * Attestations whose duplicate-density channel D is autonomously maintained
 * on-chain by the Reactive RSC. Cleared: "living" is now derived purely from
 * on-chain dilutionCount > 0.
 */
const LIVING_IDS = new Set<string>();

export function isKnownLiving(attestationId: string): boolean {
  return LIVING_IDS.has(attestationId.toLowerCase());
}
