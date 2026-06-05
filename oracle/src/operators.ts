import {privateKeyToAccount, type PrivateKeyAccount} from "viem/accounts";
import type {Address, Hex} from "viem";
import {config} from "./config.js";
import type {OperatorSig} from "./types.js";

/**
 * Multi-operator signing for the 2-of-3 quorum.
 *
 * Model (confirmed): operators CO-SIGN a consensus score, but each operator
 * INDEPENDENTLY validates it with its own ensemble before vouching:
 *   - op1 "dinov2"  : the primary/consensus D (DINOv2 mean-pool).
 *   - op2 "clip"    : an independent CLIP embedder; co-signs only if its own D
 *                     estimate agrees with the consensus within AGREEMENT_TOL.
 *   - op3 "dinov2-r": a redundant DINOv2 instance (key resilience); always agrees.
 *
 * Because every co-signer signs the SAME value, the on-chain MAX_SPREAD (5pp)
 * check passes trivially; the real, data-layer independence lives in op2's
 * agreement gate. A is a soft signal: operators co-sign the shared A value.
 *
 * The EIP-712 typed data is identical to the single-signer path
 * (DRSAttestation(bytes32, uint16, uint256), domain "Veritas Oracle"/"1").
 */

export type EnsembleKind = "dinov2" | "clip" | "dinov2-r";

export interface Operator {
  index: number;
  kind: EnsembleKind;
  account: PrivateKeyAccount;
  address: Address;
}

/** Off-chain tolerance for an independent operator to co-sign the consensus D. */
export const AGREEMENT_TOL = 0.15;

const KINDS: EnsembleKind[] = ["dinov2", "clip", "dinov2-r"];

export const operators: Operator[] = config.operatorKeys.map((key, i) => {
  const account = privateKeyToAccount(key);
  return {index: i, kind: KINDS[i] ?? "dinov2-r", account, address: account.address};
});

/** The primary operator whose pipeline defines the consensus score. */
export const primaryOperator = operators[0]!;
export const operatorAddresses = operators.map((o) => o.address);

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

export async function signAs(
  op: Operator,
  attestationId: Hex,
  score: number,
  timestamp: number,
): Promise<OperatorSig> {
  if (!Number.isInteger(score) || score < 0 || score > 0xffff) {
    throw new Error(`score must be a uint16, got ${score}`);
  }
  const signature = await op.account.signTypedData({
    domain,
    types,
    primaryType: "DRSAttestation",
    message: {attestationId, drs: score, timestamp: BigInt(timestamp)},
  });
  return {drs: score, timestamp, signature};
}
