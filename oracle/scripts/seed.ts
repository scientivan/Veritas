/**
 * Seed the owned corpus with reference images so the off-chain D signal is real
 * from the first upload. There is no free internet-scale reverse-image search,
 * so Veritas measures duplicate density against THIS growing corpus.
 *
 * We seed:
 *   - a spread of distinct photos (the "already-attested" world), and
 *   - a near-duplicate cluster (same photo at several sizes/blurs) so that
 *     uploading that image - or a variant - produces a high, believable D.
 *
 *   npm run seed
 */
import {RawImage} from "@huggingface/transformers";
import {writeFileSync, mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {ROOT} from "../src/config.js";
import {embedImage} from "../src/detectors/embedder.js";
import {embedClip} from "../src/detectors/clip.js";
import {addImageSample, addClipSample, imageCount, clipCount} from "../src/corpus.js";

async function fetchImage(url: string): Promise<RawImage> {
  const res = await fetch(url, {headers: {"User-Agent": "Mozilla/5.0"}});
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return RawImage.read(new Blob([Buffer.from(await res.arrayBuffer())]));
}

// Distinct reference photos (picsum stable ids) - the "world" of attested content.
const DISTINCT: {id: string; label: string}[] = [
  {id: "10", label: "ref: forest canopy"},
  {id: "1003", label: "ref: mountain lake"},
  {id: "1015", label: "ref: river valley"},
  {id: "1025", label: "ref: pug portrait"},
  {id: "1043", label: "ref: city dusk"},
  {id: "1062", label: "ref: golden retriever"},
  {id: "200", label: "ref: misty hills"},
  {id: "433", label: "ref: cow field"},
];

// One image seeded as a near-duplicate cluster: an upload of it (or a variant)
// should score a high D. This is the protocol's "common / heavily-copied" asset.
const CLUSTER = {id: "237", label: "viral: black puppy"};

async function main() {
  const manifest: {sampleId: string; label: string}[] = [];

  for (const {id, label} of DISTINCT) {
    const img = await fetchImage(`https://picsum.photos/id/${id}/320/320`);
    const [emb, clip] = await Promise.all([embedImage(img), embedClip(img)]);
    const sampleId = `seed:photo:${id}`;
    addImageSample(sampleId, label, emb);
    addClipSample(sampleId, label, clip);
    manifest.push({sampleId, label});
    console.log("  +", sampleId, label);
  }

  // Near-dup cluster: several renderings of the same source image.
  const variants = ["320/320", "256/256", "300/300?blur=1", "320/320?grayscale"];
  for (let i = 0; i < variants.length; i++) {
    const img = await fetchImage(`https://picsum.photos/id/${CLUSTER.id}/${variants[i]}`);
    const [emb, clip] = await Promise.all([embedImage(img), embedClip(img)]);
    const sampleId = `seed:cluster:${CLUSTER.id}:${i}`;
    addImageSample(sampleId, `${CLUSTER.label} (variant ${i})`, emb);
    addClipSample(sampleId, `${CLUSTER.label} (variant ${i})`, clip);
    manifest.push({sampleId, label: CLUSTER.label});
    console.log("  +", sampleId);
  }

  mkdirSync(resolve(ROOT, "data"), {recursive: true});
  writeFileSync(resolve(ROOT, "data", "seed-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\n✅ Corpus seeded. image_corpus: ${imageCount()} rows, clip_corpus: ${clipCount()} rows`);
  console.log(`   Cluster source for a high-D demo: https://picsum.photos/id/${CLUSTER.id}/512/512`);
}

main().catch((e) => {
  console.error("❌ seed failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
