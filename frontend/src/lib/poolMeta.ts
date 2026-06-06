/**
 * Human-readable titles for the seeded on-chain attestations. The registry only
 * stores an ipfsCid, so the listing would otherwise show "ipfs://veritas..." for
 * every row. We map the known seeded ids to clear names, and fall back to
 * prettifying the ipfs path or a short id for anything else.
 */
const TITLES: Record<string, string> = {
  "0xf87daf94ea2f9f4f5ffaa5950abd1dd285b9ff75b1b4d72c42409cea7e40d109": "Demo · Unique Photo",
  "0xeca8861a2533832cfd036228c91a9a8271944ea6c2df9d84f00c75373117a1c3": "River Canyon",
  "0xfe31192bd6a23aee0a3b90e4458e638d3e0a0d8bbf3bfd0afe559635a1f45ce6": "Mountain Ridge",
  "0x627552c29a1413b8d10d928241b3514902f2abfe3d49c838c4093fc9b8c2832a": "AI-Generated Sample",
  "0x7d07e4ea40a445aed2fafb3ebe7559f9a003f691b8e754a1a3a531b04cc5e0a6": "Living-D · Original",
  "0x0547799fc51ee53cdf6f3e1499c062b6cb1c62634865bf881552c90836a9721c": "Living-D · Near-copy",
  "0x2d17ad992673a898c202f7b624e30646299e2899155ab2b5897b48efa5e35d3f": "Studio Dog",
  "0x64e1d0819681e2b7820138e89bceeb333a3b10a9d87286bd857fcb8b9cb0f3e6": "Pinned Sample (IPFS)",
};

/**
 * Real thumbnail for each seeded attestation, so the listing shows the actual
 * attested image instead of a color swatch. The picsum photos are the real
 * content that was fingerprinted; the IPFS one resolves to its pinned bytes.
 * The two living-D rows deliberately share one image: they are near-duplicates.
 */
const IMAGES: Record<string, string> = {
  "0xf87daf94ea2f9f4f5ffaa5950abd1dd285b9ff75b1b4d72c42409cea7e40d109": "https://picsum.photos/id/99/120/120",
  "0xeca8861a2533832cfd036228c91a9a8271944ea6c2df9d84f00c75373117a1c3": "https://picsum.photos/id/1015/120/120",
  "0xfe31192bd6a23aee0a3b90e4458e638d3e0a0d8bbf3bfd0afe559635a1f45ce6": "https://picsum.photos/id/1003/120/120",
  "0x627552c29a1413b8d10d928241b3514902f2abfe3d49c838c4093fc9b8c2832a": "https://picsum.photos/seed/veritas-ai-sample/120/120",
  "0x7d07e4ea40a445aed2fafb3ebe7559f9a003f691b8e754a1a3a531b04cc5e0a6": "https://picsum.photos/seed/veritas-living-d-demo/120/120",
  "0x0547799fc51ee53cdf6f3e1499c062b6cb1c62634865bf881552c90836a9721c": "https://picsum.photos/seed/veritas-living-d-demo/120/120",
  "0x2d17ad992673a898c202f7b624e30646299e2899155ab2b5897b48efa5e35d3f": "https://picsum.photos/id/1025/120/120",
  "0x64e1d0819681e2b7820138e89bceeb333a3b10a9d87286bd857fcb8b9cb0f3e6":
    "https://gateway.pinata.cloud/ipfs/bafkreiabfq4phlewg4ncqulxatpszuq5qy35sywobt5yu3btbgivzdznny",
};

export function poolImage(attestationId: string): string | null {
  return IMAGES[attestationId.toLowerCase()] ?? null;
}

function prettifyCid(ipfsCid: string): string | null {
  // "ipfs://veritas/mountain-ridge" -> "Mountain Ridge"; skip bare CIDs.
  const tail = ipfsCid.replace(/^ipfs:\/\//, "").split("/").pop() ?? "";
  if (!tail || /^bafy|^bafk|^qm/i.test(tail)) return null;
  const words = tail.replace(/[-_]+/g, " ").trim();
  if (!words) return null;
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
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
