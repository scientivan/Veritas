/**
 * AUDIO is intentionally stubbed for this build (the team chose an image+text,
 * Node-pure stack). Realistic AI-music detection needs a Python sidecar
 * (wav2vec2 / SONICS), which is the documented post-hackathon extension.
 *
 * The stub still returns a well-formed, conservative result: A is neutral (0)
 * and D comes purely from the exact-bytes fingerprint match in the corpus, so an
 * identical re-upload is still caught while novel audio is treated as unknown.
 */
export function audioAiScore(): {a: number; source: string} {
  return {a: 0, source: "audio-stub (no AI detector wired - see detectors/audio.ts)"};
}
