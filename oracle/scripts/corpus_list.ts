import {nearbyImages} from '../src/corpus.js';
import {config} from '../src/config.js';
import {RawImage} from '@huggingface/transformers';
import {embedImage} from '../src/detectors/embed.js';

// Just query the corpus for all stored IDs - can't do that directly, 
// so let's use the analyze endpoint and check what it tells us about picsum 99
import {imageD} from '../src/corpus.js';

// Test picsum 99
const img = await RawImage.read(new Blob([Buffer.from(await (await fetch('https://picsum.photos/id/99/320/320')).arrayBuffer())]));
const emb = await embedImage(img);
const {d, matches} = await imageD(emb);
console.log('picsum 99 D:', d);
matches.slice(0, 5).forEach((m: any) => console.log(`  sim=${m.similarity.toFixed(4)} | ${m.label}`));
process.exit(0);
