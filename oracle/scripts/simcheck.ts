import {decodeImage} from "../src/fingerprint.js";
import {embedImage} from "../src/detectors/embedder.js";
import {nearestImages} from "../src/corpus.js";

function norm(a: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * a[i]!;
  return Math.sqrt(s);
}
function cos(a: Float32Array, b: Float32Array) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i]! * b[i]!;
  return d / (norm(a) * norm(b));
}
async function emb(url: string) {
  const bytes = Buffer.from(await (await fetch(url, {headers: {"User-Agent": "M"}})).arrayBuffer());
  return embedImage(await decodeImage(bytes));
}
async function main() {
  const e1 = await emb("https://picsum.photos/id/1062/400/400");
  const e2 = await emb("https://picsum.photos/id/200/400/400");
  const e3 = await emb("https://picsum.photos/seed/totally-different-zzz/400/400");
  console.log("dim:", e1.length, "norms:", norm(e1).toFixed(3), norm(e2).toFixed(3));
  console.log("cosine 1062 vs 200 (unrelated):", cos(e1, e2).toFixed(4));
  console.log("cosine 1062 vs fresh-zzz (unrelated):", cos(e1, e3).toFixed(4));
  console.log("top corpus matches for id 1062:");
  for (const m of nearestImages(e1, 5)) console.log("   ", m.label, "sim=", m.similarity.toFixed(4));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
