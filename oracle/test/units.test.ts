import {test} from "node:test";
import assert from "node:assert/strict";
import {keccak256, toBytes} from "viem";
import {calibrateAi} from "../src/detectors/calibration.js";
import {dynamicFeeBps, duplicateDensity, combineDrs, BASE_FEE_BPS, MAX_FEE_BPS} from "../src/drs.js";
import {textFingerprints} from "../src/fingerprint.js";
import {signAs, primaryOperator} from "../src/operators.js";

// Fast, offline units: no model downloads, no chain, no DB.

function hamming(a: string, b: string): number {
  let x = BigInt(a) ^ BigInt(b);
  let c = 0;
  while (x > 0n) {
    c += Number(x & 1n);
    x >>= 1n;
  }
  return c;
}

test("calibrateAi (#5 over-fire calibration): identity at T=1, softens at T>1", () => {
  // T=1 returns P(AI) renormalized over the two classes (~identity for a clean softmax).
  assert.ok(Math.abs(calibrateAi(0.95, 0.05, 1) - 0.95) < 1e-6, "T=1 is near-identity");
  // T>1 pulls an overconfident score toward 0.5 (but keeps it on the AI side).
  const soft = calibrateAi(0.996, 0.004, 3);
  assert.ok(soft < 0.996 && soft > 0.5, `T=3 softens 0.996 downward, got ${soft}`);
  // Neutral input stays neutral at any temperature.
  assert.ok(Math.abs(calibrateAi(0.5, 0.5, 2) - 0.5) < 1e-9, "0.5 is a fixed point");
});

test("calibrateAi is monotonic in P(AI) and bounded in (0,1)", () => {
  const lo = calibrateAi(0.3, 0.7, 1.5);
  const mid = calibrateAi(0.6, 0.4, 1.5);
  const hi = calibrateAi(0.9, 0.1, 1.5);
  assert.ok(lo < mid && mid < hi, "monotonic in P(AI)");
  for (const v of [lo, mid, hi, calibrateAi(1, 0, 1.5), calibrateAi(0, 1, 1.5)]) {
    assert.ok(v > 0 && v < 1, `bounded strictly in (0,1), got ${v}`);
  }
});

test("dynamicFeeBps spans base..max linearly in DRS", () => {
  assert.equal(dynamicFeeBps(0), BASE_FEE_BPS, "DRS 0 -> base fee");
  assert.equal(dynamicFeeBps(1), MAX_FEE_BPS, "DRS 1 -> max fee");
  assert.equal(dynamicFeeBps(0.5), Math.round((BASE_FEE_BPS + MAX_FEE_BPS) / 2), "DRS 0.5 -> midpoint");
  assert.ok(dynamicFeeBps(0.7) > dynamicFeeBps(0.3), "monotonic in DRS");
});

test("duplicateDensity rises with more near-duplicates and saturates below 1", () => {
  const one = duplicateDensity([0.9]);
  const many = duplicateDensity([0.9, 0.9, 0.9, 0.9]);
  assert.ok(many > one, "more matches -> higher D");
  assert.ok(many < 1, "saturates strictly below 1");
  assert.equal(duplicateDensity([]), 0, "no matches -> 0");
});

test("combineDrs is symmetric and clamps its inputs", () => {
  assert.equal(combineDrs(0.4, 0.6), combineDrs(0.6, 0.4));
  assert.equal(combineDrs(-1, 0.5), combineDrs(0, 0.5), "negative D clamps to 0");
  assert.equal(combineDrs(2, 0), 1, "D>1 clamps to 1 -> DRS 1");
});

test("textFingerprints: near-duplicate text stays close, distinct text is far, exact dup commits equal", () => {
  const a = textFingerprints("The quick brown fox jumps over the lazy dog, again and again.");
  const aNear = textFingerprints("The quick brown fox jumps over the lazy dog, again and again!");
  const b = textFingerprints("Completely unrelated sentence about oceans, tides, and the moon.");
  assert.ok(hamming(a.pHash, aNear.pHash) < hamming(a.pHash, b.pHash), "near-dup simhash closer than distinct");
  const exact = textFingerprints("The quick brown fox jumps over the lazy dog, again and again.");
  assert.equal(a.blockHash, exact.blockHash, "exact dup -> identical commitment blockHash");
  assert.equal(a.pHash, exact.pHash, "exact dup -> identical simhash");
});

test("signAs rejects scores outside the uint16 range", async () => {
  const id = keccak256(toBytes("units-test"));
  await assert.rejects(() => signAs(primaryOperator, id, 70000, 1780600000), /uint16/);
  await assert.rejects(() => signAs(primaryOperator, id, -1, 1780600000), /uint16/);
});
