import {config as loadEnv} from "dotenv";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";
import {isHex, type Address, type Hex} from "viem";

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the oracle package root (one level up from src/). */
export const ROOT = resolve(__dirname, "..");

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(`Missing required env var ${name} (see oracle/.env.example)`);
  return v.trim();
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Env var ${name} is not a number: ${v}`);
  return n;
}

function asHex(name: string, v: string): Hex {
  if (!isHex(v)) throw new Error(`Env var ${name} must be 0x-prefixed hex, got: ${v.slice(0, 6)}…`);
  return v;
}

export const config = {
  chainId: num("CHAIN_ID", 1301),
  rpcUrl: process.env.RPC_URL?.trim() || "https://sepolia.unichain.org",
  registryAddress: asHex("REGISTRY_ADDRESS", required("REGISTRY_ADDRESS")) as Address,
  oracleAddress: asHex("ORACLE_ADDRESS", required("ORACLE_ADDRESS")) as Address,
  operatorKey: asHex("ORACLE_OPERATOR_KEY", required("ORACLE_OPERATOR_KEY")) as Hex,
  /** All operator signing keys (op1 required; op2/op3 enable the 2-of-3 quorum). */
  operatorKeys: ["ORACLE_OPERATOR_KEY", "ORACLE_OPERATOR_KEY_2", "ORACLE_OPERATOR_KEY_3"]
    .map((name) => process.env[name]?.trim())
    .filter((v): v is string => !!v)
    .map((v, i) => asHex(`operatorKey[${i}]`, v) as Hex),
  port: num("PORT", 8787),
  corsOrigin: (process.env.CORS_ORIGIN?.trim() || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // DRS model parameters (mirror the on-chain / frontend constants).
  lambdaD: num("LAMBDA_D", 0.7),
  beta: num("BETA", 2.0),
  simThreshold: num("SIM_THRESHOLD", 0.55),
  /** Hard ceiling: the on-chain oracle rejects a canonical DRS above 9500. */
  maxScore: num("MAX_SCORE", 9500),
  /**
   * Temperature for image-A overconfidence calibration. The open SMOGY detector
   * is bimodal and overconfident (measured: ~30% of real photos flagged AI at
   * ~1.0). T > 1 softens extreme scores via logit scaling; T = 1 is a no-op.
   * Default 1.5 is conservative (keeps true AI above the gate while pulling
   * borderline scores toward neutral). Raise it to further damp false positives
   * at the cost of true-positive sensitivity.
   */
  imageAiTemperature: num("IMAGE_AI_TEMPERATURE", 1.5),

  /** Pinata JWT for real IPFS pinning. If unset, the service derives a local CIDv1. */
  pinataJwt: process.env.PINATA_JWT?.trim() || "",
  /** Public gateway used to read pinned content back (e.g. the keeper re-scoring). */
  ipfsGateway: process.env.IPFS_GATEWAY?.trim() || "https://gateway.pinata.cloud/ipfs/",
} as const;

export type Config = typeof config;
