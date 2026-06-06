import {pipeline, type ImageClassificationPipeline, type RawImage} from "@huggingface/transformers";
import {config} from "../config.js";
import {calibrateAi} from "./calibration.js";

export {calibrateAi};

/**
 * AI-replicability (A) for images. SMOGY-Ai-images-detector, ONNX export curated
 * for transformers.js - runs natively in Node, no Python sidecar.
 *
 * IMPORTANT (verified empirically, 2026-06): this ONNX export ships an INVERTED
 * id2label. Across 6 controlled samples (3 real photos, 3 StyleGAN faces) the
 * raw label "artificial" fired ~1.0 on REAL photos and "human" fired ~1.0 on AI
 * images - i.e. the two class names are swapped relative to training. We correct
 * for it here: P(AI-generated) = score(raw label "human"). The mapping is pinned
 * and asserted so a future re-export that fixes the labels is caught loudly.
 *
 * OVER-FIRE CALIBRATION (measured 2026-06 over 10 real photos): the detector is
 * bimodal and overconfident - ~30% of genuine photos were flagged AI at ~1.0
 * (ids 100, 433, 1025). Confident-wrong outputs cannot be removed by post-hoc
 * calibration of a single model (the real fix is an ensemble), but temperature
 * scaling (`calibrateAi`) corrects the overconfidence on borderline cases and
 * lets operators dial down a single unreliable detector's influence. A stays a
 * SOFT signal regardless: it only nudges DRS via noisy-OR, and the trustless
 * on-chain D floor bounds how far any single signal can move the fee.
 */

const MODEL_ID = "onnx-community/SMOGY-Ai-images-detector-ONNX";
// Raw model label whose score (due to the inverted export) is the true P(AI).
const AI_RAW_LABEL = "human";
const REAL_RAW_LABEL = "artificial";

let clfPromise: Promise<ImageClassificationPipeline> | null = null;

function getClassifier(): Promise<ImageClassificationPipeline> {
  if (!clfPromise) {
    clfPromise = pipeline("image-classification", MODEL_ID, {dtype: "q8"}) as Promise<ImageClassificationPipeline>;
  }
  return clfPromise;
}

/** Returns P(AI-generated) in [0,1] and the model id used. */
export async function imageAiScore(image: RawImage): Promise<{a: number; source: string}> {
  const clf = await getClassifier();
  const out = (await clf(image, {top_k: 5})) as {label: string; score: number}[];
  const results = Array.isArray(out) ? out : [out];

  const labels = new Set(results.map((r) => r.label.toLowerCase()));
  if (!labels.has(AI_RAW_LABEL) || !labels.has(REAL_RAW_LABEL)) {
    // The export's label set changed - refuse to guess, degrade to neutral.
    return {a: 0, source: `${MODEL_ID} (unexpected labels: ${[...labels].join("/")})`};
  }
  const aiRaw = results.find((r) => r.label.toLowerCase() === AI_RAW_LABEL)?.score ?? 0;
  const realRaw = results.find((r) => r.label.toLowerCase() === REAL_RAW_LABEL)?.score ?? 0;
  // Temperature-calibrate, then cap: a single unreliable detector cannot gate alone.
  const a = Math.min(calibrateAi(aiRaw, realRaw), config.imageAiMaxContribution);
  return {a, source: `${MODEL_ID} (T=${config.imageAiTemperature}, capped ${config.imageAiMaxContribution})`};
}

export async function warmImageAi(image: RawImage): Promise<{label: string; score: number}[]> {
  const clf = await getClassifier();
  const out = (await clf(image, {top_k: 5})) as {label: string; score: number}[];
  return Array.isArray(out) ? out : [out];
}

export const IMAGE_AI_MODEL_ID = MODEL_ID;
