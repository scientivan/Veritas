import type {Hex} from "viem";

/**
 * Curated list of real on-chain attestation IDs on Unichain Sepolia (1301).
 * Source of truth: contracts/deployments/seeded-dataset.json. The public RPC
 * caps eth_getLogs at a 10000-block range, so wide scans from block 0 always
 * error; the listing reads these known IDs directly via getRecord instead.
 */
export const KNOWN_ATTESTATION_IDS: Hex[] = [
  // Active ETH-ratio pools (tokenA = attested asset, tokenB = ETH equivalent)
  "0x40e6a7dc19b5b6314b6084ff13db1475e0ac3c9859fb884b969e2ab861a1a4b9",
  "0x1105152961f82de0774f53cf7164180584a12d4e7449a3f9bf636d285dac881c",
  "0x2cd1bffbf7ffca4bf7827d1c9d6722bd02080dd3e852e37bfc63beeb6ca5900e",
  "0x224e1cadba8dfbee555ead7d55e5a5b76e0e638b07fbda93a4d8c98979d5fecf",
  // Graduated demo launchpad pool (seeded to 1000 USDC hardcap)
  "0x1f6ba29ac32a2ea5cc6ef5fd21ea4de3bac982651faa18961f6cdee366da4ab0",
  // Gated attestations: demonstrate the protocol blocking high-risk content
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
