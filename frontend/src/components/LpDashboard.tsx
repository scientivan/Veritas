"use client";

import {useState} from "react";
import {useAccount, usePublicClient, useReadContracts, useWriteContract} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {toast} from "sonner";
import {Lock, Loader2, Coins} from "lucide-react";
import {formatEther, parseEther} from "viem";
import type {Pool} from "@/lib/types";
import {Button} from "./ui/Button";
import {dynamicFeeBps} from "@/lib/drs";
import {getLivePool} from "@/lib/livePools";
import {LIQUIDITY_ROUTER_ADDRESS, POOL_MANAGER_ADDRESS} from "@/lib/contracts";
import {
  TEST_ERC20_ABI,
  ROUTER_ABI,
  MINT_AMOUNT,
  MAX_UINT256,
  buildPoolKey,
  liquidityParams,
  computeLiquidityDelta,
  estimateToken1,
  POOL_MANAGER_ABI_SLICE,
} from "@/lib/liquidity";
import {ASSUMED_TOKEN_PRICE_USD} from "@/lib/poolMeta";
import {formatFeeBps, formatUsd, cn} from "@/lib/utils";

export function LpDashboard({pool}: {pool: Pool}) {
  const {address, isConnected} = useAccount();
  const publicClient = usePublicClient();
  const {writeContractAsync} = useWriteContract();
  const [busy, setBusy] = useState<string | null>(null);
  const [inputAmt, setInputAmt] = useState("1");

  const livePool = getLivePool(pool.id);

  // Pool-level reads: TVL balances + current price. Always enabled when pool exists.
  const {data: poolData, refetch: refetchPool} = useReadContracts({
    contracts: livePool
      ? [
          {address: livePool.token0, abi: TEST_ERC20_ABI, functionName: "balanceOf" as const, args: [POOL_MANAGER_ADDRESS]},
          {address: livePool.token1, abi: TEST_ERC20_ABI, functionName: "balanceOf" as const, args: [POOL_MANAGER_ADDRESS]},
          {address: POOL_MANAGER_ADDRESS, abi: POOL_MANAGER_ABI_SLICE, functionName: "getSlot0" as const, args: [livePool.poolId as `0x${string}`]},
        ]
      : [],
    query: {enabled: !!livePool},
  });

  // User-level reads: balances + allowances. Enabled only when connected.
  const {data: userData, refetch: refetchUser} = useReadContracts({
    contracts:
      livePool && address
        ? [
            {address: livePool.token0, abi: TEST_ERC20_ABI, functionName: "balanceOf" as const, args: [address]},
            {address: livePool.token1, abi: TEST_ERC20_ABI, functionName: "balanceOf" as const, args: [address]},
            {address: livePool.token0, abi: TEST_ERC20_ABI, functionName: "allowance" as const, args: [address, LIQUIDITY_ROUTER_ADDRESS]},
            {address: livePool.token1, abi: TEST_ERC20_ABI, functionName: "allowance" as const, args: [address, LIQUIDITY_ROUTER_ADDRESS]},
          ]
        : [],
    query: {enabled: !!livePool && !!address},
  });

  const poolBal0 = (poolData?.[0]?.result as bigint | undefined) ?? 0n;
  const poolBal1 = (poolData?.[1]?.result as bigint | undefined) ?? 0n;
  const slot0 = poolData?.[2]?.result as readonly [bigint, number, number, number] | undefined;
  const sqrtPriceX96 = slot0?.[0] ?? 2n ** 96n;

  const tvlUsd =
    poolBal0 > 0n || poolBal1 > 0n
      ? (Number(formatEther(poolBal0)) + Number(formatEther(poolBal1))) * ASSUMED_TOKEN_PRICE_USD
      : null;

  const bal0 = (userData?.[0]?.result as bigint | undefined) ?? 0n;
  const bal1 = (userData?.[1]?.result as bigint | undefined) ?? 0n;
  const allow0 = (userData?.[2]?.result as bigint | undefined) ?? 0n;
  const allow1 = (userData?.[3]?.result as bigint | undefined) ?? 0n;

  // Parse amount input and compute liquidity delta from x*y=k: L = amount0 * sqrtPrice.
  let inputWei = 0n;
  try {
    if (inputAmt) inputWei = parseEther(inputAmt);
  } catch {
    // invalid decimal input
  }
  const liquidityDelta = computeLiquidityDelta(inputWei, sqrtPriceX96);
  const est1 = estimateToken1(parseFloat(inputAmt) || 0, sqrtPriceX96);

  async function refetch() {
    await Promise.all([refetchPool(), refetchUser()]);
  }

  if (pool.gated) {
    return (
      <div className="rounded-2xl border border-border bg-surface/40 p-6">
        <div className="flex items-center gap-2 text-risk-high">
          <Lock className="size-4" strokeWidth={2.25} aria-hidden />
          <span className="text-sm font-medium">Pool gated</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This content&apos;s Dilution Risk Score is above the protocol gate, so no pool exists to
          provide liquidity to. The gate protects LPs from a near-certain dilution loss.
        </p>
      </div>
    );
  }

  if (!livePool) {
    return (
      <div className="rounded-2xl border border-border bg-surface/40 p-6">
        <h3 className="text-sm font-medium text-ink">Liquidity</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This attestation does not yet have a live Uniswap v4 pool. Open one through the hook to
          provide liquidity here.
        </p>
      </div>
    );
  }

  const key = buildPoolKey(livePool);
  const hasTokens = bal0 > 0n && bal1 > 0n;
  const inputValid = inputWei > 0n;

  async function wait(hash: `0x${string}`) {
    await publicClient?.waitForTransactionReceipt({hash});
  }

  async function mintTokens() {
    if (!address) return;
    try {
      setBusy("Minting token 0…");
      await wait(
        await writeContractAsync({address: livePool!.token0, abi: TEST_ERC20_ABI, functionName: "mint", args: [address, MINT_AMOUNT]})
      );
      setBusy("Minting token 1…");
      await wait(
        await writeContractAsync({address: livePool!.token1, abi: TEST_ERC20_ABI, functionName: "mint", args: [address, MINT_AMOUNT]})
      );
      toast.success("Minted test tokens", {description: "10 000 of each pool token minted to your wallet."});
      await refetch();
    } catch (e) {
      toast.error("Mint failed", {description: msg(e)});
    } finally {
      setBusy(null);
    }
  }

  async function provide() {
    if (!address || !inputValid) return;
    try {
      if (allow0 < inputWei) {
        setBusy("Approving token 0…");
        await wait(
          await writeContractAsync({address: livePool!.token0, abi: TEST_ERC20_ABI, functionName: "approve", args: [LIQUIDITY_ROUTER_ADDRESS, MAX_UINT256]})
        );
      }
      if (allow1 < inputWei) {
        setBusy("Approving token 1…");
        await wait(
          await writeContractAsync({address: livePool!.token1, abi: TEST_ERC20_ABI, functionName: "approve", args: [LIQUIDITY_ROUTER_ADDRESS, MAX_UINT256]})
        );
      }
      setBusy("Providing liquidity…");
      await wait(
        await writeContractAsync({
          address: LIQUIDITY_ROUTER_ADDRESS,
          abi: ROUTER_ABI,
          functionName: "modifyLiquidity",
          args: [key, liquidityParams(liquidityDelta), "0x"],
        })
      );
      toast.success("Liquidity provided", {description: `Added ${inputAmt} token0-equivalent to the pool.`});
      await refetch();
    } catch (e) {
      toast.error("Provide failed", {description: msg(e)});
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!inputValid) return;
    try {
      setBusy("Removing liquidity…");
      await wait(
        await writeContractAsync({
          address: LIQUIDITY_ROUTER_ADDRESS,
          abi: ROUTER_ABI,
          functionName: "modifyLiquidity",
          args: [key, liquidityParams(-liquidityDelta), "0x"],
        })
      );
      toast.success("Liquidity removed", {description: `Removed ${inputAmt} token0-equivalent from the pool.`});
      await refetch();
    } catch (e) {
      toast.error("Remove failed", {description: `${msg(e)} (provide first if you hold no position)`});
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5">
      <h3 className="text-sm font-medium text-ink">Liquidity</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Real Uniswap v4 actions on testnet. Mint the pool&apos;s test tokens, then add or remove
        liquidity — each step is an on-chain transaction.
      </p>

      <dl className="mt-4 flex flex-col gap-2 text-sm">
        <Row label="Current LP fee" value={formatFeeBps(dynamicFeeBps(pool.drs, pool.baseFeeBps, pool.maxFeeBps))} />
        <Row label="TVL" value={tvlUsd != null ? `${formatUsd(tvlUsd)} (sim.)` : "-"} />
        {isConnected && (
          <>
            <Row label="Your token 0" value={(+formatEther(bal0)).toFixed(2)} subtle />
            <Row label="Your token 1" value={(+formatEther(bal1)).toFixed(2)} subtle />
          </>
        )}
      </dl>

      <div className="mt-5">
        {isConnected ? (
          <div className="flex flex-col gap-3">
            {/* Amount input */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Token 0 amount</label>
              <input
                type="number"
                min="0"
                step="any"
                value={inputAmt}
                onChange={(e) => setInputAmt(e.target.value)}
                className={cn(
                  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink",
                  "placeholder:text-faint focus:border-primary-ink focus:outline-none"
                )}
                placeholder="e.g. 10"
                disabled={!!busy}
              />
              {inputValid && est1 > 0 && (
                <p className="text-xs text-faint">
                  Pool also requires ~{est1.toFixed(2)} token1 at current price
                </p>
              )}
            </div>

            <Button variant="secondary" className="w-full" onClick={mintTokens} disabled={!!busy}>
              {busy?.startsWith("Minting") ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Coins className="size-4" aria-hidden />
              )}
              Mint test tokens (10 000 each)
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button className="w-full" onClick={provide} disabled={!!busy || !hasTokens || !inputValid}>
                {busy === "Providing liquidity…" || busy?.startsWith("Approving") ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                Provide
              </Button>
              <Button variant="secondary" className="w-full" onClick={remove} disabled={!!busy || !inputValid}>
                {busy === "Removing liquidity…" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                Remove
              </Button>
            </div>
            {busy && <p className="text-center text-xs text-muted">{busy}</p>}
            {!hasTokens && !busy && (
              <p className="text-center text-xs text-faint">Mint test tokens first to provide.</p>
            )}
          </div>
        ) : (
          <div className="[&_button]:w-full">
            <ConnectButton.Custom>
              {({openConnectModal}) => (
                <Button className="w-full" size="lg" onClick={openConnectModal}>
                  Connect wallet to provide
                </Button>
              )}
            </ConnectButton.Custom>
          </div>
        )}
      </div>
    </div>
  );
}

function msg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.slice(0, 110);
}

function Row({label, value, subtle}: {label: string; value: string; subtle?: boolean}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("font-mono tnum", subtle ? "text-muted" : "text-ink")}>{value}</dd>
    </div>
  );
}
