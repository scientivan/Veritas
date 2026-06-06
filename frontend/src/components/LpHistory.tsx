"use client";

import {useEffect, useState} from "react";
import {usePublicClient} from "wagmi";
import {parseAbiItem, formatEther} from "viem";
import {POOL_MANAGER_ADDRESS} from "@/lib/contracts";
import {getLivePool} from "@/lib/livePools";
import {ExplorerLink} from "./ExplorerLink";
import type {Pool} from "@/lib/types";

type LpEvent = {
  blockNumber: bigint;
  ageSeconds: number;
  action: "Add" | "Remove";
  liquidityAbs: bigint;
  txHash: `0x${string}`;
};

const MODIFY_LIQUIDITY_EVENT = parseAbiItem(
  "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)"
);

function fmtAge(secs: number): string {
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export function LpHistory({pool}: {pool: Pool}) {
  const publicClient = usePublicClient();
  const [events, setEvents] = useState<LpEvent[] | null>(null);
  const [scanning, setScanning] = useState(true);

  const livePool = getLivePool(pool.id);

  useEffect(() => {
    if (!publicClient || !livePool) {
      setScanning(false);
      return;
    }
    let cancelled = false;

    async function fetchEvents() {
      setScanning(true);
      const latest = await publicClient!.getBlockNumber();
      const fromBlock = latest > 9000n ? latest - 9000n : 0n;

      const logs = await publicClient!.getLogs({
        address: POOL_MANAGER_ADDRESS,
        event: MODIFY_LIQUIDITY_EVENT,
        args: {id: livePool!.poolId as `0x${string}`},
        fromBlock,
        toBlock: "latest",
      });

      if (cancelled) return;

      // Approximate age from block number (Unichain ~2s blocks).
      const evts: LpEvent[] = logs
        .slice()
        .reverse()
        .map((log) => {
          const blockDelta = Number(latest - (log.blockNumber ?? latest));
          const ageSeconds = blockDelta * 2;
          const delta = log.args.liquidityDelta as bigint;
          return {
            blockNumber: log.blockNumber ?? 0n,
            ageSeconds,
            action: delta >= 0n ? "Add" : "Remove",
            liquidityAbs: delta >= 0n ? delta : -delta,
            txHash: log.transactionHash!,
          };
        });

      if (!cancelled) setEvents(evts);
    }

    fetchEvents()
      .catch(() => { if (!cancelled) setEvents([]); })
      .finally(() => { if (!cancelled) setScanning(false); });

    return () => { cancelled = true; };
  }, [publicClient, livePool]);

  if (!livePool) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">LP activity</h3>
        <span className="text-xs text-faint">Last 14h · all LPs</span>
      </div>

      {scanning ? (
        <p className="mt-4 text-xs text-faint">Scanning chain…</p>
      ) : !events || events.length === 0 ? (
        <p className="mt-4 text-xs text-faint">No liquidity events in the last 14h.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-faint">
                <th className="pb-2 pr-3 font-normal">Age</th>
                <th className="pb-2 pr-3 font-normal">Action</th>
                <th className="pb-2 pr-3 font-normal text-right">Liquidity (L)</th>
                <th className="pb-2 font-normal">Tx</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3 font-mono text-faint">{fmtAge(e.ageSeconds)}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={
                        e.action === "Add"
                          ? "font-medium text-risk-low"
                          : "font-medium text-risk-high"
                      }
                    >
                      {e.action}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-ink">
                    {(+formatEther(e.liquidityAbs)).toFixed(4)}
                  </td>
                  <td className="py-2">
                    <ExplorerLink value={e.txHash} type="tx" className="font-mono text-faint hover:text-muted" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
