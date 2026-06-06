/**
 * Diagnose whether the oracle computes D and A correctly. Runs the full analyze()
 * pipeline on several fresh, unique images and prints the D channel (corpus
 * duplicate density), the A channel (raw SMOGY scores + calibrated), and the
 * combined DRS, so we can see exactly which channel drives a high score.
 *
 *   tsx scripts/diag-oracle.ts
 */
import {decodeImage} from "../src/fingerprint.js";
import {analyze} from "../src/pipeline.js";
import {warmImageAi} from "../src/detectors/imageAi.js";
import {imageCount, clipCount} from "../src/corpus.js";

const URLS = [
  "https://picsum.photos/id/1062/400/400",
  "https://picsum.photos/id/200/400/400",
  "https://picsum.photos/id/1025/400/400",
  "https://picsum.photos/id/433/400/400",
  "https://picsum.photos/seed/veritas-fresh-xyz/400/400",
];

const pct = (x: number) => (x * 100).toFixed(1) + "%";

async function main() {
  console.log(`corpus size: images=${imageCount()} clip=${clipCount()}\n`);
  for (const url of URLS) {
    const bytes = Buffer.from(await (await fetch(url, {headers: {"User-Agent": "Mozilla/5.0"}})).arrayBuffer());
    const img = await decodeImage(bytes);
    const raw = await warmImageAi(img);
    const get = (l: string) => raw.find((r) => r.label.toLowerCase() === l)?.score ?? 0;
    const a = await analyze({type: "image", bytes});
    console.log(url.split("/").slice(-2).join("/"));
    console.log(
      `  D (corpus dup)   = ${pct(a.risk.d)}   matches=${a.risk.matches?.length ?? 0}`
    );
    console.log(
      `  A (calibrated)   = ${pct(a.risk.a)}   [raw SMOGY: human(=P_AI)=${get("human").toFixed(3)} artificial=${get("artificial").toFixed(3)}]`
    );
    console.log(`  DRS = noisyOR(D,A) = ${pct(a.risk.drs)}   gated=${a.risk.gated}   source=${a.risk.aSource}\n`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
