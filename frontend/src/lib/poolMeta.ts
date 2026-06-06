/**
 * Human-readable titles for the seeded on-chain attestations. The registry only
 * stores an ipfsCid, so the listing would otherwise show "ipfs://veritas..." for
 * every row. We map the known seeded ids to clear names, and fall back to
 * prettifying the ipfs path or a short id for anything else.
 */
const TITLES: Record<string, string> = {
  // Active ETH-ratio pools
  "0x40e6a7dc19b5b6314b6084ff13db1475e0ac3c9859fb884b969e2ab861a1a4b9": "Portrait",
  "0x1105152961f82de0774f53cf7164180584a12d4e7449a3f9bf636d285dac881c": "Forest Scene",
  "0x2cd1bffbf7ffca4bf7827d1c9d6722bd02080dd3e852e37bfc63beeb6ca5900e": "Urban Shot",
  "0x224e1cadba8dfbee555ead7d55e5a5b76e0e638b07fbda93a4d8c98979d5fecf": "Landscape",
  // Gated
  "0x627552c29a1413b8d10d928241b3514902f2abfe3d49c838c4093fc9b8c2832a": "AI-Generated Sample",
  "0x7d07e4ea40a445aed2fafb3ebe7559f9a003f691b8e754a1a3a531b04cc5e0a6": "Living-D · Original",
  "0x0547799fc51ee53cdf6f3e1499c062b6cb1c62634865bf881552c90836a9721c": "Living-D · Near-copy",
  "0x2d17ad992673a898c202f7b624e30646299e2899155ab2b5897b48efa5e35d3f": "Studio Dog",
};

/**
 * Real thumbnail for each seeded attestation, so the listing shows the actual
 * attested image instead of a color swatch. The picsum photos are the real
 * content that was fingerprinted; the IPFS one resolves to its pinned bytes.
 * The two living-D rows deliberately share one image: they are near-duplicates.
 */
const IMAGES: Record<string, string> = {
  // Active ETH-ratio pools
  "0x40e6a7dc19b5b6314b6084ff13db1475e0ac3c9859fb884b969e2ab861a1a4b9": "https://picsum.photos/id/175/120/120",
  "0x1105152961f82de0774f53cf7164180584a12d4e7449a3f9bf636d285dac881c": "https://picsum.photos/id/395/120/120",
  "0x2cd1bffbf7ffca4bf7827d1c9d6722bd02080dd3e852e37bfc63beeb6ca5900e": "https://picsum.photos/id/870/120/120",
  "0x224e1cadba8dfbee555ead7d55e5a5b76e0e638b07fbda93a4d8c98979d5fecf": "https://picsum.photos/id/982/120/120",
  // Gated
  "0x627552c29a1413b8d10d928241b3514902f2abfe3d49c838c4093fc9b8c2832a": "https://picsum.photos/seed/veritas-ai-sample/120/120",
  "0x7d07e4ea40a445aed2fafb3ebe7559f9a003f691b8e754a1a3a531b04cc5e0a6": "https://picsum.photos/seed/veritas-living-d-demo/120/120",
  "0x0547799fc51ee53cdf6f3e1499c062b6cb1c62634865bf881552c90836a9721c": "https://picsum.photos/seed/veritas-living-d-demo/120/120",
  "0x2d17ad992673a898c202f7b624e30646299e2899155ab2b5897b48efa5e35d3f": "https://picsum.photos/id/1025/120/120",
};

export function poolImage(attestationId: string): string | null {
  return IMAGES[attestationId.toLowerCase()] ?? null;
}

function prettifyCid(ipfsCid: string): string | null {
  // "ipfs://veritas/mountain-ridge" -> "Mountain Ridge"; skip bare CIDs.
  const tail = ipfsCid.replace(/^ipfs:\/\//, "").split("/").pop() ?? "";
  if (!tail || /^bafy|^bafk|^qm/i.test(tail)) return null;
  // Strip "eth-pool-" prefix added by pool-creation scripts.
  const cleaned = tail.replace(/^eth-pool-/, "").replace(/[-_]+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function poolTitle(attestationId: string, ipfsCid: string): string {
  const known = TITLES[attestationId.toLowerCase()];
  if (known) return known;
  return prettifyCid(ipfsCid) ?? `Attestation ${attestationId.slice(0, 8)}…`;
}

/** Assumed USD value of one testnet pool token (no market price exists on testnet). */
export const ASSUMED_TOKEN_PRICE_USD = 1;

/**
 * Illustrative annual turnover (pool volume / TVL) used to derive a labelled APY
 * estimate from the live DRS-calibrated fee. Testnet has no real volume, so this
 * is an explicit assumption surfaced as "est." in the UI, never presented as real.
 */
export const ASSUMED_ANNUAL_TURNOVER = 52;
