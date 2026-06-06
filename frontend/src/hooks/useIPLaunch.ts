"use client";

import {useState, useCallback} from "react";
import {useAccount, useWriteContract, usePublicClient} from "wagmi";
import {decodeEventLog, maxUint256} from "viem";
import type {Hex} from "viem";
import {
  LAUNCH_REGISTRY_ABI,
  IP_TOKEN_FACTORY_ABI,
  REGISTRY_ABI,
  V1_REGISTRY_ABI,
  V1_HOOK_ABI,
  POOL_MANAGER_INIT_ABI,
  ERC20_APPROVE_ABI,
} from "@/lib/abis";
import {
  LAUNCH_REGISTRY_ADDRESS,
  IP_TOKEN_FACTORY_ADDRESS,
  REGISTRY_ADDRESS,
  V1_REGISTRY_ADDRESS,
  V1_HOOK_ADDRESS,
  POOL_MANAGER_ADDRESS,
  STATE_VIEW_ADDRESS,
} from "@/lib/contracts";
import {POOL_MANAGER_ABI_SLICE} from "@/lib/liquidity";
import {
  buildLaunchpadKey,
  defaultAllocations,
  computePoolId,
  decodeLaunchpads,
  SQRT_PRICE_1_1,
} from "@/lib/launchpad";

export type LaunchStep =
  | "idle"
  | "attesting"
  | "attested"
  | "minting"
  | "minted"
  | "registering"
  | "registered"
  | "opening"
  | "opened"
  | "error";

/** On-chain operator signature tuple as accepted by VeritasRegistry.attest(). */
export interface OnChainSig {
  drs: number;
  timestamp: bigint;
  signature: Hex;
}

/** Everything needed to submit the deferred on-chain attestation. */
export interface AttestParams {
  pHash: Hex;
  blockHash: Hex;
  ipfsCid: string;
  aiSigs: OnChainSig[];
  dSigs: OnChainSig[];
  attestationId: Hex;
  attestFee: bigint;
}

export interface LaunchState {
  step: LaunchStep;
  attestationId: Hex | null;
  attestTxHash: Hex | null;
  ipTokenAddress: Hex | null;
  mintTxHash: Hex | null;
  registerTxHash: Hex | null;
  /** Granular sub-status while opening the launchpad (4 sequential txs). */
  openStatus: string | null;
  openTxHash: Hex | null;
  poolId: Hex | null;
  ipIsToken0: boolean | null;
  error: string | null;
}

/** Parameters for opening the bonding-curve launchpad after registration. */
export interface OpenLaunchpadParams {
  ipToken: Hex;
  royaltyReceiver: Hex;
  tokenURI: string;
  totalSupply: bigint;
  hardCap: bigint;
}

/**
 * Orchestrates the merged attest + IP launch flow as a single sequence:
 *   1. VeritasRegistry.attest()      -> sign the DRS onto Unichain (deferred to mint time)
 *   2. IPTokenFactory.createToken()  -> deploy ERC-20 IP token
 *   3. IPLaunchRegistry.registerIP() -> link token to the DRS attestation (gate enforced)
 *
 * The attestation tx is fired right before the mint: the same wallet attesting the
 * same content always derives the same attestationId, so if the record already
 * exists on-chain the attest tx is skipped and the existing attestation is reused.
 */
export function useIPLaunch() {
  const {address} = useAccount();
  const publicClient = usePublicClient();

  const [state, setState] = useState<LaunchState>({
    step: "idle",
    attestationId: null,
    attestTxHash: null,
    ipTokenAddress: null,
    mintTxHash: null,
    registerTxHash: null,
    openStatus: null,
    openTxHash: null,
    poolId: null,
    ipIsToken0: null,
    error: null,
  });

  const {writeContractAsync} = useWriteContract();

  const attestOnChain = useCallback(
    async (params: AttestParams): Promise<Hex | null> => {
      if (!address || !publicClient) return null;

      setState((s) => ({...s, step: "attesting", error: null}));
      try {
        // attestationId = keccak(pHash, blockHash, owner). If this wallet already
        // attested this exact content, the record exists and a fresh attest() would
        // revert with AlreadyAttested() — so reuse it and skip straight to minting.
        const exists = (await publicClient.readContract({
          address: REGISTRY_ADDRESS,
          abi: REGISTRY_ABI,
          functionName: "isAttested",
          args: [params.attestationId],
        })) as boolean;

        if (!exists) {
          const txHash = await writeContractAsync({
            address: REGISTRY_ADDRESS,
            abi: REGISTRY_ABI,
            functionName: "attest",
            args: [params.pHash, params.blockHash, params.ipfsCid, params.aiSigs, params.dSigs],
            value: params.attestFee,
          });
          setState((s) => ({...s, attestTxHash: txHash}));
          const r = await publicClient.waitForTransactionReceipt({hash: txHash});
          if (r.status !== "success") throw new Error("Attestation transaction reverted on-chain");
        }

        setState((s) => ({...s, step: "attested", attestationId: params.attestationId}));
        return params.attestationId;
      } catch (err) {
        setState((s) => ({...s, step: "error", error: (err as Error).message}));
        return null;
      }
    },
    [address, publicClient, writeContractAsync]
  );

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
        if (receipt.status !== "success") throw new Error("Mint transaction reverted on-chain");

        // Parse the TokenCreated event to get the deployed token address. We decode
        // against IP_TOKEN_FACTORY_ABI (where only `creator` is indexed, matching the
        // on-chain event) so the topic layout lines up and decoding actually succeeds.
        let tokenAddress: Hex | undefined;
        for (const l of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: IP_TOKEN_FACTORY_ABI,
              data: l.data,
              topics: l.topics,
            });
            if (decoded.eventName === "TokenCreated") {
              tokenAddress = (decoded.args as {tokenAddress: Hex}).tokenAddress;
              break;
            }
          } catch {
            // Not a TokenCreated log (e.g. the ERC-20 Transfer mint) — skip it.
          }
        }

        if (!tokenAddress) throw new Error("TokenCreated event not found in receipt");

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
        const r = await publicClient?.waitForTransactionReceipt({hash: txHash});
        if (r && r.status !== "success") throw new Error("Register transaction reverted on-chain");
        setState((s) => ({...s, step: "registered"}));
      } catch (err) {
        setState((s) => ({...s, step: "error", error: (err as Error).message}));
      }
    },
    [address, publicClient, writeContractAsync]
  );

  /**
   * Open a bonding-curve launchpad for a registered IP token. Four sequential txs:
   *   1. v1 VeritasRegistry.registerIP  — mark token verified (the v1 hook reads this)
   *   2. PoolManager.initialize         — open the v4 pool (hook caches the treasury)
   *   3. IPToken.approve(hook, alloc)    — let the hook pull the curve + LP allocation
   *   4. VeritasHook.initializeLaunchpad — start the quadratic bonding curve
   *
   * Returns the poolId + token ordering on success (for local persistence), else null.
   */
  const openLaunchpad = useCallback(
    async (
      params: OpenLaunchpadParams
    ): Promise<{poolId: Hex; ipIsToken0: boolean} | null> => {
      if (!address || !publicClient) return null;

      const {key, ipIsToken0} = buildLaunchpadKey(params.ipToken);
      const poolId = computePoolId(key);
      const {curveAllocation, lpAllocation} = defaultAllocations(params.totalSupply);

      // IMPORTANT: waitForTransactionReceipt resolves even for REVERTED txs, so we
      // must check the status. Otherwise a reverted initializeLaunchpad would be
      // treated as success and a phantom launchpad record would be saved.
      const wait = async (hash: Hex) => {
        const r = await publicClient.waitForTransactionReceipt({hash});
        if (r.status !== "success") throw new Error("Transaction reverted on-chain");
      };
      setState((s) => ({...s, step: "opening", error: null, poolId, ipIsToken0}));

      try {
        // Idempotency: a re-open must not revert at a step that already landed.
        // If the launchpad is already active on-chain, we're done.
        const existing = decodeLaunchpads(
          (await publicClient
            .readContract({address: V1_HOOK_ADDRESS, abi: V1_HOOK_ABI, functionName: "launchpads", args: [poolId]})
            .catch(() => undefined)) as readonly unknown[] | undefined
        );
        if (existing && Number(existing.phase) !== 0) {
          setState((s) => ({...s, step: "opened", openStatus: null, attestationId: s.attestationId}));
          return {poolId, ipIsToken0};
        }
        // Is the v4 pool already initialized? (getSlot0 reverts/zeros if not.)
        let poolInitialized = false;
        try {
          const slot0 = (await publicClient.readContract({
            address: STATE_VIEW_ADDRESS,
            abi: POOL_MANAGER_ABI_SLICE,
            functionName: "getSlot0",
            args: [poolId],
          })) as readonly [bigint, number, number, number];
          poolInitialized = (slot0?.[0] ?? 0n) > 0n;
        } catch {
          poolInitialized = false;
        }

        // 1. Register the IP token in the v1 registry (permissionless + idempotent;
        //    the v1 hook reads royaltyReceiver + isVerified from here at beforeInitialize).
        setState((s) => ({...s, openStatus: "Verifying IP for launchpad…"}));
        await wait(
          await writeContractAsync({
            address: V1_REGISTRY_ADDRESS,
            abi: V1_REGISTRY_ABI,
            functionName: "registerIP",
            args: [params.ipToken, params.royaltyReceiver, params.tokenURI],
          })
        );

        // 2. Open the v4 pool (skip if already initialized). SQRT_PRICE_1_1 is a
        //    neutral init price; the curve bypasses the AMM until graduation.
        if (!poolInitialized) {
          setState((s) => ({...s, openStatus: "Opening the pool…"}));
          await wait(
            await writeContractAsync({
              address: POOL_MANAGER_ADDRESS,
              abi: POOL_MANAGER_INIT_ABI,
              functionName: "initialize",
              args: [key, SQRT_PRICE_1_1],
            })
          );
        }

        // 3. Approve the hook to pull the curve + LP allocation.
        setState((s) => ({...s, openStatus: "Approving token allocation…"}));
        await wait(
          await writeContractAsync({
            address: params.ipToken,
            abi: ERC20_APPROVE_ABI,
            functionName: "approve",
            args: [V1_HOOK_ADDRESS, maxUint256],
          })
        );

        // 4. Start the bonding curve.
        setState((s) => ({...s, openStatus: "Starting the bonding curve…"}));
        const openTxHash = await writeContractAsync({
          address: V1_HOOK_ADDRESS,
          abi: V1_HOOK_ABI,
          functionName: "initializeLaunchpad",
          args: [key, curveAllocation, lpAllocation, params.hardCap, params.royaltyReceiver],
        });
        setState((s) => ({...s, openTxHash}));
        await wait(openTxHash);

        setState((s) => ({...s, step: "opened", openStatus: null}));
        return {poolId, ipIsToken0};
      } catch (err) {
        setState((s) => ({...s, step: "error", openStatus: null, error: (err as Error).message}));
        return null;
      }
    },
    [address, publicClient, writeContractAsync]
  );

  const reset = useCallback(() => {
    setState({
      step: "idle",
      attestationId: null,
      attestTxHash: null,
      ipTokenAddress: null,
      mintTxHash: null,
      registerTxHash: null,
      openStatus: null,
      openTxHash: null,
      poolId: null,
      ipIsToken0: null,
      error: null,
    });
  }, []);

  return {state, attestOnChain, mintToken, registerIP, openLaunchpad, reset};
}
