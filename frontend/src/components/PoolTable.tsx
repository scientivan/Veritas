"use client";

import {useMemo, useState} from "react";
import Link from "next/link";
import {Search, Radio, Loader2} from "lucide-react";
import {dynamicFeeBps} from "@/lib/drs";
import {hasLivePool, getLivePoolList} from "@/lib/livePools";
import {useAttestations} from "@/hooks/useAttestations";
import {useLivePoolTvl} from "@/hooks/useLivePoolTvl";
import {RiskPill} from "./RiskPill";
import {formatFeeBps, formatPct, formatUsd, cn} from "@/lib/utils";
import type {Pool} from "@/lib/types";

type SortKey = "drs" | "tvl" | "apy";
const SORTS: {key: SortKey; label: string}[] = [
  {key: "drs", label: "Risk"},
  {key: "tvl", label: "TVL"},
  {key: "apy", label: "APY"},
];

export function PoolTable() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("tvl");
  const {pools, isLive, isLoading} = useAttestations();
  const tvlByAttestation = useLivePoolTvl(getLivePoolList());

  // Merge real (assumed-price) TVL into the pooled attestations.
  const withTvl = useMemo<Pool[]>(
    () =>
      pools.map((p) => {
        const tvl = tvlByAttestation.get(p.id.toLowerCase());
        return tvl !== undefined && tvl !== null ? {...p, tvlUsd: tvl} : p;
      }),
    [pools, tvlByAttestation]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = withTvl.filter(
      (p) => !q || p.title.toLowerCase().includes(q) || p.creator.toLowerCase().includes(q)
    );
    // null sorts last (treated as -1).
    const val = (p: Pool) => {
      const v = sort === "drs" ? p.drs : sort === "tvl" ? p.tvlUsd : p.apyPct;
      return v ?? -1;
    };
    return [...filtered].sort((a, b) => val(b) - val(a));
  }, [query, sort, withTvl]);

  return (
    <div>
      {isLive && (
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
          Fetching on-chain attestations…
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
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                sort === s.key ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-border">
        {/* Header (desktop) */}
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
                <span
                  className="size-10 shrink-0 rounded-lg ring-1 ring-inset ring-white/10"
                  style={{background: p.swatch}}
                  aria-hidden
                />
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
                  <div className="truncate text-xs text-muted">
                    {p.medium} · {p.creator}
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
                <span className="font-mono text-sm tnum text-ink">
                  {p.gated ? "n/a" : formatFeeBps(dynamicFeeBps(p.drs, p.baseFeeBps, p.maxFeeBps))}
                </span>
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
                <span className="flex flex-col md:items-end">
                  <span className="font-mono text-sm tnum text-muted">-</span>
                  <span className="text-[10px] text-faint">n/a on testnet</span>
                </span>
              </Cell>
            </Link>
          ))}
        </div>
      </div>
    </div>
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
