import {pipeline, type TextClassificationPipeline} from "@huggingface/transformers";

/**
 * AI-replicability (A) for text: P(text is AI/LLM-generated). RoBERTa detector,
 * pre-converted to ONNX so it runs natively in Node (no Python sidecar).
 *
 * Honest caveat baked into the protocol: A is a SOFT, calibrated signal, never a
 * hard verdict. In-distribution accuracy is high but degrades on the newest
 * generators, so A only nudges the DRS - the on-chain D floor bounds abuse.
 */

const MODEL_ID = "onnx-community/chatgpt-detector-roberta-ONNX";

let clfPromise: Promise<TextClassificationPipeline> | null = null;

function getClassifier(): Promise<TextClassificationPipeline> {
  if (!clfPromise) {
    clfPromise = pipeline("text-classification", MODEL_ID, {dtype: "q8"}) as Promise<TextClassificationPipeline>;
  }
  return clfPromise;
}

const AI_LABELS = new Set(["chatgpt", "fake", "ai", "label_1", "machine", "generated"]);

/** Returns P(AI-generated) in [0,1] and the model id used. */
export async function textAiScore(text: string): Promise<{a: number; source: string}> {
  const clean = text.trim();
  if (clean.length < 16) return {a: 0, source: `${MODEL_ID} (too-short→0)`};
  const clf = await getClassifier();
  const out = (await clf(clean, {top_k: 5})) as {label: string; score: number}[];
  const results = Array.isArray(out) ? out : [out];
  let pAi = 0;
  for (const r of results) {
    if (AI_LABELS.has(r.label.toLowerCase())) pAi = Math.max(pAi, r.score);
  }
  return {a: pAi, source: MODEL_ID};
}

export async function warmTextAi(): Promise<string[]> {
  const clf = await getClassifier();
  const out = (await clf("The quick brown fox jumps over the lazy dog repeatedly.", {top_k: 5})) as {
    label: string;
    score: number;
  }[];
  return (Array.isArray(out) ? out : [out]).map((r) => `${r.label}:${r.score.toFixed(3)}`);
}

export const TEXT_AI_MODEL_ID = MODEL_ID;
