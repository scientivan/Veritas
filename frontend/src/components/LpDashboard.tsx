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
import {useLpPositions} from "@/hooks/useLpPositions";
import {getLivePool} from "@/lib/livePools";
import {
  LIQUIDITY_ROUTER_ADDRESS,
  POOL_MANAGER_ADDRESS,
  STATE_VIEW_ADDRESS,
  V1_HOOK_ADDRESS,
  V1_SWAP_ROUTER_ADDRESS,
  RAISE_TOKEN_ADDRESS,
} from "@/lib/contracts";
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
import {buildLaunchpadKey} from "@/lib/launchpad";
import {buildCurveSwapParams} from "@/lib/curve";
import {POOL_SWAP_TEST_ABI, SWAP_TEST_SETTINGS} from "@/lib/swap";
import {ASSUMED_TOKEN_PRICE_USD} from "@/lib/poolMeta";
import {formatFeeBps, formatUsd, cn} from "@/lib/utils";

export function LpDashboard({pool}: {pool: Pool}) {
  const {address, isConnected} = useAccount();
  const publicClient = usePublicClient();
  const {writeContractAsync} = useWriteContract();
  const {recordProvide, recordRemove} = useLpPositions(address);
  const [busy, setBusy] = useState<string | null>(null);
  const [inputAmt, setInputAmt] = useState("1");

  const livePool = getLivePool(pool.id);

  // A graduated bonding-curve pool (opened by the v1 hook) pairs a FIXED-SUPPLY IP
  // token with USDC. That IP token has no public mint(), so an LP can't get it by
  // minting; they must buy it from the live pool. We detect these pools by their
  // hook address and acquire the IP side via a swap before providing.
  const isLaunchpadPool =
    !!livePool && livePool.hooksAddress?.toLowerCase() === V1_HOOK_ADDRESS.toLowerCase();
  // The IP token is whichever side of the pair is not the raise token (USDC).
  const ipToken = livePool
    ? livePool.token0.toLowerCase() === RAISE_TOKEN_ADDRESS.toLowerCase()
      ? livePool.token1
      : livePool.token0
    : undefined;

  // Pool-level reads: TVL balances + current price. Always enabled when pool exists.
  const {data: poolData, refetch: refetchPool} = useReadContracts({
    contracts: livePool
      ? [
          {address: livePool.token0, abi: TEST_ERC20_ABI, functionName: "balanceOf" as const, args: [POOL_MANAGER_ADDRESS]},
          {address: livePool.token1, abi: TEST_ERC20_ABI, functionName: "balanceOf" as const, args: [POOL_MANAGER_ADDRESS]},
          {address: STATE_VIEW_ADDRESS, abi: POOL_MANAGER_ABI_SLICE, functionName: "getSlot0" as const, args: [livePool.poolId as `0x${string}`]},
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
            // USDC allowance to the v1 swap router, used to buy the IP token on launchpad pools.
            {address: RAISE_TOKEN_ADDRESS, abi: TEST_ERC20_ABI, functionName: "allowance" as const, args: [address, V1_SWAP_ROUTER_ADDRESS]},
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
  const allowSwapRaise = (userData?.[4]?.result as bigint | undefined) ?? 0n;

  // USDC spent to acquire IP tokens on a graduated launchpad pool. Enough IP to
  // provide the default position size several times over.
  const IP_BUY_USDC = parseEther("50");

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
    if (!publicClient) throw new Error("No RPC client available. Reload and try again.");
    const r = await publicClient.waitForTransactionReceipt({hash});
    if (r.status !== "success") throw new Error("Transaction reverted on-chain");
  }

  async function mintTokens() {
    if (!address) return;
    try {
      // The raise token (USDC) is always a mintable test token; mint plenty.
      setBusy("Minting USDC…");
      await wait(
        await writeContractAsync({address: RAISE_TOKEN_ADDRESS, abi: TEST_ERC20_ABI, functionName: "mint", args: [address, MINT_AMOUNT]})
      );

      if (isLaunchpadPool && ipToken) {
        // Fixed-supply IP token: acquire it by buying from the graduated pool with
        // some of the freshly minted USDC, so the LP holds both sides to provide.
        const {key, ipIsToken0} = buildLaunchpadKey(ipToken);
        if (allowSwapRaise < IP_BUY_USDC) {
          setBusy("Approving USDC…");
          await wait(
            await writeContractAsync({address: RAISE_TOKEN_ADDRESS, abi: TEST_ERC20_ABI, functionName: "approve", args: [V1_SWAP_ROUTER_ADDRESS, MAX_UINT256]})
          );
        }
        setBusy("Buying IP tokens…");
        await wait(
          await writeContractAsync({
            address: V1_SWAP_ROUTER_ADDRESS,
            abi: POOL_SWAP_TEST_ABI,
            functionName: "swap",
            args: [key, buildCurveSwapParams(ipIsToken0, "buy", IP_BUY_USDC), SWAP_TEST_SETTINGS, "0x"],
          })
        );
        toast.success("Ready to provide", {description: "Minted USDC and bought IP tokens. You now hold both sides of the pair."});
      } else {
        // v2 dynamic-fee pool: both tokens are mintable test tokens.
        if (livePool!.token0Mintable !== false) {
          setBusy("Minting token 0…");
          await wait(
            await writeContractAsync({address: livePool!.token0, abi: TEST_ERC20_ABI, functionName: "mint", args: [address, MINT_AMOUNT]})
          );
        }
        toast.success("Minted test tokens", {description: "10 000 test tokens minted to your wallet."});
      }
      await refetch();
    } catch (e) {
      toast.error("Couldn't get tokens", {description: msg(e)});
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
      recordProvide(pool.id as `0x${string}`, inputWei);
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
      recordRemove(pool.id as `0x${string}`, inputWei);
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
        {isLaunchpadPool
          ? "Real Uniswap v4 actions on testnet. Get test tokens (mints USDC and buys IP from the graduated pool), then add or remove liquidity, each step is an on-chain transaction."
          : "Real Uniswap v4 actions on testnet. Mint the pool's test tokens, then add or remove liquidity, each step is an on-chain transaction."}
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
              {busy?.startsWith("Minting") || busy?.startsWith("Buying") || busy === "Approving USDC…" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Coins className="size-4" aria-hidden />
              )}
              {isLaunchpadPool ? "Get test tokens (mint USDC + buy IP)" : "Mint test tokens (10 000 each)"}
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
              <p className="text-center text-xs text-faint">
                {isLaunchpadPool
                  ? "Get test tokens first (mints USDC and buys IP from the pool) to provide."
                  : "Mint test tokens first to provide."}
              </p>
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
