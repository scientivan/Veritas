"use client";

import {useMemo} from "react";
import Link from "next/link";
import {useReadContracts} from "wagmi";
import {ArrowRight, Loader2, Store} from "lucide-react";
import type {Hex} from "viem";
import {useAttestations} from "@/hooks/useAttestations";
import {useLaunchpadPools} from "@/hooks/useLaunchpadPools";
import {getLivePool, hasLivePool} from "@/lib/livePools";
import {STATE_VIEW_ADDRESS, REGISTRY_ADDRESS, V1_HOOK_ADDRESS} from "@/lib/contracts";
import {POOL_MANAGER_ABI_SLICE} from "@/lib/liquidity";
import {REGISTRY_ABI, V1_HOOK_ABI} from "@/lib/abis";
import {priceToken1PerToken0} from "@/lib/swap";
import {curvePrice} from "@/lib/curve";
import {combineDrs, DRS_GATE} from "@/lib/drs";
import {poolImage, poolTitle} from "@/lib/poolMeta";
import {buildLaunchpadKey, computePoolId, decodeLaunchpads, LaunchpadPhase} from "@/lib/launchpad";
import {RiskPill} from "./RiskPill";

/** Quote-token amount per 1 IP token, formatted by magnitude. */
function fmtPrice(n: number): string {
  if (n === 0) return "0";
  if (n >= 1000) return n.toFixed(0);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(6);
}

function hueSwatch(seed: string): string {
  const h = parseInt(seed.slice(2, 8), 16) % 360;
  return `oklch(0.62 0.14 ${h})`;
}

interface Entry {
  id: Hex;
  title: string;
  creator: string;
  drs: number;
  swatch: string;
  img: string | null;
  priceLabel: string;
  badge: "pool" | "launchpad";
}

type AttRecord = {
  aiReplicabilityScore: number;
  offchainD: number;
  ipfsCid: string;
  owner: string;
};

export function CollectorMarketplace() {
  const {pools, isLoading} = useAttestations();
  const {launchpads} = useLaunchpadPools();

  const seeded = useMemo(() => pools.filter((p) => !p.gated && hasLivePool(p.id)), [pools]);

  // Live AMM price for each seeded pool.
  const {data: slots} = useReadContracts({
    contracts: seeded.map((p) => {
      const lp = getLivePool(p.id)!;
      return {
        address: STATE_VIEW_ADDRESS,
        abi: POOL_MANAGER_ABI_SLICE,
        functionName: "getSlot0" as const,
        args: [lp.poolId as Hex],
      };
    }),
    query: {enabled: seeded.length > 0},
  });

  // Attestation record (DRS) + curve state (price) for each opened launchpad.
  const {data: lpRecords} = useReadContracts({
    contracts: launchpads.map((l) => ({
      address: REGISTRY_ADDRESS as Hex,
      abi: REGISTRY_ABI,
      functionName: "getRecord" as const,
      args: [l.attestationId],
    })),
    query: {enabled: launchpads.length > 0},
  });
  const {data: lpCurves} = useReadContracts({
    // Recompute poolId from the current hook (a stored poolId may be from an older hook).
    contracts: launchpads.map((l) => ({
      address: V1_HOOK_ADDRESS as Hex,
      abi: V1_HOOK_ABI,
      functionName: "launchpads" as const,
      args: [computePoolId(buildLaunchpadKey(l.ipToken).key)],
    })),
    query: {enabled: launchpads.length > 0},
  });

  const entries = useMemo<Entry[]>(() => {
    const byId = new Map<string, Entry>();

    seeded.forEach((p, i) => {
      const slot0 = slots?.[i]?.result as readonly [bigint, number, number, number] | undefined;
      const price = slot0?.[0] ? priceToken1PerToken0(slot0[0]) : null;
      byId.set(p.id.toLowerCase(), {
        id: p.id as Hex,
        title: p.title,
        creator: p.creator,
        drs: p.drs,
        swatch: p.swatch,
        img: poolImage(p.id),
        priceLabel: price != null ? fmtPrice(price) : "—",
        badge: "pool",
      });
    });

    launchpads.forEach((l, i) => {
      const rec = lpRecords?.[i]?.result as AttRecord | undefined;
      const curve = decodeLaunchpads(lpCurves?.[i]?.result as readonly unknown[] | undefined);
      if (!rec) return;
      // Hide launchpads that aren't actually active on-chain (e.g. a failed open).
      // While the curve read is still loading (undefined), show it optimistically.
      if (curve && Number(curve.phase) === LaunchpadPhase.INACTIVE) return;
      const drs = combineDrs(Number(rec.offchainD) / 10000, Number(rec.aiReplicabilityScore) / 10000);
      if (drs >= DRS_GATE) return; // shouldn't happen (gate enforced), but stay safe
      const price = curve ? curvePrice(curve.curveA, curve.curveB, curve.tokensSold) : null;
      byId.set(l.attestationId.toLowerCase(), {
        id: l.attestationId,
        title: l.tokenName || poolTitle(l.attestationId, rec.ipfsCid),
        creator: rec.owner ? rec.owner.slice(0, 6) + "…" + rec.owner.slice(-4) : "creator",
        drs,
        swatch: hueSwatch(l.attestationId),
        img: null,
        priceLabel: price != null ? fmtPrice(price) : "—",
        badge: "launchpad",
      });
    });

    return [...byId.values()];
  }, [seeded, slots, launchpads, lpRecords, lpCurves]);

  if (isLoading) {
    return (
      <div className="mt-8 flex items-center gap-2 rounded-2xl border border-border bg-surface p-10 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" />
        Loading the marketplace…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
        <Store className="size-8 text-muted" strokeWidth={1.5} />
        <p className="font-display text-lg font-semibold text-ink">No IP tokens listed yet</p>
        <p className="max-w-sm text-sm text-muted">
          When creators launch DRS-verified IP and open a bonding curve, their tokens appear here for
          you to collect and trade.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((e) => (
        <Link
          key={e.id}
          href={`/trade/${e.id}`}
          className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-border-strong"
        >
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-bg">
            {e.img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={e.img}
                alt={e.title}
                className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="size-full" style={{background: e.swatch}} />
            )}
            <div className="absolute left-3 top-3">
              <RiskPill drs={e.drs} gated={false} size="sm" />
            </div>
            <span
              className={
                e.badge === "launchpad"
                  ? "absolute right-3 top-3 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500"
                  : "absolute right-3 top-3 rounded-full bg-risk-low/15 px-2 py-0.5 text-[10px] font-medium text-risk-low"
              }
            >
              {e.badge === "launchpad" ? "Bonding curve" : "v4 pool"}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div>
              <p className="truncate font-display text-base font-semibold text-ink">{e.title}</p>
              <p className="text-xs text-muted">by {e.creator}</p>
            </div>
            <div className="mt-auto flex items-end justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Price / token</p>
                <p className="font-mono text-sm font-semibold text-ink tabular-nums">{e.priceLabel}</p>
              </div>
              <span className="flex items-center gap-1 text-xs font-medium text-primary-ink">
                Trade
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} />
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
