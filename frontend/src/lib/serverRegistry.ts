import {createPublicClient, http} from "viem";
import {unichainSepolia} from "./chains";
import {REGISTRY_ABI} from "./abis";
import {REGISTRY_ADDRESS} from "./contracts";
import {combineDrs, DRS_GATE, BASE_FEE_BPS, MAX_FEE_BPS} from "./drs";
import {hasLivePool} from "./livePools";
import {KNOWN_ATTESTATION_IDS, isKnownLiving} from "./knownAttestations";
import {poolTitle} from "./poolMeta";
import type {Pool} from "./types";

const client = createPublicClient({
  chain: unichainSepolia,
  transport: http(),
});

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

function recordToPool(attestationId: `0x${string}`, rec: OnChainRecord): Pool {
  const a = rec.aiReplicabilityScore / 10000;
  const offchainD = rec.offchainD / 10000;
  const onchainD = saturateD(rec.dilutionCount);
  const d = Math.max(offchainD, onchainD);
  const drs = combineDrs(d, a);
  const gated = drs > DRS_GATE;
  const hue = parseInt(attestationId.slice(2, 6), 16) % 360;

  return {
    id: attestationId,
    title: poolTitle(attestationId, rec.ipfsCid),
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
  };
}

/** Fetch a single attestation record by its bytes32 ID. Returns undefined if not attested. */
export async function getOnChainPool(attestationId: `0x${string}`): Promise<Pool | undefined> {
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
    return recordToPool(attestationId, rec as unknown as OnChainRecord);
  } catch {
    return undefined;
  }
}

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
