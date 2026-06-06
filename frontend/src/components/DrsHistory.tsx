"use client";

import {useEffect, useState} from "react";
import {usePublicClient} from "wagmi";
import {parseAbiItem} from "viem";
import {REGISTRY_ADDRESS} from "@/lib/contracts";
import {tierForDrs, TIER_META, dynamicFeeBps} from "@/lib/drs";
import {formatFeeBps} from "@/lib/utils";
import type {Pool} from "@/lib/types";

type DrsPoint = {ts: number; drs: number};

const DILUTION_EVENT = parseAbiItem(
  "event DilutionIncremented(bytes32 indexed attestationId, uint32 newCount, uint16 newDrs)"
);

const W = 600;
const H = 170;
const PAD = 10;

export function DrsHistory({pool}: {pool: Pool}) {
  const publicClient = usePublicClient();
  const [points, setPoints] = useState<DrsPoint[] | null>(null);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;

    async function fetchEvents() {
      setScanning(true);
      const latest = await publicClient!.getBlockNumber();
      const fromBlock = latest > 9000n ? latest - 9000n : 0n;

      const logs = await publicClient!.getLogs({
        address: REGISTRY_ADDRESS,
        event: DILUTION_EVENT,
        args: {attestationId: pool.id as `0x${string}`},
        fromBlock,
        toBlock: "latest",
      });

      if (cancelled) return;

      // Fetch block timestamps in parallel for each event.
      const pts: DrsPoint[] = await Promise.all(
        logs.map(async (log) => {
          const block = await publicClient!.getBlock({blockNumber: log.blockNumber!});
          return {
            ts: Number(block.timestamp),
            drs: (log.args.newDrs as number) / 10000,
          };
        })
      );

      if (!cancelled) setPoints(pts);
    }

    fetchEvents()
      .catch(() => { if (!cancelled) setPoints([]); })
      .finally(() => { if (!cancelled) setScanning(false); });

    return () => { cancelled = true; };
  }, [publicClient, pool.id]);

  const tier = tierForDrs(pool.drs);
  const color = TIER_META[tier].cssVar;
  const gid = `drs-fill-${pool.id.slice(2, 10)}`;

  // Build chart series: attestation start + real events + current.
  // When no events, show a flat line at the current DRS.
  const now = Math.floor(Date.now() / 1000);
  // Estimate attestation time. attestedAt is seconds since epoch.
  const start = pool.attestedAt > 0 ? pool.attestedAt : now - 86400;

  const allPoints: DrsPoint[] = [
    {ts: start, drs: pool.a}, // initial DRS = A channel only (D=0 at attestation)
    ...(points ?? []),
    {ts: now, drs: pool.drs}, // current DRS
  ];

  // Deduplicate adjacent identical values and sort by time.
  const series = allPoints
    .sort((a, b) => a.ts - b.ts)
    .filter((p, i, arr) => i === 0 || p.drs !== arr[i - 1].drs || p.ts !== arr[i - 1].ts);

  const minTs = series[0].ts;
  const maxTs = series[series.length - 1].ts;
  const tRange = Math.max(maxTs - minTs, 1);

  const xy = series.map((p) => {
    const x = PAD + ((p.ts - minTs) / tRange) * (W - 2 * PAD);
    const y = H - PAD - p.drs * (H - 2 * PAD);
    return [x, y] as const;
  });

  // Step function: each point holds its value until the next.
  const stepPath = xy
    .map(([x, y], i) => {
      if (i === 0) return `M${x.toFixed(1)} ${y.toFixed(1)}`;
      const [px] = xy[i - 1];
      return `H${x.toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `${stepPath} L${(W - PAD).toFixed(1)} ${(H - PAD).toFixed(1)} L${PAD.toFixed(1)} ${(H - PAD).toFixed(1)} Z`;

  const [lastX, lastY] = xy[xy.length - 1];
  const guide = (v: number) => H - PAD - v * (H - 2 * PAD);

  const feeNow = formatFeeBps(dynamicFeeBps(pool.drs, pool.baseFeeBps, pool.maxFeeBps));
  const eventCount = points?.length ?? 0;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Dilution Risk Score history"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Tier threshold guides at 0.30 and 0.70 */}
        {[0.3, 0.7].map((v) => (
          <line
            key={v}
            x1={PAD}
            x2={W - PAD}
            y1={guide(v)}
            y2={guide(v)}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        ))}
        <path d={areaPath} fill={`url(#${gid})`} />
        <path
          d={stepPath}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Current value dot */}
        <circle cx={lastX} cy={lastY} r="6" fill="var(--bg)" />
        <circle cx={lastX} cy={lastY} r="3.5" fill={color} />
        {/* Mark each DRS change (dilution increment) with a dot */}
        {series.map((p, i) => {
          if (i === 0) return null;
          if (p.drs === series[i - 1].drs) return null;
          const [x, y] = xy[i];
          return (
            <circle key={i} cx={x} cy={y} r="3" fill={color} stroke="var(--bg)" strokeWidth="1.5" />
          );
        })}
      </svg>

      <div className="mt-3 flex items-center justify-between text-xs text-faint">
        <span>
          {scanning
            ? "Scanning chain…"
            : eventCount > 0
            ? `${eventCount} dilution event${eventCount > 1 ? "s" : ""} in last 14h`
            : "No dilution events in last 14h"}
        </span>
        <span>Current fee: {pool.gated ? "Gated" : feeNow}</span>
      </div>
    </div>
  );
}
