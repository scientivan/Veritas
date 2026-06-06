/**
 * Empirically characterize the image-A (SMOGY) detector on real photographs to
 * quantify the over-fire. Prints the full label scores so we can design a
 * calibration. tsx scripts/characterize-imageai.ts
 */
import {decodeImage} from "../src/fingerprint.js";
import {warmImageAi} from "../src/detectors/imageAi.js";

const IDS = [1003, 1015, 1025, 1043, 1062, 100, 200, 237, 433, 870];

async function main() {
  console.log("id     P(AI)=human   P(real)=artificial   margin");
  for (const id of IDS) {
    try {
      const url = `https://picsum.photos/id/${id}/384/384`;
      const bytes = Buffer.from(await (await fetch(url, {headers: {"User-Agent": "Mozilla/5.0"}})).arrayBuffer());
      const img = await decodeImage(bytes);
      const out = await warmImageAi(img);
      const get = (l: string) => out.find((r) => r.label.toLowerCase() === l)?.score ?? 0;
      const ai = get("human");
      const real = get("artificial");
      console.log(`${String(id).padEnd(6)} ${ai.toFixed(3).padEnd(12)} ${real.toFixed(3).padEnd(20)} ${(ai - real).toFixed(3)}`);
    } catch (e) {
      console.log(`${id}: error ${e instanceof Error ? e.message : e}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
