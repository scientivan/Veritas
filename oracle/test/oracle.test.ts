import {test} from "node:test";
import assert from "node:assert/strict";
import {RawImage} from "@huggingface/transformers";
import {keccak256, toBytes, recoverTypedDataAddress} from "viem";
import {pHash, blockHash} from "../src/fingerprint.js";
import {combineDrs, duplicateDensity, toScore16, clamp01} from "../src/drs.js";
import {computeAttestationId} from "../src/attestation.js";
import {rawCidV1} from "../src/ipfs.js";
import {operators, primaryOperator, signAs} from "../src/operators.js";
import {config} from "../src/config.js";

// These tests are fast and offline: no model downloads, no chain, no DB writes.
// Model/chain behaviour is covered by the integration scripts (smoke, verify-quorum).

function texture(seed: number, noise = 0): RawImage {
  const w = 192;
  const h = 192;
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      let v =
        128 +
        50 * Math.sin(x / 25 + seed) +
        40 * Math.sin(y / 18 + seed * 0.5) +
        30 * Math.sin((x + y) / 30 + seed);
      if (noise) v += ((x * 7 + y * 13) % noise) - noise / 2;
      const c = Math.max(0, Math.min(255, v));
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
    }
  return new RawImage(data, w, h, 3);
}

function hamming(a: string, b: string): number {
  let x = BigInt(a) ^ BigInt(b);
  let c = 0;
  while (x > 0n) {
    c += Number(x & 1n);
    x >>= 1n;
  }
  return c;
}

test("pHash/blockhash separate near-duplicates from distinct images", async () => {
  const A = texture(1);
  const Anear = texture(1, 24); // same content + compression-like noise
  const B = texture(6.3); // different content
  const [pa, pan, pb] = [await pHash(A), await pHash(Anear), await pHash(B)];
  const [ba, ban, bb] = [await blockHash(A), await blockHash(Anear), await blockHash(B)];
  assert.ok(hamming(pa, pan) < 12, `near-dup pHash should be close, got ${hamming(pa, pan)}`);
  assert.ok(hamming(pa, pb) > hamming(pa, pan), "distinct pHash should be farther than near-dup");
  assert.ok(hamming(ba, ban) < hamming(ba, bb), "blockhash near-dup closer than distinct");
});

test("noisy-OR combineDrs is monotonic and bounded", () => {
  assert.equal(combineDrs(0, 0), 0);
  assert.equal(Math.round(combineDrs(1, 0) * 1000), 1000);
  assert.equal(Math.round(combineDrs(0, 1) * 1000), 1000);
  // 1-(1-.5)(1-.5)=.75
  assert.equal(Math.round(combineDrs(0.5, 0.5) * 1000), 750);
  assert.ok(combineDrs(0.6, 0.2) > combineDrs(0.5, 0.2), "monotonic in D");
});

test("duplicateDensity ignores sub-threshold matches and saturates", () => {
  assert.equal(duplicateDensity([0.1, 0.2, 0.3]), 0, "all below default 0.55 threshold -> 0");
  assert.ok(duplicateDensity([0.95, 0.95, 0.95]) > 0.7, "several strong matches -> high D");
  // CLIP-space threshold (0.88) ignores CLIP's denser 'distinct' similarities (~0.72)
  assert.equal(duplicateDensity([0.72, 0.7], 0.88), 0);
  assert.ok(duplicateDensity([0.96, 0.96], 0.88) > 0.4);
});

test("toScore16 scales to 0..10000 and caps at maxScore", () => {
  assert.equal(toScore16(0), 0);
  assert.equal(toScore16(0.34), 3400);
  assert.equal(toScore16(1), config.maxScore, "A=1 capped at maxScore (9500)");
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
});

test("computeAttestationId matches the contract encoding (keccak(abi.encode(pHash,blockHash,owner)))", () => {
  const pHashV = keccak256(toBytes("veritas-demo-phash"));
  const blockHashV = keccak256(toBytes("veritas-demo-blockhash"));
  const owner = "0x490a2F2fE7fB40003585333D5df3C4588f33F11f" as const;
  // Pinned value proven equal to the on-chain computeAttestationId in verify-signing.ts.
  assert.equal(
    computeAttestationId(pHashV, blockHashV, owner),
    "0x887f8f5945798e3b1fa2cf46fed46fb2300aa6e4218b0a9cb95a8ba655db3bc5",
  );
});

test("rawCidV1 is a deterministic, valid CIDv1 (bafkrei… raw+sha256)", () => {
  const a = rawCidV1(Buffer.from("hello veritas"));
  const b = rawCidV1(Buffer.from("hello veritas"));
  assert.equal(a, b, "deterministic");
  assert.match(a, /^bafkrei[a-z2-7]+$/, "CIDv1 raw+sha256 base32 form");
  assert.notEqual(a, rawCidV1(Buffer.from("different")));
});

test("operator EIP-712 signatures recover to the signing operator address", async () => {
  const attestationId = computeAttestationId(
    keccak256(toBytes("p")),
    keccak256(toBytes("b")),
    primaryOperator.address,
  );
  const ts = 1780600000;
  for (const op of operators) {
    const sig = await signAs(op, attestationId, 4242, ts);
    const recovered = await recoverTypedDataAddress({
      domain: {name: "Veritas Oracle", version: "1", chainId: config.chainId, verifyingContract: config.oracleAddress},
      types: {
        DRSAttestation: [
          {name: "attestationId", type: "bytes32"},
          {name: "drs", type: "uint16"},
          {name: "timestamp", type: "uint256"},
        ],
      },
      primaryType: "DRSAttestation",
      message: {attestationId, drs: 4242, timestamp: BigInt(ts)},
      signature: sig.signature,
    });
    assert.equal(recovered.toLowerCase(), op.address.toLowerCase(), `op ${op.kind} sig recovers`);
  }
});
