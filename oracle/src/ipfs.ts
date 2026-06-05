import {createHash} from "node:crypto";
import {config} from "./config.js";

/**
 * Content addressing for attested content.
 *
 * If PINATA_JWT is set, the content is really pinned to IPFS via Pinata and the
 * returned UnixFS CID is used as the on-chain ipfsCid (and is retrievable through
 * a gateway, e.g. for the keeper to re-score). If not set, the service derives a
 * deterministic raw CIDv1 locally so the on-chain ipfsCid is still a valid,
 * verifiable content address (just not pinned).
 */

export interface PinResult {
  cid: string;
  uri: string; // ipfs://<cid>
  pinned: boolean;
}

export async function pinContent(data: Buffer | string, filename: string): Promise<PinResult> {
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  if (config.pinataJwt) {
    try {
      const cid = await pinToPinata(bytes, filename);
      return {cid, uri: `ipfs://${cid}`, pinned: true};
    } catch (e) {
      // Never block an attestation on a pinning outage; fall back to a local CID.
      console.error("[ipfs] Pinata pin failed, using local CID:", e instanceof Error ? e.message : e);
    }
  }
  const cid = rawCidV1(bytes);
  return {cid, uri: `ipfs://${cid}`, pinned: false};
}

async function pinToPinata(bytes: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([bytes]), filename);
  form.append("pinataOptions", JSON.stringify({cidVersion: 1}));
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {Authorization: `Bearer ${config.pinataJwt}`},
    body: form,
  });
  if (!res.ok) throw new Error(`Pinata ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const json = (await res.json()) as {IpfsHash: string};
  return json.IpfsHash;
}

/** Deterministic raw-leaf CIDv1: base32( 0x01 0x55 <sha2-256 multihash> ). */
export function rawCidV1(bytes: Buffer): string {
  const digest = createHash("sha256").update(bytes).digest();
  const multihash = Buffer.concat([Buffer.from([0x12, 0x20]), digest]); // sha2-256, 32 bytes
  const cidBytes = Buffer.concat([Buffer.from([0x01, 0x55]), multihash]); // CIDv1, raw codec
  return "b" + base32Lower(cidBytes);
}

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
function base32Lower(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Fetch content back from IPFS by CID (used by the keeper to re-score). */
export async function fetchFromIpfs(cidOrUri: string): Promise<Buffer> {
  const cid = cidOrUri.replace(/^ipfs:\/\//, "");
  const res = await fetch(`${config.ipfsGateway}${cid}`, {headers: {"User-Agent": "VeritasOracle"}});
  if (!res.ok) throw new Error(`gateway ${res.status} for ${cid}`);
  return Buffer.from(await res.arrayBuffer());
}
