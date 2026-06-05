import {pipeline, env, type ImageFeatureExtractionPipeline, type RawImage} from "@huggingface/transformers";
import {resolve} from "node:path";
import {ROOT} from "../config.js";

/**
 * CLIP image embedder - the INDEPENDENT second ensemble for operator 2.
 *
 * Operator 1 measures duplicate density with DINOv2; operator 2 measures it with
 * CLIP (a different architecture and training objective). When the two independent
 * embedders agree on D within tolerance, operator 2 co-signs the consensus score -
 * that agreement is the real, data-layer independence behind the 2-of-3 quorum.
 *
 * CLIP-ViT-B/16 (MIT). The image-feature-extraction pipeline returns the projected,
 * pooled image embedding (512-dim) directly, so we only L2-normalize.
 */

env.cacheDir = resolve(ROOT, ".models");

const MODEL_ID = "Xenova/clip-vit-base-patch16";
export const CLIP_DIM = 512;

let extractorPromise: Promise<ImageFeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<ImageFeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("image-feature-extraction", MODEL_ID, {
      dtype: "q8",
    }) as Promise<ImageFeatureExtractionPipeline>;
  }
  return extractorPromise;
}

export async function embedClip(image: RawImage): Promise<Float32Array> {
  const extractor = await getExtractor();
  const out = await extractor(image);
  const data = out.data as Float32Array;
  const dims = out.dims as number[];
  const H = dims[dims.length - 1]!;
  // CLIP returns a single pooled vector [1, H]; if a token sequence sneaks through, mean-pool it.
  const T = data.length / H;
  const vec = new Float32Array(H);
  for (let t = 0; t < T; t++) for (let h = 0; h < H; h++) vec[h]! += data[t * H + h]!;
  let norm = 0;
  for (let h = 0; h < H; h++) {
    vec[h]! /= T;
    norm += vec[h]! * vec[h]!;
  }
  norm = Math.sqrt(norm) || 1;
  for (let h = 0; h < H; h++) vec[h]! /= norm;
  return vec;
}

export async function warmClip(): Promise<number> {
  const {RawImage} = await import("@huggingface/transformers");
  const probe = new RawImage(new Uint8Array(3 * 8 * 8).fill(128), 8, 8, 3);
  return (await embedClip(probe)).length;
}

export const CLIP_MODEL_ID = MODEL_ID;
