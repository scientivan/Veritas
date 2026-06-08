"use client";

import {useState, useEffect, useMemo} from "react";
import {useAccount, useReadContracts} from "wagmi";
import {parseAbiItem} from "viem";
import type {Hex, Address} from "viem";
import {publicEventsClient, getLogsInChunks} from "@/lib/events";
import {
  REGISTRY_ADDRESS,
  LAUNCH_REGISTRY_ADDRESS,
  V1_HOOK_ADDRESS,
  REGISTRY_DEPLOY_BLOCK,
  LAUNCH_REGISTRY_DEPLOY_BLOCK,
} from "@/lib/contracts";
import {REGISTRY_ABI, V1_HOOK_ABI} from "@/lib/abis";
import {buildLaunchpadKey, computePoolId, decodeLaunchpads, LaunchpadPhase} from "@/lib/launchpad";
import {combineDrs} from "@/lib/drs";

const ATTESTED_EVENT = parseAbiItem(
  "event Attested(bytes32 indexed attestationId, address indexed owner, uint16 aiScore, string ipfsCid)"
);
const IP_REGISTERED_EVENT = parseAbiItem(
  "event IPRegistered(address indexed token, address indexed royaltyReceiver, bytes32 indexed attestationId, uint16 drsAtRegistration, string tokenURI)"
);

const ERC20_META_ABI = [
  {name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{name: "", type: "string"}]},
  {name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{name: "", type: "string"}]},
] as const;

type AttRecord = {
  aiReplicabilityScore: number;
  offchainD: number;
  ipfsCid: string;
  owner: string;
  attestedAt: bigint;
  disputed: boolean;
};

interface RegisteredToken {
  attestationId: Hex;
  token: Address;
  tokenURI: string;
  poolId: Hex;
  ipIsToken0: boolean;
}

export interface MyAttestation {
  id: Hex;
  ipfsCid: string;
  drs: number;
  d: number;
  a: number;
  attestedAt: bigint;
  disputed: boolean;
  tokenAddress?: Address;
  tokenName?: string;
  tokenSymbol?: string;
  tokenURI?: string;
  poolId?: Hex;
  ipIsToken0?: boolean;
  launchpadPhase?: LaunchpadPhase;
  fundsRaised?: bigint;
  hardCap?: bigint;
}

export function useMyAttestations() {
  const {address} = useAccount();
  const [attestedIds, setAttestedIds] = useState<Hex[]>([]);
  const [registeredTokens, setRegisteredTokens] = useState<RegisteredToken[]>([]);
  const [logsFetching, setLogsFetching] = useState(true);

  useEffect(() => {
    if (!address) {
      setAttestedIds([]);
      setRegisteredTokens([]);
      setLogsFetching(false);
      return;
    }
    let cancelled = false;
    async function run() {
      setLogsFetching(true);
      try {
        const currentBlock = await publicEventsClient.getBlockNumber();
        const [attestedLogs, registeredLogs] = await Promise.all([
          getLogsInChunks(
            (from, to) =>
              publicEventsClient.getLogs({
                address: REGISTRY_ADDRESS,
                event: ATTESTED_EVENT,
                args: {owner: address},
                fromBlock: from,
                toBlock: to,
              }),
            REGISTRY_DEPLOY_BLOCK,
            currentBlock
          ),
          getLogsInChunks(
            (from, to) =>
              publicEventsClient.getLogs({
                address: LAUNCH_REGISTRY_ADDRESS,
                event: IP_REGISTERED_EVENT,
                args: {royaltyReceiver: address},
                fromBlock: from,
                toBlock: to,
              }),
            LAUNCH_REGISTRY_DEPLOY_BLOCK,
            currentBlock
          ),
        ]);
        if (cancelled) return;

        const ids = attestedLogs.map((l) => l.args.attestationId as Hex);

        const tokensList: RegisteredToken[] = registeredLogs.map((l) => {
          const token = l.args.token as Address;
          const {key, ipIsToken0} = buildLaunchpadKey(token);
          return {
            attestationId: l.args.attestationId as Hex,
            token,
            tokenURI: (l.args.tokenURI as string) ?? "",
            poolId: computePoolId(key) as Hex,
            ipIsToken0,
          };
        });

        setAttestedIds(ids);
        setRegisteredTokens(tokensList);
      } catch (err) {
        console.error("[useMyAttestations] failed to fetch logs", err);
      } finally {
        if (!cancelled) setLogsFetching(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const {data: records} = useReadContracts({
    contracts: attestedIds.map((id) => ({
      address: REGISTRY_ADDRESS as Hex,
      abi: REGISTRY_ABI,
      functionName: "getRecord" as const,
      args: [id],
    })),
    query: {enabled: attestedIds.length > 0},
  });

  const {data: tokenMeta} = useReadContracts({
    contracts: registeredTokens.flatMap((rt) => [
      {address: rt.token, abi: ERC20_META_ABI, functionName: "name" as const},
      {address: rt.token, abi: ERC20_META_ABI, functionName: "symbol" as const},
    ]),
    query: {enabled: registeredTokens.length > 0},
  });

  const {data: launchpadData} = useReadContracts({
    contracts: registeredTokens.map((rt) => ({
      address: V1_HOOK_ADDRESS as Hex,
      abi: V1_HOOK_ABI,
      functionName: "launchpads" as const,
      args: [rt.poolId],
    })),
    query: {enabled: registeredTokens.length > 0},
  });

  const tokenMap = useMemo(
    () => new Map(registeredTokens.map((rt, i) => [rt.attestationId.toLowerCase(), {rt, i}])),
    [registeredTokens]
  );

  const attestations = useMemo<MyAttestation[]>(
    () =>
      attestedIds.flatMap((id, i) => {
        const rec = records?.[i]?.result as AttRecord | undefined;
        if (!rec) return [];
        const drs = combineDrs(rec.offchainD / 10000, rec.aiReplicabilityScore / 10000);
        const entry = tokenMap.get(id.toLowerCase());
        const tokenName = entry ? (tokenMeta?.[entry.i * 2]?.result as string | undefined) : undefined;
        const tokenSymbol = entry ? (tokenMeta?.[entry.i * 2 + 1]?.result as string | undefined) : undefined;
        const curve = entry ? decodeLaunchpads(launchpadData?.[entry.i]?.result as readonly unknown[] | undefined) : undefined;
        return [{
          id,
          ipfsCid: rec.ipfsCid,
          drs,
          d: rec.offchainD / 10000,
          a: rec.aiReplicabilityScore / 10000,
          attestedAt: rec.attestedAt,
          disputed: rec.disputed,
          tokenAddress: entry?.rt.token,
          tokenName,
          tokenSymbol,
          tokenURI: entry?.rt.tokenURI,
          poolId: entry?.rt.poolId,
          ipIsToken0: entry?.rt.ipIsToken0,
          launchpadPhase: curve ? (Number(curve.phase) as LaunchpadPhase) : undefined,
          fundsRaised: curve?.fundsRaised,
          hardCap: curve?.hardCap,
        }];
      }),
    [attestedIds, records, tokenMap, tokenMeta, launchpadData]
  );

  const isLoading = logsFetching || (attestedIds.length > 0 && records === undefined);

  return {attestations, isLoading};
}
