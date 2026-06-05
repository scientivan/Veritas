import {pipeline, env, RawImage, type ImageFeatureExtractionPipeline} from "@huggingface/transformers";
import {resolve} from "node:path";
import {ROOT} from "../config.js";

/**
 * Semantic image embedder for duplicate detection. DINOv2-with-registers is
 * robust to crop/rotation/recompression, which is exactly the dilution vector
 * pHash is blind to. Quantized (q8) to keep the download/footprint small.
 *
 * Embeddings are the robustness layer behind the cheap pHash pre-filter: D is
 * computed from cosine similarity against the owned corpus, not the open web.
 */

env.cacheDir = resolve(ROOT, ".models"); // keep model weights local to the package
env.allowLocalModels = true;

const MODEL_ID = "onnx-community/dinov2-with-registers-base";

let extractorPromise: Promise<ImageFeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<ImageFeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("image-feature-extraction", MODEL_ID, {
      dtype: "q8",
    }) as Promise<ImageFeatureExtractionPipeline>;
  }
  return extractorPromise;
}

/** Hidden size of DINOv2-base; the dimension of a pooled embedding. */
export const EMBED_DIM = 768;

/** L2-normalized embedding vector for an image (cosine == dot product).
 *  The image-feature-extraction pipeline returns the full token sequence
 *  [1, T, H]; we mean-pool over the T tokens, then L2-normalize. */
export async function embedImage(image: RawImage): Promise<Float32Array> {
  const extractor = await getExtractor();
  const out = await extractor(image);
  return meanPoolNormalize(out.data as Float32Array, out.dims as number[]);
}

function meanPoolNormalize(data: Float32Array, dims: number[]): Float32Array {
  // dims is [1, T, H] (batch 1).
  const H = dims[dims.length - 1]!;
  const T = dims[dims.length - 2]!;
  const vec = new Float32Array(H);
  for (let t = 0; t < T; t++) {
    const base = t * H;
    for (let h = 0; h < H; h++) vec[h]! += data[base + h]!;
  }
  let norm = 0;
  for (let h = 0; h < H; h++) {
    vec[h]! /= T;
    norm += vec[h]! * vec[h]!;
  }
  norm = Math.sqrt(norm) || 1;
  for (let h = 0; h < H; h++) vec[h]! /= norm;
  return vec;
}

export async function warmEmbedder(): Promise<number> {
  const extractor = await getExtractor();
  // Embed a small probe to report the pooled dimension and force the download.
  const probe = new RawImage(new Uint8Array(3 * 8 * 8).fill(128), 8, 8, 3);
  const out = await extractor(probe);
  return meanPoolNormalize(out.data as Float32Array, out.dims as number[]).length;
}

export const EMBED_MODEL_ID = MODEL_ID;
