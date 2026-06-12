import {createPublicClient, http, parseAbiItem, type Address, type Hex} from "viem";
import {cache} from "react";
import {unichainSepolia} from "./chains";
import {REGISTRY_ABI} from "./abis";
import {
  REGISTRY_ADDRESS,
  LAUNCH_REGISTRY_ADDRESS,
  LAUNCH_REGISTRY_DEPLOY_BLOCK,
} from "./contracts";
import {combineDrs, DRS_GATE, BASE_FEE_BPS, MAX_FEE_BPS} from "./drs";
import {hasLivePool} from "./livePools";
import {KNOWN_ATTESTATION_IDS, isKnownLiving} from "./knownAttestations";
import {poolTitle, resolveTokenImage} from "./poolMeta";
import {getLogsInChunks} from "./events";
import type {Pool} from "./types";

const client = createPublicClient({
  chain: unichainSepolia,
  transport: http(),
});

const IP_REGISTERED_EVENT = parseAbiItem(
  "event IPRegistered(address indexed token, address indexed royaltyReceiver, bytes32 indexed attestationId, uint16 drsAtRegistration, string tokenURI)"
);

const ERC20_META_ABI = [
  {name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{name: "", type: "string"}]},
  {name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{name: "", type: "string"}]},
] as const;

interface LaunchedToken {
  token: Address;
  tokenURI: string;
  name?: string;
  symbol?: string;
}

/**
 * Resolve the IP token launched against an attestation: its address, on-chain
 * ERC-20 name/symbol, and metadata URI. There is no on-chain reverse index
 * (attestation -> token), so we read the IPRegistered event filtered by the
 * indexed attestationId.
 *
 * A single attestation can back MULTIPLE distinct tokens (the same content
 * relaunched), so `preferToken` disambiguates which one the user actually
 * clicked; without it we fall back to the most recent registration. Wrapped in
 * React cache() so a single request render (generateMetadata + the page body)
 * only triggers one lookup. Returns null when the attestation has no token.
 */
const getLaunchedToken = cache(
  async (attestationId: Hex, preferToken?: string): Promise<LaunchedToken | null> => {
    try {
      const currentBlock = await client.getBlockNumber();
      const logs = await getLogsInChunks(
        (from, to) =>
          client.getLogs({
            address: LAUNCH_REGISTRY_ADDRESS,
            event: IP_REGISTERED_EVENT,
            args: {attestationId},
            fromBlock: from,
            toBlock: to,
          }),
        LAUNCH_REGISTRY_DEPLOY_BLOCK,
        currentBlock
      );
      if (logs.length === 0) return null;
      // Prefer the explicitly requested token; otherwise the most recent
      // registration wins (block order is ascending across chunks).
      const want = preferToken?.toLowerCase();
      const chosen =
        (want && logs.find((l) => (l.args.token as Address).toLowerCase() === want)) ||
        logs[logs.length - 1];
      const token = chosen.args.token as Address;
      const tokenURI = (chosen.args.tokenURI as string) ?? "";
      const [name, symbol] = await Promise.all([
        client
          .readContract({address: token, abi: ERC20_META_ABI, functionName: "name"})
          .catch(() => undefined),
        client
          .readContract({address: token, abi: ERC20_META_ABI, functionName: "symbol"})
          .catch(() => undefined),
      ]);
      return {
        token,
        tokenURI,
        name: name as string | undefined,
        symbol: symbol as string | undefined,
      };
    } catch {
      return null;
    }
  }
);

function saturateD(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 0.4;
  if (count === 2) return 0.6;
  if (count <= 3) return 0.75;
  if (count <= 5) return 0.85;
  if (count <= 10) return 0.9;
  if (count <= 20) return 0.95;
  return 0.98;
}

type OnChainRecord = {
  pHashFingerprint: `0x${string}`;
  blockhashFingerprint: `0x${string}`;
  aiReplicabilityScore: number;
  offchainD: number;
  dilutionCount: number;
  attestedAt: bigint;
  owner: `0x${string}`;
  ipfsCid: string;
  disputed: boolean;
};

function recordToPool(
  attestationId: `0x${string}`,
  rec: OnChainRecord,
  launched?: LaunchedToken | null
): Pool {
  const a = rec.aiReplicabilityScore / 10000;
  const offchainD = rec.offchainD / 10000;
  const onchainD = saturateD(rec.dilutionCount);
  const d = Math.max(offchainD, onchainD);
  const drs = combineDrs(d, a);
  const gated = drs > DRS_GATE;
  const hue = parseInt(attestationId.slice(2, 6), 16) % 360;

  // Prefer the real ERC-20 token name over a prettified ipfsCid / "Attestation 0x…".
  const title = launched?.name?.trim() || poolTitle(attestationId, rec.ipfsCid);
  const imageUrl = resolveTokenImage({
    attestationId,
    tokenURI: launched?.tokenURI,
    ipfsCid: rec.ipfsCid,
  });

  return {
    id: attestationId,
    title,
    medium: "Attested content",
    creator: rec.owner.slice(0, 6) + "…" + rec.owner.slice(-4),
    creatorAddress: rec.owner,
    swatch: `oklch(0.62 0.14 ${hue})`,
    drs,
    d,
    a,
    baseFeeBps: BASE_FEE_BPS,
    maxFeeBps: MAX_FEE_BPS,
    gated,
    tvlUsd: null,
    apyPct: null,
    duplicateCount: rec.dilutionCount,
    living: hasLivePool(attestationId) || isKnownLiving(attestationId) || rec.dilutionCount > 0,
    ipfsCid: rec.ipfsCid,
    pHash: rec.pHashFingerprint,
    attestedAt: Number(rec.attestedAt),
    imageUrl,
    tokenAddress: launched?.token,
    tokenSymbol: launched?.symbol,
  };
}

/** Fetch a single attestation record by its bytes32 ID, enriched with its
 *  launched IP token (name/symbol/image) when one exists. Returns undefined if
 *  not attested. Wrapped in cache() so generateMetadata and the page body that
 *  both call this in one render only hit the chain once. */
export const getOnChainPool = cache(
  async (attestationId: `0x${string}`, preferToken?: string): Promise<Pool | undefined> => {
    try {
      const [isAttested, rec] = await Promise.all([
        client.readContract({
          address: REGISTRY_ADDRESS,
          abi: REGISTRY_ABI,
          functionName: "isAttested",
          args: [attestationId],
        }),
        client.readContract({
          address: REGISTRY_ADDRESS,
          abi: REGISTRY_ABI,
          functionName: "getRecord",
          args: [attestationId],
        }),
      ]);
      if (!isAttested) return undefined;
      const launched = await getLaunchedToken(attestationId, preferToken);
      return recordToPool(attestationId, rec as unknown as OnChainRecord, launched);
    } catch {
      return undefined;
    }
  }
);

/**
 * Fetch all known attested pools by reading their records directly. Wide
 * getLogs scans are blocked by the public RPC's 10000-block cap, so we read
 * the curated known IDs via getRecord. Returns [] on error.
 */
export async function getOnChainPools(): Promise<Pool[]> {
  try {
    const records = await Promise.all(
      KNOWN_ATTESTATION_IDS.map((id) =>
        client.readContract({
          address: REGISTRY_ADDRESS,
          abi: REGISTRY_ABI,
          functionName: "getRecord",
          args: [id],
        })
      )
    );

    return KNOWN_ATTESTATION_IDS.map((id, i) =>
      recordToPool(id, records[i] as unknown as OnChainRecord)
    );
  } catch {
    return [];
  }
}

/** Fetch protocol-level metadata (attestFee, disputeBond, total attestation count). */
export async function getRegistryMeta() {
  try {
    const [attestFee, disputeBond, fingerprintCount] = await Promise.all([
      client.readContract({address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "attestFee"}),
      client.readContract({address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "disputeBond"}),
      client.readContract({address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "fingerprintCount"}),
    ]);
    return {
      attestFee: attestFee as bigint,
      disputeBond: disputeBond as bigint,
      fingerprintCount: Number(fingerprintCount),
    };
  } catch {
    return {attestFee: 0n, disputeBond: 0n, fingerprintCount: 0};
  }
}
