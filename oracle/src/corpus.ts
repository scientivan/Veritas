import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import {resolve} from "node:path";
import {mkdirSync} from "node:fs";
import {ROOT} from "./config.js";
import {EMBED_DIM} from "./detectors/embedder.js";
import {CLIP_DIM} from "./detectors/clip.js";
import {duplicateDensity} from "./drs.js";
import type {CorpusMatch} from "./types.js";

/** CLIP space is denser than DINOv2; near-dups sit ~0.96, distinct images ~0.72. */
export const CLIP_SIM_THRESHOLD = 0.88;

/**
 * The owned, growing corpus the off-chain D is measured against. There is NO free
 * reverse-image search at internet scale (Google Lens/TinEye are paid), so Veritas
 * computes duplicate density against this corpus, seeded with the protocol's own
 * attested content plus reference samples. New attestations are added here so the
 * next piece of content is measured against everything seen before.
 *
 *   - image samples: DINOv2 embedding in a sqlite-vec KNN index (cosine).
 *   - text samples : 64-bit SimHash, near-dup by Hamming distance (no extra model).
 */

const DB_PATH = resolve(ROOT, "data", "corpus.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  mkdirSync(resolve(ROOT, "data"), {recursive: true});
  const d = new Database(DB_PATH);
  sqliteVec.load(d);
  d.pragma("journal_mode = WAL");
  d.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS image_corpus USING vec0(
      sample_id TEXT PRIMARY KEY,
      embedding float[${EMBED_DIM}] distance_metric=cosine,
      +label TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS clip_corpus USING vec0(
      sample_id TEXT PRIMARY KEY,
      embedding float[${CLIP_DIM}] distance_metric=cosine,
      +label TEXT
    );
    CREATE TABLE IF NOT EXISTS text_corpus (
      sample_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      simhash TEXT NOT NULL
    );
  `);
  db = d;
  return d;
}

function vecBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function addImageSample(sampleId: string, label: string, embedding: Float32Array): void {
  const d = getDb();
  // vec0 virtual tables don't support UPSERT, so delete-then-insert in a tx.
  const tx = d.transaction(() => {
    d.prepare(`DELETE FROM image_corpus WHERE sample_id = ?`).run(sampleId);
    d.prepare(`INSERT INTO image_corpus(sample_id, embedding, label) VALUES (?, ?, ?)`).run(
      sampleId,
      vecBlob(embedding),
      label,
    );
  });
  tx();
}

export function addClipSample(sampleId: string, label: string, embedding: Float32Array): void {
  const d = getDb();
  const tx = d.transaction(() => {
    d.prepare(`DELETE FROM clip_corpus WHERE sample_id = ?`).run(sampleId);
    d.prepare(`INSERT INTO clip_corpus(sample_id, embedding, label) VALUES (?, ?, ?)`).run(
      sampleId,
      vecBlob(embedding),
      label,
    );
  });
  tx();
}

export function addTextSample(sampleId: string, label: string, simhash: string): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO text_corpus(sample_id, label, simhash) VALUES (?, ?, ?)
     ON CONFLICT(sample_id) DO UPDATE SET label=excluded.label, simhash=excluded.simhash`,
  ).run(sampleId, label, simhash);
}

/** Top-k cosine-nearest corpus images. similarity = 1 - cosine_distance. */
export function nearestImages(embedding: Float32Array, k = 8): CorpusMatch[] {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT sample_id AS id, label, distance
       FROM image_corpus
       WHERE embedding MATCH ? AND k = ?
       ORDER BY distance`,
    )
    .all(vecBlob(embedding), k) as {id: string; label: string; distance: number}[];
  return rows.map((r) => ({id: r.id, label: r.label, similarity: clamp01(1 - r.distance)}));
}

/** Top-k cosine-nearest corpus images in CLIP space (operator 2's independent view). */
export function nearestClip(embedding: Float32Array, k = 8): CorpusMatch[] {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT sample_id AS id, label, distance
       FROM clip_corpus
       WHERE embedding MATCH ? AND k = ?
       ORDER BY distance`,
    )
    .all(vecBlob(embedding), k) as {id: string; label: string; distance: number}[];
  return rows.map((r) => ({id: r.id, label: r.label, similarity: clamp01(1 - r.distance)}));
}

/** Independent CLIP-space duplicate density (operator 2). */
export function clipD(embedding: Float32Array): {d: number; matches: CorpusMatch[]} {
  if (clipCount() === 0) return {d: 0, matches: []};
  const matches = nearestClip(embedding);
  return {d: duplicateDensity(matches.map((m) => m.similarity), CLIP_SIM_THRESHOLD), matches};
}

export function clipCount(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM clip_corpus`).get() as {n: number}).n;
}

/** Near-dup text by SimHash Hamming distance, mapped to a similarity in [0,1]. */
export function nearestTexts(simhash: string, k = 8): CorpusMatch[] {
  const d = getDb();
  const rows = d.prepare(`SELECT sample_id AS id, label, simhash FROM text_corpus`).all() as {
    id: string;
    label: string;
    simhash: string;
  }[];
  const q = BigInt(simhash);
  return rows
    .map((r) => {
      const dist = hamming64(q, BigInt(r.simhash));
      return {id: r.id, label: r.label, similarity: 1 - dist / 64};
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

export function imageCount(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM image_corpus`).get() as {n: number}).n;
}
export function textCount(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM text_corpus`).get() as {n: number}).n;
}

/** D for an image: duplicate density over the corpus similarities. */
export function imageD(embedding: Float32Array): {d: number; matches: CorpusMatch[]} {
  const matches = nearestImages(embedding);
  return {d: duplicateDensity(matches.map((m) => m.similarity)), matches};
}

export function textD(simhash: string): {d: number; matches: CorpusMatch[]} {
  const matches = nearestTexts(simhash);
  return {d: duplicateDensity(matches.map((m) => m.similarity)), matches};
}

function hamming64(a: bigint, b: bigint): number {
  let x = (a ^ b) & 0xffffffffffffffffn;
  let c = 0;
  while (x > 0n) {
    c += Number(x & 1n);
    x >>= 1n;
  }
  return c;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
