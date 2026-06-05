import {RawImage} from "@huggingface/transformers";
import {keccak256, toHex, type Hex} from "viem";
import type {ContentType} from "./types.js";

/**
 * Perceptual fingerprints. The registry stores two bytes32 per attestation:
 *   - pHashFingerprint  : DCT perceptual hash (robust to mild edits/compression)
 *   - blockhashFingerprint : mean-block hash (a cheap, independent second view)
 * On-chain `getNearDuplicates` runs a Hamming-distance scan over both. We pack
 * each 64-bit hash big-endian into the high 8 bytes of a bytes32, zero-padded -
 * one fixed convention the whole system shares.
 */

function pack64ToBytes32(bits: bigint): Hex {
  // bits is a 64-bit value; place it in the top 8 bytes of a 32-byte word.
  const word = bits << 192n;
  return toHex(word, {size: 32});
}

/** Decode arbitrary image bytes into a RawImage (uses transformers.js' bundled sharp). */
export async function decodeImage(buffer: Buffer | Uint8Array): Promise<RawImage> {
  const blob = new Blob([buffer]);
  return RawImage.read(blob);
}

/** DCT-II perceptual hash (32×32 → top 8×8 low-frequency block → 64 bits). */
export async function pHash(image: RawImage): Promise<Hex> {
  const SIZE = 32;
  const gray = image.clone().grayscale();
  const small = await gray.resize(SIZE, SIZE);
  const px = small.data; // length SIZE*SIZE, channels=1

  // 2D DCT-II via separable 1D passes.
  const rows = new Float64Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let u = 0; u < SIZE; u++) {
      let sum = 0;
      for (let x = 0; x < SIZE; x++) {
        sum += (px[y * SIZE + x] as number) * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIZE));
      }
      rows[y * SIZE + u] = sum * (u === 0 ? Math.SQRT1_2 : 1);
    }
  }
  const dct = new Float64Array(SIZE * SIZE);
  for (let u = 0; u < SIZE; u++) {
    for (let v = 0; v < SIZE; v++) {
      let sum = 0;
      for (let y = 0; y < SIZE; y++) {
        sum += rows[y * SIZE + u]! * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * SIZE));
      }
      dct[v * SIZE + u] = sum * (v === 0 ? Math.SQRT1_2 : 1);
    }
  }

  // Low-frequency 8×8 block, excluding the DC term (0,0) from the median.
  const block: number[] = [];
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) block.push(dct[v * SIZE + u] as number);
  const ac = block.slice(1).sort((a, b) => a - b);
  const median = (ac[Math.floor(ac.length / 2) - 1]! + ac[Math.floor(ac.length / 2)]!) / 2;

  let bits = 0n;
  for (let i = 0; i < 64; i++) {
    bits = (bits << 1n) | (block[i]! > median ? 1n : 0n);
  }
  return pack64ToBytes32(bits);
}

/** Mean-block hash (blockhash.io style): 8×8 blocks vs the global median. */
export async function blockHash(image: RawImage): Promise<Hex> {
  const SIZE = 8;
  const gray = image.clone().grayscale();
  const small = await gray.resize(SIZE, SIZE);
  const px = small.data;
  const vals = Array.from({length: 64}, (_, i) => px[i] as number);
  const sorted = [...vals].sort((a, b) => a - b);
  const median = (sorted[31]! + sorted[32]!) / 2;
  let bits = 0n;
  for (let i = 0; i < 64; i++) bits = (bits << 1n) | (vals[i]! > median ? 1n : 0n);
  return pack64ToBytes32(bits);
}

/**
 * Non-visual content has no perceptual hash, but the registry still needs two
 * bytes32 fingerprints. For text/audio we derive deterministic ones:
 *   - pHash      : 64-bit SimHash over token shingles (near-dup-sensitive)
 *   - blockHash  : keccak of the normalized bytes (exact-dup commitment)
 */
export function textFingerprints(text: string): {pHash: Hex; blockHash: Hex} {
  const norm = text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return {pHash: simHash64(norm), blockHash: keccak256(toHex(norm))};
}

export function bytesFingerprints(buffer: Buffer | Uint8Array): {pHash: Hex; blockHash: Hex} {
  const hex = toHex(buffer);
  // Fold keccak into 64 bits for the pHash slot; full keccak for blockHash.
  const k = BigInt(keccak256(hex));
  return {pHash: pack64ToBytes32(k & 0xffffffffffffffffn), blockHash: keccak256(hex)};
}

/** 64-bit SimHash over 4-gram word shingles. */
function simHash64(text: string): Hex {
  const words = text.split(" ").filter(Boolean);
  const shingles = words.length < 4 ? words : words.map((_, i) => words.slice(i, i + 4).join(" ")).slice(0, words.length - 3);
  const acc = new Array<number>(64).fill(0);
  for (const sh of shingles.length ? shingles : [text]) {
    const h = BigInt(keccak256(toHex(sh))) & 0xffffffffffffffffn;
    for (let b = 0; b < 64; b++) acc[b]! += (h >> BigInt(63 - b)) & 1n ? 1 : -1;
  }
  let bits = 0n;
  for (let b = 0; b < 64; b++) bits = (bits << 1n) | (acc[b]! > 0 ? 1n : 0n);
  return pack64ToBytes32(bits);
}

/** Convenience: fingerprints for any content type. */
export async function fingerprint(
  type: ContentType,
  payload: {image?: RawImage; text?: string; bytes?: Buffer | Uint8Array},
): Promise<{pHash: Hex; blockHash: Hex}> {
  if (type === "image") {
    if (!payload.image) throw new Error("image payload required");
    const [p, b] = await Promise.all([pHash(payload.image), blockHash(payload.image)]);
    return {pHash: p, blockHash: b};
  }
  if (type === "text") {
    if (payload.text === undefined) throw new Error("text payload required");
    return textFingerprints(payload.text);
  }
  if (!payload.bytes) throw new Error("bytes payload required for audio");
  return bytesFingerprints(payload.bytes);
}
