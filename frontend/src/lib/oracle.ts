import type {Address, Hex} from "viem";

/**
 * Client for the off-chain Veritas oracle service (the Node/transformers.js
 * detector + EIP-712 signer). It fingerprints content, computes the real D + A
 * risk channels, and returns the operator signatures the registry verifies on
 * submit. The browser never sees the operator key, only the signatures.
 */

export const ORACLE_URL = process.env.NEXT_PUBLIC_ORACLE_URL ?? "http://localhost:8787";

export type OracleContentType = "image" | "text" | "audio";

export interface OracleSig {
  drs: number;
  timestamp: number;
  signature: Hex;
}

export interface OracleRisk {
  a: number;
  d: number;
  drs: number;
  gated: boolean;
  aSource: string;
  matches: {id: string; label: string; similarity: number}[];
}

export interface OperatorAgreement {
  address: Address;
  ensemble: string;
  agreesOnD: boolean;
  independentD: number | null;
}

export interface OracleAnalysis {
  pHash: Hex;
  blockHash: Hex;
  risk: OracleRisk;
  contentType: OracleContentType;
  quorum: {operators: OperatorAgreement[]};
}

export interface OracleAttestation {
  attestationId: Hex;
  pHash: Hex;
  blockHash: Hex;
  ipfsCid: string;
  owner: Address;
  contentType: OracleContentType;
  aiSigs: OracleSig[];
  dSigs: OracleSig[];
  risk: OracleRisk;
  operator: Address;
}

export interface AttestRequest {
  type: OracleContentType;
  owner: Address;
  ipfsCid?: string;
  /** One of these three carries the content. */
  dataBase64?: string;
  url?: string;
  text?: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${ORACLE_URL}${path}`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Oracle service unreachable at ${ORACLE_URL}. Start it with: cd oracle && npm run dev`);
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Oracle error ${res.status}`);
  return json as T;
}

/** Preview: real risk + the independent-operator agreement, no signatures, no chain. */
export function analyzeContent(req: Omit<AttestRequest, "owner">): Promise<OracleAnalysis> {
  return post<OracleAnalysis>("/analyze", req);
}

/** Full attestation: real risk + operator signatures, ready to submit on-chain. */
export function requestAttestation(req: AttestRequest): Promise<OracleAttestation> {
  return post<OracleAttestation>("/attest", req);
}

/** Tell the oracle the attestation landed on-chain so it grows its corpus. */
export function confirmAttestation(attestationId: Hex): Promise<{confirmed: boolean}> {
  return post<{confirmed: boolean}>("/confirm", {attestationId});
}

/** Read a File into a base64 string for the image/audio path. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.split(",")[1]! : result);
    };
    reader.readAsDataURL(file);
  });
}

/** Map oracle sigs to the on-chain tuple shape (uint64 timestamp as bigint). */
export function toOnChainSigs(sigs: OracleSig[]): {drs: number; timestamp: bigint; signature: Hex}[] {
  return sigs.map((s) => ({drs: s.drs, timestamp: BigInt(s.timestamp), signature: s.signature}));
}
