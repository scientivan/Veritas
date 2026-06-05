import Fastify from "fastify";
import cors from "@fastify/cors";
import {isAddress, type Address} from "viem";
import {config} from "./config.js";
import {analyze, buildAttestation, confirmAttestation, operatorSummary, pendingCount, type AnalyzeInput} from "./pipeline.js";
import {operators, primaryOperator} from "./operators.js";
import {imageCount, textCount, clipCount} from "./corpus.js";
import {registryAttestFee, isAttested} from "./chain.js";
import {pinContent} from "./ipfs.js";
import type {Hex} from "viem";
import {EMBED_MODEL_ID} from "./detectors/embedder.js";
import {CLIP_MODEL_ID} from "./detectors/clip.js";
import {IMAGE_AI_MODEL_ID} from "./detectors/imageAi.js";
import {TEXT_AI_MODEL_ID} from "./detectors/textAi.js";
import type {ContentType} from "./types.js";

const app = Fastify({
  logger: {level: "info"},
  bodyLimit: 25 * 1024 * 1024, // 25 MB - base64-encoded images
});

await app.register(cors, {origin: config.corsOrigin, methods: ["GET", "POST"]});

interface AttestBody {
  type?: ContentType;
  owner?: string;
  ipfsCid?: string;
  dataBase64?: string;
  /** Server-side fetch source (used by the demo assets to avoid browser CORS). */
  url?: string;
  text?: string;
}

async function toAnalyzeInput(body: AttestBody): Promise<AnalyzeInput> {
  const type = body.type ?? "image";
  if (type === "text") {
    if (typeof body.text !== "string" || body.text.trim() === "") throw new Error("text is required for type=text");
    return {type, text: body.text};
  }
  if (typeof body.url === "string" && body.url !== "") {
    const res = await fetch(body.url, {headers: {"User-Agent": "Mozilla/5.0 (VeritasOracle)"}});
    if (!res.ok) throw new Error(`fetch ${body.url} failed: ${res.status}`);
    return {type, bytes: Buffer.from(await res.arrayBuffer())};
  }
  if (typeof body.dataBase64 !== "string" || body.dataBase64 === "") {
    throw new Error(`dataBase64 or url is required for type=${type}`);
  }
  const b64 = body.dataBase64.includes(",") ? body.dataBase64.split(",")[1]! : body.dataBase64;
  return {type, bytes: Buffer.from(b64, "base64")};
}

app.get("/health", async () => {
  return {
    ok: true,
    chainId: config.chainId,
    operator: primaryOperator.address,
    operators: operators.map((o) => ({address: o.address, ensemble: o.kind})),
    oracle: config.oracleAddress,
    registry: config.registryAddress,
    attestFeeWei: (await registryAttestFee().catch(() => 0n)).toString(),
    corpus: {images: imageCount(), clip: clipCount(), texts: textCount(), pendingConfirmation: pendingCount()},
    ipfs: config.pinataJwt ? "pinata" : "local-cid",
    models: {
      embedder: EMBED_MODEL_ID,
      embedder2: CLIP_MODEL_ID,
      imageAi: IMAGE_AI_MODEL_ID,
      textAi: TEXT_AI_MODEL_ID,
      audioAi: "stub",
    },
  };
});

/** Preview: fingerprint + score, no signatures, no corpus mutation. */
app.post("/analyze", async (req, reply) => {
  try {
    const a = await analyze(await toAnalyzeInput(req.body as AttestBody));
    return {
      pHash: a.pHash,
      blockHash: a.blockHash,
      risk: a.risk,
      contentType: a.type,
      quorum: {operators: operatorSummary(a)},
    };
  } catch (e) {
    reply.code(400);
    return {error: e instanceof Error ? e.message : "bad request"};
  }
});

/** Full attestation: returns the signed payload the frontend submits on-chain. */
app.post("/attest", async (req, reply) => {
  const body = req.body as AttestBody;
  const owner = body.owner;
  if (!owner || !isAddress(owner)) {
    reply.code(400);
    return {error: "valid `owner` address is required"};
  }
  try {
    const input = await toAnalyzeInput(body);
    // Pin the content so the on-chain ipfsCid is a real, retrievable content address.
    const filename = `veritas-${input.type}-${Date.now()}`;
    const pin = await pinContent(input.bytes ?? input.text ?? "", filename);
    const analysis = await analyze(input);
    const res = await buildAttestation(analysis, owner as Address, pin.uri);
    return {...res, ipfs: {cid: pin.cid, pinned: pin.pinned}};
  } catch (e) {
    reply.code(400);
    return {error: e instanceof Error ? e.message : "attestation failed"};
  }
});

/**
 * Called by the client after the attest tx confirms. Verifies the attestation is
 * really on-chain, then commits the staged sample to the corpus (so an unsubmitted
 * /attest can never poison the duplicate-density signal).
 */
app.post("/confirm", async (req, reply) => {
  const {attestationId} = (req.body ?? {}) as {attestationId?: string};
  if (!attestationId || !/^0x[0-9a-fA-F]{64}$/.test(attestationId)) {
    reply.code(400);
    return {error: "valid bytes32 `attestationId` required"};
  }
  try {
    const onChain = await isAttested(attestationId as Hex);
    if (!onChain) {
      reply.code(409);
      return {confirmed: false, error: "attestation not found on-chain yet"};
    }
    const added = confirmAttestation(attestationId as Hex);
    return {confirmed: true, addedToCorpus: added, corpus: {images: imageCount(), clip: clipCount(), texts: textCount()}};
  } catch (e) {
    reply.code(400);
    return {error: e instanceof Error ? e.message : "confirm failed"};
  }
});

const port = config.port;
app
  .listen({port, host: "0.0.0.0"})
  .then(() =>
    app.log.info(
      `Veritas oracle listening on :${port} (${operators.length} operator(s), primary ${primaryOperator.address})`,
    ),
  )
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
