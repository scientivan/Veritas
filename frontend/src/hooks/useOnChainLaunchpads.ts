"use client";

import {useState, useEffect, useMemo} from "react";
import {useReadContracts} from "wagmi";
import {parseAbiItem} from "viem";
import type {Hex, Address} from "viem";
import {publicEventsClient, getLogsInChunks} from "@/lib/events";
import {
  LAUNCH_REGISTRY_ADDRESS,
  LAUNCH_REGISTRY_DEPLOY_BLOCK,
  V1_HOOK_ADDRESS,
} from "@/lib/contracts";
import {V1_HOOK_ABI} from "@/lib/abis";
import {buildLaunchpadKey, computePoolId, decodeLaunchpads, LaunchpadPhase} from "@/lib/launchpad";

const IP_REGISTERED_EVENT = parseAbiItem(
  "event IPRegistered(address indexed token, address indexed royaltyReceiver, bytes32 indexed attestationId, uint16 drsAtRegistration, string tokenURI)"
);

const ERC20_META_ABI = [
  {name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{name: "", type: "string"}]},
  {name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{name: "", type: "string"}]},
] as const;

interface RawRegistration {
  token: Address;
  royaltyReceiver: Address;
  attestationId: Hex;
  drsAtRegistration: number;
  tokenURI: string;
}

export interface LaunchpadEntry {
  tokenAddress: Address;
  royaltyReceiver: Address;
  attestationId: Hex;
  /** drsAtRegistration / 10000 */
  drs: number;
  tokenURI: string;
  tokenName: string;
  tokenSymbol: string;
  poolId: Hex;
  ipIsToken0: boolean;
  phase: LaunchpadPhase;
  fundsRaised: bigint;
  hardCap: bigint;
  tokensSold: bigint;
  curveA: bigint;
  curveB: bigint;
}

export function useOnChainLaunchpads() {
  const [registrations, setRegistrations] = useState<RawRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const currentBlock = await publicEventsClient.getBlockNumber();
        const logs = await getLogsInChunks(
          (from, to) =>
            publicEventsClient.getLogs({
              address: LAUNCH_REGISTRY_ADDRESS,
              event: IP_REGISTERED_EVENT,
              fromBlock: from,
              toBlock: to,
            }),
          LAUNCH_REGISTRY_DEPLOY_BLOCK,
          currentBlock
        );
        if (cancelled) return;
        setRegistrations(
          logs.map((log) => ({
            token: log.args.token as Address,
            royaltyReceiver: log.args.royaltyReceiver as Address,
            attestationId: log.args.attestationId as Hex,
            drsAtRegistration: Number(log.args.drsAtRegistration ?? 0),
            tokenURI: (log.args.tokenURI as string) ?? "",
          }))
        );
      } catch (err) {
        console.error("[useOnChainLaunchpads] failed to fetch logs", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const poolInfo = useMemo(
    () =>
      registrations.map((r) => {
        const {key, ipIsToken0} = buildLaunchpadKey(r.token);
        return {poolId: computePoolId(key) as Hex, ipIsToken0};
      }),
    [registrations]
  );

  const {data: metaData} = useReadContracts({
    contracts: registrations.flatMap((r) => [
      {address: r.token, abi: ERC20_META_ABI, functionName: "name" as const},
      {address: r.token, abi: ERC20_META_ABI, functionName: "symbol" as const},
    ]),
    query: {enabled: registrations.length > 0},
  });

  const {data: phaseData} = useReadContracts({
    contracts: poolInfo.map((p) => ({
      address: V1_HOOK_ADDRESS as Hex,
      abi: V1_HOOK_ABI,
      functionName: "launchpads" as const,
      args: [p.poolId],
    })),
    query: {enabled: poolInfo.length > 0},
  });

  const entries = useMemo<LaunchpadEntry[]>(
    () =>
      registrations.map((r, i) => {
        const tokenName = (metaData?.[i * 2]?.result as string | undefined) ?? "";
        const tokenSymbol = (metaData?.[i * 2 + 1]?.result as string | undefined) ?? "";
        const {poolId, ipIsToken0} = poolInfo[i];
        const curve = decodeLaunchpads(phaseData?.[i]?.result as readonly unknown[] | undefined);
        return {
          tokenAddress: r.token,
          royaltyReceiver: r.royaltyReceiver,
          attestationId: r.attestationId,
          drs: r.drsAtRegistration / 10000,
          tokenURI: r.tokenURI,
          tokenName,
          tokenSymbol,
          poolId,
          ipIsToken0,
          phase: curve ? (Number(curve.phase) as LaunchpadPhase) : LaunchpadPhase.INACTIVE,
          fundsRaised: curve ? curve.fundsRaised : 0n,
          hardCap: curve ? curve.hardCap : 0n,
          tokensSold: curve ? curve.tokensSold : 0n,
          curveA: curve ? curve.curveA : 0n,
          curveB: curve ? curve.curveB : 0n,
        };
      }),
    [registrations, metaData, phaseData, poolInfo]
  );

  return {entries, isLoading};
}
