import {pipeline, type ImageClassificationPipeline, type RawImage} from "@huggingface/transformers";
import {config} from "../config.js";
import {calibrateAi} from "./calibration.js";

export {calibrateAi};

/**
 * AI-replicability (A) for images. Two independent ONNX classifiers are combined
 * so that SMOGY's known ~30-50% false-positive rate on portraits is dampened:
 *
 *  - SMOGY (primary): bimodal, fires at 0.99+ or near-0. Inverted labels: raw
 *    "human" = AI-generated, "artificial" = real (verified empirically, 2026-06).
 *
 *  - ai-source-detector (confirmation): 5-class (stable_diffusion/midjourney/
 *    dalle/real/other_ai). When a real AI-generated image is uploaded, one of
 *    the AI classes typically dominates (> 0.50). For real photos the distribution
 *    is flat: no single AI class exceeds 0.50. This "dominance" threshold is
 *    used to confirm or dampen SMOGY's signal.
 *
 *  - Deep-Fake-Detector excluded: empirically outputs 0.65-0.73 "Deepfake"
 *    for ALL images tested: no discriminative power, would only add noise.
 *
 * Combination logic (priority order):
 *  1. SMOGY says real (< 0.30)           → A = SMOGY (landscape/scene ≈ 0-3%)
 *  2. SMOGY fires (> 0.75) AND source "real" class > 0.20
 *                                         → "real-portrait" mode, A = SMOGY × 0.15
 *                                           (false-positive dampen for real portraits)
 *  3. SMOGY fires (> 0.75) AND max AI class > 0.45
 *                                         → "consensus-ai", A = average of both
 *  4. SMOGY fires (> 0.75) uncertain     → A = SMOGY × 0.40
 *  5. Middle range                        → weighted blend
 */

const SMOGY_ID = "onnx-community/SMOGY-Ai-images-detector-ONNX";
const SOURCE_ID = "onnx-community/ai-source-detector-ONNX";

export const IMAGE_AI_MODEL_ID = `ensemble(${SMOGY_ID}, ${SOURCE_ID})`;

type Clf = Promise<ImageClassificationPipeline>;
let smogyP: Clf | null = null;
let sourceP: Clf | null = null;

function getSmogy(): Clf {
  if (!smogyP) smogyP = pipeline("image-classification", SMOGY_ID, {dtype: "q8"}) as Clf;
  return smogyP;
}
function getSource(): Clf {
  if (!sourceP) sourceP = pipeline("image-classification", SOURCE_ID, {dtype: "q8"}) as Clf;
  return sourceP;
}

type LabelScore = {label: string; score: number}[];

async function runClassifier(clf: ImageClassificationPipeline, image: RawImage): Promise<LabelScore> {
  const out = await clf(image, {top_k: 5});
  return (Array.isArray(out) ? out : [out]) as LabelScore;
}

/**
 * SMOGY P(AI): raw label "human" = AI (inverted export). Returns calibrated P(AI).
 */
async function smogyScore(image: RawImage): Promise<{pAi: number; raw: string}> {
  const clf = await getSmogy();
  const results = await runClassifier(clf, image);
  const aiRaw = results.find((r) => r.label.toLowerCase() === "human")?.score ?? 0;
  const realRaw = results.find((r) => r.label.toLowerCase() === "artificial")?.score ?? 0;
  if (aiRaw === 0 && realRaw === 0) return {pAi: 0, raw: "unexpected labels"};
  const pAi = calibrateAi(aiRaw, realRaw);
  return {pAi, raw: `smogy_raw=${aiRaw.toFixed(3)}`};
}

/**
 * ai-source-detector: returns max AI class score (SD/MJ/DALL-E/other).
 * For real AI-generated images one class dominates (> 0.50).
 * For real photos the distribution is flat (max < 0.50).
 */
async function sourceScore(image: RawImage): Promise<{maxAiClass: number; realClass: number; raw: string}> {
  const clf = await getSource();
  const results = await runClassifier(clf, image);
  const aiClasses = results.filter((r) => r.label.toLowerCase() !== "real");
  const maxAiClass = Math.max(0, ...aiClasses.map((r) => r.score));
  const realClass = results.find((r) => r.label.toLowerCase() === "real")?.score ?? 0;
  const top = results[0];
  return {maxAiClass, realClass, raw: `source_top=${top?.label}(${top?.score.toFixed(3)}) real=${realClass.toFixed(3)}`};
}

/**
 * Combined A score. SMOGY is the primary signal; ai-source dominance confirms.
 * Capped by imageAiMaxContribution (default 0.9).
 */
export async function imageAiScore(image: RawImage): Promise<{a: number; source: string}> {
  const [sm, src] = await Promise.all([smogyScore(image), sourceScore(image)]);

  const {pAi: smogy} = sm;
  const {maxAiClass, realClass} = src;
  const sourceConfirmsAi = maxAiClass > 0.45;
  const sourceConfirmsReal = realClass > 0.20;

  let raw: number;
  let mode: string;

  if (smogy < 0.30) {
    raw = smogy;
    mode = "real";
  } else if (smogy > 0.75 && sourceConfirmsReal) {
    // SMOGY fires on a real portrait: source confirms it's real, heavy dampen
    raw = smogy * 0.15;
    mode = "real-portrait";
  } else if (smogy > 0.75 && sourceConfirmsAi) {
    // Both detectors agree: AI-generated content
    raw = (smogy + maxAiClass) / 2;
    mode = "consensus-ai";
  } else if (smogy > 0.75) {
    // SMOGY fires, source uncertain: moderate signal
    raw = smogy * 0.40;
    mode = "smogy-uncertain";
  } else {
    raw = smogy * 0.6 + maxAiClass * 0.4;
    mode = "blend";
  }

  const a = Math.min(raw, config.imageAiMaxContribution);
  return {
    a,
    source: `${mode}(smogy=${smogy.toFixed(3)}, src_max=${maxAiClass.toFixed(3)}, src_real=${realClass.toFixed(3)}, raw=${raw.toFixed(3)}, cap=${config.imageAiMaxContribution}) [${sm.raw}, ${src.raw}]`,
  };
}

export async function warmImageAi(image: RawImage): Promise<{label: string; score: number}[]> {
  const clf = await getSmogy();
  const out = await clf(image, {top_k: 5});
  return (Array.isArray(out) ? out : [out]) as {label: string; score: number}[];
}
