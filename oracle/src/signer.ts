import {privateKeyToAccount} from "viem/accounts";
import type {Address, Hex} from "viem";
import {config} from "./config.js";
import type {OperatorSig} from "./types.js";

/**
 * EIP-712 signer for DRS attestations.
 *
 * The on-chain `VeritasOracle` verifies signatures over the typed struct
 *   DRSAttestation(bytes32 attestationId, uint16 drs, uint256 timestamp)
 * under the domain ("Veritas Oracle", "1", chainId, oracleAddress).
 *
 * The live oracle runs quorum=1 with a single operator (the deployer), so this
 * service signs with that one key. The shape generalizes to N operators: run N
 * instances with different keys (and ideally different detector ensembles) and
 * concatenate their OperatorSigs.
 */

const account = privateKeyToAccount(config.operatorKey);

export const operatorAddress: Address = account.address;

const domain = {
  name: "Veritas Oracle",
  version: "1",
  chainId: config.chainId,
  verifyingContract: config.oracleAddress,
} as const;

const types = {
  DRSAttestation: [
    {name: "attestationId", type: "bytes32"},
    {name: "drs", type: "uint16"},
    {name: "timestamp", type: "uint256"},
  ],
} as const;

/**
 * Produce one operator signature over a score for an attestation.
 * @param score 0..10000 (already scaled and clamped to maxScore).
 * @param timestamp Unix seconds; defaults to now. Must be within the oracle's
 *   10-minute freshness window when the tx lands.
 */
export async function signScore(
  attestationId: Hex,
  score: number,
  timestamp: number = Math.floor(Date.now() / 1000),
): Promise<OperatorSig> {
  if (!Number.isInteger(score) || score < 0 || score > 0xffff) {
    throw new Error(`score must be a uint16 (0..65535), got ${score}`);
  }
  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: "DRSAttestation",
    message: {
      attestationId,
      drs: score,
      timestamp: BigInt(timestamp),
    },
  });
  return {drs: score, timestamp, signature};
}
