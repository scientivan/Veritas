import type {Address, Hex} from "viem";

/** Content modalities the oracle can score. AUDIO is stubbed (see detectors/audio.ts). */
export type ContentType = "image" | "text" | "audio";

/** One operator's EIP-712-signed opinion, shaped exactly like the on-chain struct
 *  `IVeritasOracle.OperatorSig { uint16 drs; uint64 timestamp; bytes signature; }`.
 *  `drs` carries either the A score or the off-chain D score (scaled 0..10000). */
export interface OperatorSig {
  drs: number;
  timestamp: number;
  signature: Hex;
}

/** Raw risk channels for one piece of content, both on the 0..1 scale. */
export interface RiskBreakdown {
  /** AI replicability P(AI-generated), a soft signal. */
  a: number;
  /** Off-chain duplicate density vs the owned corpus. */
  d: number;
  /** noisy-OR of (d, a); what the LP fee is calibrated against. */
  drs: number;
  /** Whether DRS is above the protocol gate (0.85) - pool creation would be rejected. */
  gated: boolean;
  /** How A was derived (model id or "stub"). */
  aSource: string;
  /** Nearest corpus matches that drove D (for explainability in the UI). */
  matches: CorpusMatch[];
}

export interface CorpusMatch {
  id: string;
  label: string;
  similarity: number;
}

/** Everything the frontend needs to submit `registry.attest{value}(...)`. */
export interface AttestResponse {
  attestationId: Hex;
  pHash: Hex;
  blockHash: Hex;
  ipfsCid: string;
  owner: Address;
  contentType: ContentType;
  /** Signatures over the A score. */
  aiSigs: OperatorSig[];
  /** Signatures over the off-chain D score. */
  dSigs: OperatorSig[];
  /** Human-readable risk numbers (0..1) for display; the on-chain truth is in the sigs. */
  risk: RiskBreakdown;
  /** Echoes the primary operator the service signed as. */
  operator: Address;
  /** Which operators co-signed, and whether each independent ensemble agreed on D. */
  quorum: {
    operators: {address: Address; ensemble: string; agreesOnD: boolean; independentD: number | null}[];
    dSigners: number;
    aSigners: number;
  };
}
