"use client";

import {useMemo, useState} from "react";
import Link from "next/link";
import {Search, Radio, Loader2} from "lucide-react";
import type {Hex} from "viem";
import {ExplorerLink} from "./ExplorerLink";
import {dynamicFeeBps, BASE_FEE_BPS, MAX_FEE_BPS} from "@/lib/drs";
import {hasLivePool, getLivePoolList} from "@/lib/livePools";
import {ASSUMED_ANNUAL_TURNOVER, poolImage} from "@/lib/poolMeta";
import {useAttestations} from "@/hooks/useAttestations";
import {useOnChainLaunchpads} from "@/hooks/useOnChainLaunchpads";
import {useLivePoolTvl} from "@/hooks/useLivePoolTvl";
import {RiskPill} from "./RiskPill";
import {formatFeeBps, formatPct, formatUsd, cn} from "@/lib/utils";
import {LaunchpadPhase} from "@/lib/launchpad";
import type {Pool} from "@/lib/types";

type SortKey = "drs" | "tvl" | "apy";
const SORTS: {key: SortKey; label: string}[] = [
  {key: "drs", label: "Risk"},
  {key: "tvl", label: "TVL"},
  {key: "apy", label: "APY"},
];

export function PoolTable({lpOnly = false}: {lpOnly?: boolean}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("tvl");
  const {pools: allPools, isLive, isLoading: attLoading} = useAttestations();
  const tvlByAttestation = useLivePoolTvl(getLivePoolList());
  const {entries: launchpadEntries, isLoading: launchpadLoading} = useOnChainLaunchpads();

  // For the lpOnly view: graduated on-chain launchpads that are not already in allPools.
  const graduatedPools = useMemo<Pool[]>(() => {
    if (!lpOnly) return [];
    const knownIds = new Set(allPools.map((p) => p.id.toLowerCase()));
    return launchpadEntries
      .filter(
        (e) =>
          e.phase === LaunchpadPhase.GRADUATED && !knownIds.has(e.attestationId.toLowerCase())
      )
      .map((e) => {
        const hue = parseInt(e.attestationId.slice(2, 6), 16) % 360;
        return {
          id: e.attestationId as Hex,
          title: e.tokenName || e.attestationId.slice(0, 8) + "…",
          medium: "Attested content",
          creator: e.royaltyReceiver.slice(0, 6) + "…" + e.royaltyReceiver.slice(-4),
          creatorAddress: e.royaltyReceiver,
          swatch: `oklch(0.62 0.14 ${hue})`,
          drs: e.drs,
          d: e.drs,
          a: 0,
          baseFeeBps: BASE_FEE_BPS,
          maxFeeBps: MAX_FEE_BPS,
          gated: false,
          tvlUsd: null,
          apyPct: null,
          duplicateCount: 0,
          living: false,
          ipfsCid: e.tokenURI,
          pHash: "0x",
          attestedAt: 0,
        } satisfies Pool;
      });
  }, [lpOnly, launchpadEntries, allPools]);

  const pools = useMemo(
    () => (lpOnly ? graduatedPools : allPools),
    [allPools, lpOnly, graduatedPools]
  );

  const isLoading = lpOnly ? launchpadLoading : attLoading;

  // Merge real (assumed-price) TVL into the pooled attestations, plus a labelled
  // APY estimate derived from the live DRS-calibrated fee (testnet has no volume).
  const withTvl = useMemo<Pool[]>(
    () =>
      pools.map((p) => {
        const tvl = tvlByAttestation.get(p.id.toLowerCase());
        if (tvl === undefined || tvl === null) return p;
        const apyPct = p.gated
          ? null
          : (dynamicFeeBps(p.drs, p.baseFeeBps, p.maxFeeBps) / 10000) * ASSUMED_ANNUAL_TURNOVER;
        return {...p, tvlUsd: tvl, apyPct};
      }),
    [pools, tvlByAttestation]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = withTvl.filter(
      (p) => !q || p.title.toLowerCase().includes(q) || p.creator.toLowerCase().includes(q)
    );
    const val = (p: Pool) => {
      const v = sort === "drs" ? p.drs : sort === "tvl" ? p.tvlUsd : p.apyPct;
      return v ?? -1;
    };
    return [...filtered].sort((a, b) => val(b) - val(a));
  }, [query, sort, withTvl]);

  return (
    <div>
      {isLive && !lpOnly && (
        <div className="mb-4 flex items-center gap-2 text-xs text-primary-ink">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-ink opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          Reading live from Unichain Sepolia registry
        </div>
      )}
      {isLoading && (
        <div className="mb-4 flex items-center gap-2 text-xs text-muted">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {lpOnly ? "Fetching graduated pools…" : "Fetching on-chain attestations…"}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search content or creator"
            className="h-10 w-full rounded-lg border border-border bg-surface/50 pl-9 pr-3 text-sm text-ink placeholder:text-faint focus-visible:border-border-strong"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface/50 p-1">
          <span className="px-2 text-xs text-faint">Sort</span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={cn(
                "relative rounded-md px-2.5 py-1 text-xs font-semibold transition-all duration-200",
                sort === s.key
                  ? "bg-primary/15 text-primary-ink shadow-[0_0_0_1px_var(--color-primary-ink)/20]"
                  : "text-muted hover:bg-surface/80 hover:text-ink"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!isLoading && rows.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted">
          {lpOnly
            ? "No graduated pools yet. When a bonding curve reaches its hard cap, the pool graduates and appears here."
            : "No pools match your search."}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-xl border border-border">
          <div className="hidden grid-cols-[2.4fr_1.2fr_1fr_1fr_0.8fr] gap-4 border-b border-border bg-surface/40 px-4 py-2.5 text-[11px] uppercase tracking-wider text-faint md:grid">
            <span>Content</span>
            <span>Dilution risk</span>
            <span className="text-right">Fee</span>
            <span className="text-right">TVL</span>
            <span className="text-right">APY</span>
          </div>

          <div className="divide-y divide-border">
            {rows.map((p) => (
              <Link
                key={p.id}
                href={`/pool/${p.id}`}
                className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-surface/60 md:grid-cols-[2.4fr_1.2fr_1fr_1fr_0.8fr] md:items-center md:py-3.5"
              >
                <div className="col-span-2 flex items-center gap-3 md:col-span-1">
                  <Thumbnail src={poolImage(p.id)} swatch={p.swatch} alt={p.title} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-ink">{p.title}</span>
                      {p.living && (
                        <Radio className="size-3.5 shrink-0 text-primary-ink" strokeWidth={2.25} aria-label="Live DRS" />
                      )}
                      {hasLivePool(p.id) && (
                        <span className="shrink-0 rounded-full border border-risk-low/40 bg-risk-low/10 px-1.5 py-0.5 text-[10px] font-medium text-risk-low">
                          v4 pool
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono text-xs text-muted">
                      by{" "}
                      <span
                        onClick={(e) => e.preventDefault()}
                        onClickCapture={(e) => e.stopPropagation()}
                      >
                        <ExplorerLink
                          value={p.creatorAddress}
                          type="address"
                          prefixChars={4}
                          suffixChars={4}
                          className="text-muted hover:text-ink"
                        />
                      </span>
                      {" · "}
                      {p.id.slice(0, 6)}…{p.id.slice(-4)}
                    </div>
                  </div>
                </div>

                <Cell label="Risk">
                  <div className="flex items-center gap-2">
                    <RiskPill drs={p.drs} gated={p.gated} size="sm" />
                    <span className="font-mono text-xs tnum text-muted">{formatPct(p.drs)}</span>
                  </div>
                </Cell>
                <Cell label="Fee" right>
                  {p.gated ? (
                    <span className="font-mono text-sm text-risk-high">Gated</span>
                  ) : (
                    <span className="font-mono text-sm tnum text-ink">
                      {formatFeeBps(dynamicFeeBps(p.drs, p.baseFeeBps, p.maxFeeBps))}
                    </span>
                  )}
                </Cell>
                <Cell label="TVL" right>
                  {p.tvlUsd !== null ? (
                    <span className="flex flex-col md:items-end">
                      <span className="font-mono text-sm tnum text-ink">{formatUsd(p.tvlUsd)}</span>
                      <span className="text-[10px] text-faint">sim.</span>
                    </span>
                  ) : (
                    <span className="font-mono text-sm tnum text-muted">-</span>
                  )}
                </Cell>
                <Cell label="APY" right>
                  {p.apyPct !== null ? (
                    <span className="flex flex-col md:items-end">
                      <span className="font-mono text-sm tnum text-ink">{p.apyPct.toFixed(1)}%</span>
                      <span className="text-[10px] text-faint">est.</span>
                    </span>
                  ) : (
                    <span className="font-mono text-sm tnum text-muted">-</span>
                  )}
                </Cell>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Thumbnail({src, swatch, alt}: {src: string | null; swatch: string; alt: string}) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <span
        className="size-10 shrink-0 rounded-lg ring-1 ring-inset ring-white/10"
        style={{background: swatch}}
        aria-hidden
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErr(true)}
      className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-inset ring-white/10"
    />
  );
}

function Cell({label, right, children}: {label: string; right?: boolean; children: React.ReactNode}) {
  return (
    <div className={cn("flex flex-col gap-1", right && "md:items-end")}>
      <span className="text-[11px] uppercase tracking-wider text-faint md:hidden">{label}</span>
      {children}
    </div>
  );
}
