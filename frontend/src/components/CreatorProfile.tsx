"use client";

import {useMemo} from "react";
import Link from "next/link";
import {Loader2, Palette, ArrowRight} from "lucide-react";
import {useAttestations} from "@/hooks/useAttestations";
import {hasLivePool} from "@/lib/livePools";
import {poolImage} from "@/lib/poolMeta";
import {RiskPill} from "./RiskPill";
import {shortenAddress} from "@/lib/utils";

export function CreatorProfile({address}: {address: string}) {
  const {pools, isLoading} = useAttestations();

  const works = useMemo(
    () => pools.filter((p) => p.creatorAddress.toLowerCase() === address.toLowerCase()),
    [pools, address]
  );

  const tradeable = works.filter((p) => !p.gated && hasLivePool(p.id));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary-ink">
          <Palette className="size-7" strokeWidth={2} />
        </span>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
            Creator {shortenAddress(address, 6)}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {works.length} attested work{works.length === 1 ? "" : "s"} · {tradeable.length}{" "}
            tradeable
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-10 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" />
          Loading this creator&apos;s work…
        </div>
      ) : works.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="font-display text-lg font-semibold text-ink">No attested works found</p>
          <p className="max-w-sm text-sm text-muted">
            This address has no DRS attestations in the indexed set yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {works.map((p) => {
            const img = poolImage(p.id);
            const canTrade = !p.gated && hasLivePool(p.id);
            return (
              <Link
                key={p.id}
                href={canTrade ? `/trade/${p.id}` : `/pool/${p.id}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-border-strong"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-bg">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={p.title}
                      className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="size-full" style={{background: p.swatch}} />
                  )}
                  <div className="absolute left-3 top-3">
                    <RiskPill drs={p.drs} gated={p.gated} size="sm" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 p-4">
                  <p className="truncate font-display text-base font-semibold text-ink">{p.title}</p>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary-ink">
                    {canTrade ? "Trade" : "View"}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
