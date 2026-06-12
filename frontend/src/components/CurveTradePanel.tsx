"use client";

import {useState} from "react";
import Link from "next/link";
import {useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {toast} from "sonner";
import {Loader2, Coins, TrendingUp, CheckCircle2} from "lucide-react";
import {formatEther, parseEther, type Hex} from "viem";
import type {Pool} from "@/lib/types";
import {Button} from "./ui/Button";
import {V1_HOOK_ADDRESS, V1_SWAP_ROUTER_ADDRESS, RAISE_TOKEN_SYMBOL} from "@/lib/contracts";
import {V1_HOOK_ABI} from "@/lib/abis";
import {TEST_ERC20_ABI, MINT_AMOUNT, MAX_UINT256} from "@/lib/liquidity";
import {POOL_SWAP_TEST_ABI, SWAP_TEST_SETTINGS} from "@/lib/swap";
import {buildLaunchpadKey, computePoolId, raiseProgress, decodeLaunchpads, LaunchpadPhase, type LaunchpadRecord} from "@/lib/launchpad";
import {curvePrice, buildCurveSwapParams, estimateTokensOut} from "@/lib/curve";
import {useTradeHistory} from "@/hooks/useTradeHistory";
import {cn} from "@/lib/utils";

type Side = "buy" | "sell";

export function CurveTradePanel({pool, record}: {pool: Pool; record: LaunchpadRecord}) {
  const {address, isConnected} = useAccount();
  const publicClient = usePublicClient();
  const {writeContractAsync} = useWriteContract();
  const {addTrade} = useTradeHistory(address);

  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const ipLabel = record.tokenSymbol || pool.title;
  // Recompute the key + poolId from the CURRENT hook. A poolId stored in an older
  // record (different hook address) would not match the live launchpad.
  const {key, ipIsToken0} = buildLaunchpadKey(record.ipToken);
  const poolId = computePoolId(key);

  const {data: lpData, refetch: refetchLp} = useReadContract({
    address: V1_HOOK_ADDRESS,
    abi: V1_HOOK_ABI,
    functionName: "launchpads",
    args: [poolId],
    query: {refetchInterval: 5000},
  });
  const cfg = decodeLaunchpads(lpData as readonly unknown[] | undefined);
  // If the read hasn't resolved yet, assume LAUNCHPAD (the just-opened state) so the
  // buy action isn't blocked; the on-chain hook enforces the real rules regardless.
  const phase = cfg ? Number(cfg.phase) : LaunchpadPhase.LAUNCHPAD;
  const isLaunchpad = phase === LaunchpadPhase.LAUNCHPAD;
  const isGraduated = phase === LaunchpadPhase.GRADUATED;

  const {data: userData, refetch: refetchUser} = useReadContracts({
    contracts: address
      ? [
          {address: record.raiseToken, abi: TEST_ERC20_ABI, functionName: "balanceOf" as const, args: [address]},
          {address: record.ipToken, abi: TEST_ERC20_ABI, functionName: "balanceOf" as const, args: [address]},
          {address: record.raiseToken, abi: TEST_ERC20_ABI, functionName: "allowance" as const, args: [address, V1_SWAP_ROUTER_ADDRESS]},
          {address: record.ipToken, abi: TEST_ERC20_ABI, functionName: "allowance" as const, args: [address, V1_SWAP_ROUTER_ADDRESS]},
        ]
      : [],
    query: {enabled: !!address, refetchInterval: 5000},
  });

  const balRaise = (userData?.[0]?.result as bigint | undefined) ?? 0n;
  const balIp = (userData?.[1]?.result as bigint | undefined) ?? 0n;
  const allowRaise = (userData?.[2]?.result as bigint | undefined) ?? 0n;
  const allowIp = (userData?.[3]?.result as bigint | undefined) ?? 0n;

  // Per-wallet buy limit: 2% of curveAllocation (contract constant MAX_BUY_BPS = 200 / 10000).
  const maxBuyTokens = cfg ? (cfg.curveAllocation * 200n) / 10000n : 0n;
  const {data: alreadyBoughtRaw, refetch: refetchBought} = useReadContract({
    address: V1_HOOK_ADDRESS,
    abi: V1_HOOK_ABI,
    functionName: "userTokensBought",
    args: address ? [poolId, address] : undefined,
    query: {enabled: !!address && !!cfg, refetchInterval: 5000},
  });
  const alreadyBought = (alreadyBoughtRaw as bigint | undefined) ?? 0n;
  const remainingAllowance = maxBuyTokens > alreadyBought ? maxBuyTokens - alreadyBought : 0n;

  const price = cfg ? curvePrice(cfg.curveA, cfg.curveB, cfg.tokensSold) : 0;
  const progress = cfg ? raiseProgress(cfg) : 0;

  // Sell is only possible after graduation; during the curve it's buy-only.
  const effectiveSide: Side = isLaunchpad ? "buy" : side;

  let amountWei = 0n;
  try {
    if (amount) amountWei = parseEther(amount);
  } catch {
    // invalid
  }
  const amountNum = parseFloat(amount) || 0;

  const inputBal = effectiveSide === "buy" ? balRaise : balIp;
  const inputLabel = effectiveSide === "buy" ? RAISE_TOKEN_SYMBOL : ipLabel;

  const estOut =
    effectiveSide === "buy"
      ? estimateTokensOut(amountNum, price)
      : amountNum * price; // sell IP -> raise
  const estOutLabel = effectiveSide === "buy" ? ipLabel : RAISE_TOKEN_SYMBOL;

  // For buys, also validate that the estimated output doesn't exceed the wallet's remaining allowance.
  const remainingAllowanceNum = Number(formatEther(remainingAllowance));
  const exceedsLimit = effectiveSide === "buy" && isLaunchpad && estOut > 0 && estOut > remainingAllowanceNum;
  const inputValid = amountWei > 0n && amountWei <= inputBal && !exceedsLimit;

  // Max spendable USDC to buy exactly remainingAllowance tokens (invert estimateTokensOut).
  const maxRaiseForLimit = price > 0 ? (remainingAllowanceNum * price) / 0.9985 : 0;

  async function wait(hash: Hex) {
    if (!publicClient) throw new Error("No RPC client available. Reload and try again.");
    const r = await publicClient.waitForTransactionReceipt({hash});
    if (r.status !== "success") throw new Error("Transaction reverted on-chain");
  }
  async function refetch() {
    await Promise.all([refetchLp(), refetchUser(), refetchBought()]);
  }

  async function mintRaise() {
    if (!address) return;
    try {
      setBusy("Minting test " + RAISE_TOKEN_SYMBOL + "…");
      await wait(
        await writeContractAsync({address: record.raiseToken, abi: TEST_ERC20_ABI, functionName: "mint", args: [address, MINT_AMOUNT]})
      );
      toast.success(`Minted test ${RAISE_TOKEN_SYMBOL}`, {description: "Use it to buy on the curve."});
      await refetch();
    } catch (e) {
      toast.error("Mint failed", {description: msg(e)});
    } finally {
      setBusy(null);
    }
  }

  async function trade() {
    if (!address || !inputValid) return;
    const spendToken = effectiveSide === "buy" ? record.raiseToken : record.ipToken;
    const allowance = effectiveSide === "buy" ? allowRaise : allowIp;
    try {
      if (allowance < amountWei) {
        setBusy("Approving…");
        await wait(
          await writeContractAsync({address: spendToken, abi: TEST_ERC20_ABI, functionName: "approve", args: [V1_SWAP_ROUTER_ADDRESS, MAX_UINT256]})
        );
      }
      setBusy(effectiveSide === "buy" ? "Buying on curve…" : "Selling…");
      const txHash = await writeContractAsync({
        address: V1_SWAP_ROUTER_ADDRESS,
        abi: POOL_SWAP_TEST_ABI,
        functionName: "swap",
        args: [key, buildCurveSwapParams(ipIsToken0, effectiveSide, amountWei), SWAP_TEST_SETTINGS, "0x"],
      });
      await wait(txHash);
      addTrade({
        attestationId: pool.id as Hex,
        side: effectiveSide,
        title: pool.title,
        amountIn: amount,
        amountInLabel: inputLabel,
        txHash,
        at: Date.now(),
      });
      toast.success(effectiveSide === "buy" ? "Bought on the curve" : "Sold", {
        description: `${amount} ${inputLabel} swapped on-chain.`,
      });
      setAmount("");
      await refetch();
    } catch (e) {
      toast.error("Swap failed", {description: msg(e)});
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">Bonding curve</h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            isGraduated ? "bg-risk-low/15 text-risk-low" : "bg-amber-500/15 text-amber-500"
          )}
        >
          {isGraduated ? "Graduated" : isLaunchpad ? "Launchpad (buy-only)" : "Inactive"}
        </span>
      </div>

      {/* Curve progress */}
      {cfg && isLaunchpad && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Raised</span>
            <span className="font-mono text-ink">
              {(+formatEther(cfg.fundsRaised)).toFixed(0)} / {(+formatEther(cfg.hardCap)).toFixed(0)} {RAISE_TOKEN_SYMBOL}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-primary-ink transition-all" style={{width: `${(progress * 100).toFixed(1)}%`}} />
          </div>
          <p className="mt-1 text-[11px] text-faint">
            At 100% the curve graduates into a locked pool. Current price ≈ {price >= 1 ? price.toFixed(2) : price.toFixed(6)} {RAISE_TOKEN_SYMBOL}/token.
          </p>
        </div>
      )}

      {cfg && isGraduated && (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-risk-low/30 bg-risk-low/5 p-3 text-xs text-risk-low">
          <CheckCircle2 className="size-4 shrink-0" />
          Graduated: liquidity is locked permanently and trading is open both ways.
        </p>
      )}

      {cfg && phase === LaunchpadPhase.INACTIVE && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500/90">
          This bonding curve is not active on-chain, so it can&apos;t be traded yet. The launch
          likely did not complete. If you are the creator, re-open it from your{" "}
          <Link href="/creator" className="underline">
            Creator Studio
          </Link>
          .
        </p>
      )}

      <dl className="mt-4 flex flex-col gap-2 text-sm">
        <Row label={`Price (${RAISE_TOKEN_SYMBOL}/token)`} value={price > 0 ? (price >= 1 ? price.toFixed(2) : price.toFixed(6)) : "—"} />
        {isConnected && (
          <>
            <Row label={`Your ${ipLabel}`} value={(+formatEther(balIp)).toFixed(2)} subtle />
            <Row label={`Your ${RAISE_TOKEN_SYMBOL}`} value={(+formatEther(balRaise)).toFixed(2)} subtle />
          </>
        )}
        {isLaunchpad && maxBuyTokens > 0n && (
          <Row
            label="Buy limit / wallet"
            value={`${remainingAllowanceNum.toFixed(2)} ${ipLabel} remaining`}
            subtle
          />
        )}
      </dl>

      {/* Buy/Sell toggle (sell only after graduation) */}
      {isGraduated && (
        <div className="mt-5 flex items-center gap-1 rounded-lg border border-border bg-bg p-0.5">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              disabled={!!busy}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                side === s
                  ? s === "buy"
                    ? "bg-risk-low/15 text-risk-low"
                    : "bg-risk-high/10 text-risk-high"
                  : "text-muted hover:text-ink"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {isConnected ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="flex items-center justify-between text-xs text-muted">
              <span>You pay ({inputLabel})</span>
              <button
                className="text-primary-ink hover:underline"
                onClick={() => {
                  if (effectiveSide === "buy" && isLaunchpad && maxRaiseForLimit > 0) {
                    // Cap to the USDC needed for the remaining per-wallet limit.
                    const cappedUsdc = Math.min(+formatEther(balRaise), maxRaiseForLimit);
                    setAmount(cappedUsdc.toFixed(6));
                  } else {
                    setAmount(formatEther(inputBal));
                  }
                }}
                disabled={!!busy}
              >
                Max:{" "}
                {effectiveSide === "buy" && isLaunchpad && maxRaiseForLimit > 0
                  ? `${Math.min(+formatEther(balRaise), maxRaiseForLimit).toFixed(2)} ${RAISE_TOKEN_SYMBOL}`
                  : `${(+formatEther(inputBal)).toFixed(2)}`}
              </button>
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              disabled={!!busy}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-primary-ink focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2 text-sm">
            <span className="text-muted">You receive (est.)</span>
            <span className="font-mono tabular-nums text-ink">
              {estOut > 0 ? estOut.toFixed(4) : "0.0"} {estOutLabel}
            </span>
          </div>

          {effectiveSide === "buy" && (
            <Button variant="secondary" className="w-full" onClick={mintRaise} disabled={!!busy}>
              {busy?.startsWith("Minting") ? <Loader2 className="size-4 animate-spin" /> : <Coins className="size-4" />}
              Mint test {RAISE_TOKEN_SYMBOL}
            </Button>
          )}

          <Button className="w-full" onClick={trade} disabled={!!busy || !inputValid || phase === LaunchpadPhase.INACTIVE}>
            {busy === "Buying on curve…" || busy === "Selling…" || busy === "Approving…" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <TrendingUp className="size-4" strokeWidth={2.25} />
            )}
            {effectiveSide === "buy" ? `Buy ${ipLabel}` : `Sell ${ipLabel}`}
          </Button>

          {amountWei > inputBal && amountWei > 0n && (
            <p className="text-center text-xs text-risk-high">
              Not enough {inputLabel}.{effectiveSide === "buy" ? ` Mint test ${RAISE_TOKEN_SYMBOL} first.` : ""}
            </p>
          )}
          {exceedsLimit && (
            <p className="text-center text-xs text-risk-high">
              Exceeds per-wallet limit. Max {remainingAllowanceNum.toFixed(2)} {ipLabel} remaining this wallet.
            </p>
          )}
          {busy && <p className="text-center text-xs text-muted">{busy}</p>}
        </div>
      ) : (
        <div className="mt-4 [&_button]:w-full">
          <ConnectButton.Custom>
            {({openConnectModal}) => (
              <Button className="w-full" size="lg" onClick={openConnectModal}>
                Connect wallet to trade
              </Button>
            )}
          </ConnectButton.Custom>
        </div>
      )}
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
