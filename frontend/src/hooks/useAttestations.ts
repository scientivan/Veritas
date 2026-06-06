import {useMemo} from "react";
import {useReadContracts} from "wagmi";
import {REGISTRY_ABI} from "@/lib/abis";
import {REGISTRY_ADDRESS} from "@/lib/contracts";
import {combineDrs, DRS_GATE, BASE_FEE_BPS, MAX_FEE_BPS} from "@/lib/drs";
import {hasLivePool} from "@/lib/livePools";
import {KNOWN_ATTESTATION_IDS, isKnownLiving} from "@/lib/knownAttestations";
import {poolTitle} from "@/lib/poolMeta";
import type {Pool} from "@/lib/types";

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

/**
 * Reads the curated known attestation records from the on-chain registry. Wide
 * getLogs scans are blocked by the public RPC's 10000-block cap, so we read the
 * known IDs directly via getRecord. No mock fallback.
 */
export function useAttestations(): {pools: Pool[]; isLive: boolean; isLoading: boolean} {
  const contracts = useMemo(
    () =>
      KNOWN_ATTESTATION_IDS.map((id) => ({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "getRecord" as const,
        args: [id] as [`0x${string}`],
      })),
    []
  );

  const {data: records, isLoading, isError} = useReadContracts({contracts});

  const pools = useMemo<Pool[]>(() => {
    if (!records || records.length === 0) return [];
    return KNOWN_ATTESTATION_IDS.map((id, i) => {
      const res = records[i];
      if (!res || res.status !== "success" || !res.result) return null;
      return recordToPool(id, res.result as unknown as OnChainRecord);
    }).filter((p): p is Pool => p !== null);
  }, [records]);

  const isLive = !isError && pools.length > 0;

  return {pools, isLive, isLoading};
}
