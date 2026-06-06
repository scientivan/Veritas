"use client";

import {useState} from "react";
import {useAccount, usePublicClient, useReadContracts, useWriteContract} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {toast} from "sonner";
import {Loader2, Coins, ArrowDownUp} from "lucide-react";
import {formatEther, parseEther, type Hex} from "viem";
import type {Pool} from "@/lib/types";
import type {LivePool} from "@/lib/livePools";
import {Button} from "./ui/Button";
import {STATE_VIEW_ADDRESS, V1_SWAP_ROUTER_ADDRESS} from "@/lib/contracts";
import {TEST_ERC20_ABI, MINT_AMOUNT, MAX_UINT256, POOL_MANAGER_ABI_SLICE} from "@/lib/liquidity";
import {
  POOL_SWAP_TEST_ABI,
  SWAP_TEST_SETTINGS,
  buildSwapKey,
  buildSwapParams,
  priceToken1PerToken0,
} from "@/lib/swap";
import {useTradeHistory} from "@/hooks/useTradeHistory";
import {cn} from "@/lib/utils";

type Side = "buy" | "sell";

export function TradePanel({pool, livePool}: {pool: Pool; livePool: LivePool}) {
  const {address, isConnected} = useAccount();
  const publicClient = usePublicClient();
  const {writeContractAsync} = useWriteContract();
  const {addTrade} = useTradeHistory(address);

  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const ethLabel = "ETH";
  const ipLabel = pool.title;

  const {data: poolData, refetch: refetchPool} = useReadContracts({
    contracts: [
      {
        address: STATE_VIEW_ADDRESS,
        abi: POOL_MANAGER_ABI_SLICE,
        functionName: "getSlot0" as const,
        args: [livePool.poolId as Hex],
      },
    ],
  });

  const {data: userData, refetch: refetchUser} = useReadContracts({
    contracts: address
      ? [
          {address: livePool.token0, abi: TEST_ERC20_ABI, functionName: "balanceOf" as const, args: [address]},
          {address: livePool.token1, abi: TEST_ERC20_ABI, functionName: "balanceOf" as const, args: [address]},
          {address: livePool.token0, abi: TEST_ERC20_ABI, functionName: "allowance" as const, args: [address, V1_SWAP_ROUTER_ADDRESS]},
          {address: livePool.token1, abi: TEST_ERC20_ABI, functionName: "allowance" as const, args: [address, V1_SWAP_ROUTER_ADDRESS]},
        ]
      : [],
    query: {enabled: !!address},
  });

  const slot0 = poolData?.[0]?.result as readonly [bigint, number, number, number] | undefined;
  const sqrtPriceX96 = slot0?.[0] ?? 0n;
  const priceEth = priceToken1PerToken0(sqrtPriceX96); // quote (token1) per 1 IP (token0)

  const balIp = (userData?.[0]?.result as bigint | undefined) ?? 0n; // token0
  const balEth = (userData?.[1]?.result as bigint | undefined) ?? 0n; // token1
  const allowIp = (userData?.[2]?.result as bigint | undefined) ?? 0n;
  const allowEth = (userData?.[3]?.result as bigint | undefined) ?? 0n;

  let amountWei = 0n;
  try {
    if (amount) amountWei = parseEther(amount);
  } catch {
    // invalid decimal
  }
  const amountNum = parseFloat(amount) || 0;

  // Estimated output (display only). Buy: spend ETH → get IP = ethIn / price.
  // Sell: spend IP → get ETH = ipIn * price.
  const estOut =
    side === "buy"
      ? priceEth > 0
        ? amountNum / priceEth
        : 0
      : amountNum * priceEth;
  const estOutLabel = side === "buy" ? ipLabel : ethLabel;

  const inputLabel = side === "buy" ? ethLabel : ipLabel;
  const inputBal = side === "buy" ? balEth : balIp;
  const inputValid = amountWei > 0n && amountWei <= inputBal;

  async function wait(hash: Hex) {
    const r = await publicClient?.waitForTransactionReceipt({hash});
    if (r && r.status !== "success") throw new Error("Transaction reverted on-chain");
  }

  async function refetch() {
    await Promise.all([refetchPool(), refetchUser()]);
  }

  async function mintTokens() {
    if (!address) return;
    try {
      setBusy("Minting test tokens…");
      await wait(
        await writeContractAsync({address: livePool.token1, abi: TEST_ERC20_ABI, functionName: "mint", args: [address, MINT_AMOUNT]})
      );
      await wait(
        await writeContractAsync({address: livePool.token0, abi: TEST_ERC20_ABI, functionName: "mint", args: [address, MINT_AMOUNT]})
      );
      toast.success("Minted test tokens", {description: "10 000 ETH-equivalent + IP tokens for trading."});
      await refetch();
    } catch (e) {
      toast.error("Mint failed", {description: msg(e)});
    } finally {
      setBusy(null);
    }
  }

  async function trade() {
    if (!address || !inputValid) return;
    const buy = side === "buy";
    const spendToken = buy ? livePool.token1 : livePool.token0;
    const allowance = buy ? allowEth : allowIp;
    try {
      if (allowance < amountWei) {
        setBusy("Approving…");
        await wait(
          await writeContractAsync({
            address: spendToken,
            abi: TEST_ERC20_ABI,
            functionName: "approve",
            args: [V1_SWAP_ROUTER_ADDRESS, MAX_UINT256],
          })
        );
      }
      setBusy(buy ? "Buying…" : "Selling…");
      const txHash = await writeContractAsync({
        address: V1_SWAP_ROUTER_ADDRESS,
        abi: POOL_SWAP_TEST_ABI,
        functionName: "swap",
        args: [buildSwapKey(livePool), buildSwapParams(buy, amountWei), SWAP_TEST_SETTINGS, "0x"],
      });
      await wait(txHash);
      addTrade({
        attestationId: pool.id as Hex,
        side,
        title: pool.title,
        amountIn: amount,
        amountInLabel: inputLabel,
        txHash,
        at: Date.now(),
      });
      toast.success(buy ? "Bought" : "Sold", {
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
      <h3 className="text-sm font-medium text-ink">Trade</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Real Uniswap v4 swaps on testnet, routed through the DRS-calibrated hook. Mint test tokens,
        then buy or sell — each is an on-chain transaction.
      </p>

      <dl className="mt-4 flex flex-col gap-2 text-sm">
        <Row
          label={`Price (${ethLabel}/token)`}
          value={sqrtPriceX96 > 0n ? (priceEth >= 1 ? priceEth.toFixed(2) : priceEth.toFixed(6)) : "—"}
        />
        {isConnected && (
          <>
            <Row label={`Your ${ipLabel}`} value={(+formatEther(balIp)).toFixed(2)} subtle />
            <Row label={`Your ${ethLabel}`} value={(+formatEther(balEth)).toFixed(2)} subtle />
          </>
        )}
      </dl>

      {/* Buy / Sell toggle */}
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

      {isConnected ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="flex items-center justify-between text-xs text-muted">
              <span>You pay ({inputLabel})</span>
              <button
                className="text-primary-ink hover:underline"
                onClick={() => setAmount(formatEther(inputBal))}
                disabled={!!busy}
              >
                Max: {(+formatEther(inputBal)).toFixed(2)}
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

          <div className="flex items-center justify-center text-muted">
            <ArrowDownUp className="size-4" />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2 text-sm">
            <span className="text-muted">You receive (est.)</span>
            <span className="font-mono tabular-nums text-ink">
              {estOut > 0 ? estOut.toFixed(4) : "0.0"} {estOutLabel}
            </span>
          </div>

          <Button variant="secondary" className="w-full" onClick={mintTokens} disabled={!!busy}>
            {busy === "Minting test tokens…" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Coins className="size-4" />
            )}
            Mint test tokens
          </Button>

          <Button
            className="w-full"
            onClick={trade}
            disabled={!!busy || !inputValid}
          >
            {busy === "Buying…" || busy === "Selling…" || busy === "Approving…" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {side === "buy" ? "Buy" : "Sell"} {ipLabel}
          </Button>

          {amountWei > inputBal && amountWei > 0n && (
            <p className="text-center text-xs text-risk-high">
              Not enough {inputLabel}. Mint test tokens first.
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
