"use client";

import {useState, useCallback} from "react";
import {useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient} from "wagmi";
import {parseAbiItem, decodeEventLog} from "viem";
import type {Hex} from "viem";
import {LAUNCH_REGISTRY_ABI, IP_TOKEN_FACTORY_ABI} from "@/lib/abis";
import {LAUNCH_REGISTRY_ADDRESS, IP_TOKEN_FACTORY_ADDRESS} from "@/lib/contracts";

export type LaunchStep = "idle" | "minting" | "minted" | "registering" | "registered" | "error";

export interface LaunchState {
  step: LaunchStep;
  ipTokenAddress: Hex | null;
  mintTxHash: Hex | null;
  registerTxHash: Hex | null;
  error: string | null;
}

/**
 * Orchestrates the 2-transaction IP launch flow:
 *   1. IPTokenFactory.createToken()  -> deploy ERC-20 IP token
 *   2. IPLaunchRegistry.registerIP() -> link token to DRS attestation
 */
export function useIPLaunch() {
  const {address} = useAccount();
  const publicClient = usePublicClient();

  const [state, setState] = useState<LaunchState>({
    step: "idle",
    ipTokenAddress: null,
    mintTxHash: null,
    registerTxHash: null,
    error: null,
  });

  const {writeContractAsync} = useWriteContract();

  const mintToken = useCallback(
    async (name: string, symbol: string, initialSupply: bigint): Promise<Hex | null> => {
      if (!address || !publicClient) return null;

      setState((s) => ({...s, step: "minting", error: null}));
      try {
        const txHash = await writeContractAsync({
          address: IP_TOKEN_FACTORY_ADDRESS,
          abi: IP_TOKEN_FACTORY_ABI,
          functionName: "createToken",
          args: [name, symbol, initialSupply],
        });

        setState((s) => ({...s, mintTxHash: txHash}));

        const receipt = await publicClient.waitForTransactionReceipt({hash: txHash});

        // Parse TokenCreated event to get the deployed token address.
        const tokenCreatedAbi = parseAbiItem(
          "event TokenCreated(address indexed creator, address indexed tokenAddress, string name, string symbol)"
        );
        const log = receipt.logs.find((l) => {
          try {
            const decoded = decodeEventLog({
              abi: [tokenCreatedAbi],
              data: l.data,
              topics: l.topics,
            });
            return decoded.eventName === "TokenCreated";
          } catch {
            return false;
          }
        });

        if (!log) throw new Error("TokenCreated event not found in receipt");

        const decoded = decodeEventLog({
          abi: [tokenCreatedAbi],
          data: log.data,
          topics: log.topics,
        }) as {args: {tokenAddress: Hex}};

        const tokenAddress = decoded.args.tokenAddress;
        setState((s) => ({...s, step: "minted", ipTokenAddress: tokenAddress}));
        return tokenAddress;
      } catch (err) {
        setState((s) => ({...s, step: "error", error: (err as Error).message}));
        return null;
      }
    },
    [address, publicClient, writeContractAsync]
  );

  const registerIP = useCallback(
    async (tokenAddress: Hex, royaltyReceiver: Hex, tokenURI: string, attestationId: Hex) => {
      if (!address) return;

      setState((s) => ({...s, step: "registering", error: null}));
      try {
        const txHash = await writeContractAsync({
          address: LAUNCH_REGISTRY_ADDRESS,
          abi: LAUNCH_REGISTRY_ABI,
          functionName: "registerIP",
          args: [tokenAddress, royaltyReceiver, tokenURI, attestationId],
        });

        setState((s) => ({...s, registerTxHash: txHash}));
        await publicClient?.waitForTransactionReceipt({hash: txHash});
        setState((s) => ({...s, step: "registered"}));
      } catch (err) {
        setState((s) => ({...s, step: "error", error: (err as Error).message}));
      }
    },
    [address, publicClient, writeContractAsync]
  );

  const reset = useCallback(() => {
    setState({step: "idle", ipTokenAddress: null, mintTxHash: null, registerTxHash: null, error: null});
  }, []);

  return {state, mintToken, registerIP, reset};
}
