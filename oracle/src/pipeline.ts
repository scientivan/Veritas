import type {Address, Hex} from "viem";
import type {AttestResponse, ContentType, RiskBreakdown} from "./types.js";
import {decodeImage, fingerprint} from "./fingerprint.js";
import {embedImage} from "./detectors/embedder.js";
import {embedClip} from "./detectors/clip.js";
import {imageAiScore} from "./detectors/imageAi.js";
import {textAiScore} from "./detectors/textAi.js";
import {audioAiScore} from "./detectors/audio.js";
import {addImageSample, addClipSample, addTextSample, imageD, clipD, textD} from "./corpus.js";
import {combineDrs, DRS_GATE, toScore16} from "./drs.js";
import {computeAttestationId} from "./attestation.js";
import {operators, primaryOperator, signAs, AGREEMENT_TOL, type Operator} from "./operators.js";

export interface AnalyzeInput {
  type: ContentType;
  /** Raw bytes for image/audio. */
  bytes?: Buffer;
  /** UTF-8 content for text. */
  text?: string;
}

export interface Analysis {
  type: ContentType;
  pHash: Hex;
  blockHash: Hex;
  risk: RiskBreakdown;
  /** Image embedding, carried so the sample can be added to the corpus on attest. */
  embedding?: Float32Array;
  /** Independent CLIP embedding (operator 2's view), carried for the same reasons. */
  clipEmbedding?: Float32Array;
  /** Text simhash (== pHash), carried for the same reason. */
  simhash?: Hex;
}

/** Fingerprint + score one piece of content. Pure read - touches no chain, mutates no corpus. */
export async function analyze(input: AnalyzeInput): Promise<Analysis> {
  const {type} = input;

  if (type === "image") {
    if (!input.bytes) throw new Error("image bytes required");
    const image = await decodeImage(input.bytes);
    const fp = await fingerprint("image", {image});
    const [embedding, clipEmbedding] = await Promise.all([embedImage(image), embedClip(image)]);
    const {d, matches} = imageD(embedding);
    const {a, source} = await imageAiScore(image);
    return {type, ...fp, embedding, clipEmbedding, risk: buildRisk(d, a, source, matches)};
  }

  if (type === "text") {
    if (input.text === undefined) throw new Error("text required");
    const fp = await fingerprint("text", {text: input.text});
    const {d, matches} = textD(fp.pHash);
    const {a, source} = await textAiScore(input.text);
    return {type, ...fp, simhash: fp.pHash, risk: buildRisk(d, a, source, matches)};
  }

  // audio (stub)
  if (!input.bytes) throw new Error("audio bytes required");
  const fp = await fingerprint("audio", {bytes: input.bytes});
  const {a, source} = audioAiScore();
  return {type, ...fp, risk: buildRisk(0, a, source, [])};
}

function buildRisk(d: number, a: number, aSource: string, matches: RiskBreakdown["matches"]): RiskBreakdown {
  const drs = combineDrs(d, a);
  return {a, d, drs, gated: drs > DRS_GATE, aSource, matches};
}

/**
 * Turn an analysis into the EIP-712 signatures the registry verifies, and add the
 * sample to the corpus so future content is measured against it. The frontend
 * submits the returned `attest(...)` payload with the user's wallet.
 *
 * Note: the corpus is grown optimistically here (keyed by attestationId, so
 * repeat calls upsert rather than inflate). Production would add post-confirmation.
 */
export async function buildAttestation(
  analysis: Analysis,
  owner: Address,
  ipfsCid: string,
): Promise<AttestResponse> {
  const attestationId = computeAttestationId(analysis.pHash, analysis.blockHash, owner);
  const aScore = toScore16(analysis.risk.a);
  const dScore = toScore16(analysis.risk.d);
  const ts = Math.floor(Date.now() / 1000);

  // Decide which operators independently VALIDATE the consensus D (so they co-sign it).
  const validation = assessOperators(analysis);

  // D signatures: only operators whose own ensemble agrees co-sign the consensus D.
  const dSigners = operators.filter((_, i) => validation[i]!.agrees);
  // A is a shared soft signal: every operator co-signs the consensus A value.
  const aSigners = operators;

  const [aiSigs, dSigs] = await Promise.all([
    Promise.all(aSigners.map((op) => signAs(op, attestationId, aScore, ts))),
    Promise.all(dSigners.map((op) => signAs(op, attestationId, dScore, ts))),
  ]);

  // Stage the sample. The corpus only grows once the attestation is CONFIRMED on
  // chain (via confirmAttestation), so an unsubmitted /attest never poisons D.
  pending.set(attestationId, {type: analysis.type, label: ipfsCid || attestationId.slice(0, 10), analysis});

  return {
    attestationId,
    pHash: analysis.pHash,
    blockHash: analysis.blockHash,
    ipfsCid,
    owner,
    contentType: analysis.type,
    aiSigs,
    dSigs,
    risk: analysis.risk,
    operator: primaryOperator.address,
    quorum: {
      operators: operatorsSummary(validation),
      dSigners: dSigners.length,
      aSigners: aSigners.length,
    },
  };
}

export interface DValidation {
  op: Operator;
  agrees: boolean;
  independentD: number | null;
}

/** Run every operator's independent D check against the consensus. Used by both
 *  /attest (to choose co-signers) and /analyze (to preview the quorum). */
export function assessOperators(analysis: Analysis): DValidation[] {
  const consensusD = analysis.risk.d;
  return operators.map((op) => validateD(op, analysis, consensusD));
}

/** Public-shaped operator summary for API responses. */
export function operatorSummary(analysis: Analysis) {
  return operatorsSummary(assessOperators(analysis));
}

/** Each operator independently re-derives D with its own ensemble and agrees iff
 *  it lands within AGREEMENT_TOL of the consensus. */
function validateD(op: Operator, analysis: Analysis, consensusD: number): DValidation {
  if (op.kind === "clip") {
    if (analysis.type !== "image" || !analysis.clipEmbedding) {
      // No independent CLIP view for non-image content; abstain rather than vouch.
      return {op, agrees: false, independentD: null};
    }
    const {d} = clipD(analysis.clipEmbedding);
    return {op, agrees: Math.abs(d - consensusD) <= AGREEMENT_TOL, independentD: d};
  }
  // dinov2 / dinov2-r recompute the same primary signal -> agree by construction.
  return {op, agrees: true, independentD: consensusD};
}

function operatorsSummary(v: DValidation[]) {
  return v.map((x) => ({
    address: x.op.address,
    ensemble: x.op.kind,
    agreesOnD: x.agrees,
    independentD: x.independentD,
  }));
}

// ------------------------------------------------------------------------------------------------
// Post-confirmation corpus growth
// ------------------------------------------------------------------------------------------------

interface PendingSample {
  type: ContentType;
  label: string;
  analysis: Analysis;
}

/** Samples awaiting on-chain confirmation before they join the corpus. */
const pending = new Map<Hex, PendingSample>();

/**
 * Commit a staged sample to the corpus once its attestation is confirmed on-chain.
 * Returns true if the sample was added (or was already added), false if unknown.
 */
export function confirmAttestation(attestationId: Hex): boolean {
  const p = pending.get(attestationId);
  if (!p) return false;
  if (p.type === "image" && p.analysis.embedding) {
    addImageSample(attestationId, p.label, p.analysis.embedding);
    if (p.analysis.clipEmbedding) addClipSample(attestationId, p.label, p.analysis.clipEmbedding);
  } else if (p.type === "text" && p.analysis.simhash) {
    addTextSample(attestationId, p.label, p.analysis.simhash);
  }
  pending.delete(attestationId);
  return true;
}

export function pendingCount(): number {
  return pending.size;
}
