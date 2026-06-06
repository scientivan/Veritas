import type {Hex} from "viem";

/**
 * Curated list of real on-chain attestation IDs on Unichain Sepolia (1301).
 * Source of truth: contracts/deployments/seeded-dataset.json. The public RPC
 * caps eth_getLogs at a 10000-block range, so wide scans from block 0 always
 * error; the listing reads these known IDs directly via getRecord instead.
 */
export const KNOWN_ATTESTATION_IDS: Hex[] = [
  "0xf87daf94ea2f9f4f5ffaa5950abd1dd285b9ff75b1b4d72c42409cea7e40d109",
  "0xeca8861a2533832cfd036228c91a9a8271944ea6c2df9d84f00c75373117a1c3",
  "0xfe31192bd6a23aee0a3b90e4458e638d3e0a0d8bbf3bfd0afe559635a1f45ce6",
  "0x627552c29a1413b8d10d928241b3514902f2abfe3d49c838c4093fc9b8c2832a",
  "0x7d07e4ea40a445aed2fafb3ebe7559f9a003f691b8e754a1a3a531b04cc5e0a6",
  "0x0547799fc51ee53cdf6f3e1499c062b6cb1c62634865bf881552c90836a9721c",
  "0x2d17ad992673a898c202f7b624e30646299e2899155ab2b5897b48efa5e35d3f",
];

/**
 * Attestations whose duplicate-density channel D is autonomously maintained
 * on-chain by the Reactive RSC (the two living-D ids). Used to mark "living"
 * even when dilutionCount has not yet propagated to the read.
 */
const LIVING_IDS = new Set(
  [
    "0x7d07e4ea40a445aed2fafb3ebe7559f9a003f691b8e754a1a3a531b04cc5e0a6",
    "0x0547799fc51ee53cdf6f3e1499c062b6cb1c62634865bf881552c90836a9721c",
  ].map((s) => s.toLowerCase())
);

export function isKnownLiving(attestationId: string): boolean {
  return LIVING_IDS.has(attestationId.toLowerCase());
}
