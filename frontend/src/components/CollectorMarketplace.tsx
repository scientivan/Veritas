"use client";

import {useMemo, useState} from "react";
import Link from "next/link";
import {ArrowRight, Loader2, Store} from "lucide-react";
import {useOnChainLaunchpads} from "@/hooks/useOnChainLaunchpads";
import {LaunchpadPhase} from "@/lib/launchpad";
import {curvePrice} from "@/lib/curve";
import {resolveTokenImage} from "@/lib/poolMeta";
import {RiskPill} from "./RiskPill";

/** Card artwork: the real token image when available, falling back to a swatch
 *  (also used when the image fails to load). */
function CardArt({src, swatch, alt}: {src: string | null; swatch: string; alt: string}) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return <div className="size-full" style={{background: swatch}} aria-hidden />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErr(true)}
      className="size-full object-cover"
    />
  );
}

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

export function CollectorMarketplace() {
  const {entries, isLoading} = useOnChainLaunchpads();

  const listedEntries = useMemo(
    () => entries.filter((e) => e.phase !== LaunchpadPhase.INACTIVE),
    [entries]
  );

  if (isLoading) {
    return (
      <div className="mt-8 flex items-center gap-2 rounded-2xl border border-border bg-surface p-10 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" />
        Loading the marketplace…
      </div>
    );
  }

  if (listedEntries.length === 0) {
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
      {listedEntries.map((e) => {
        const isGraduated = e.phase === LaunchpadPhase.GRADUATED;
        const price =
          !isGraduated && e.curveA > 0n
            ? curvePrice(e.curveA, e.curveB, e.tokensSold)
            : null;
        const priceLabel = price != null ? fmtPrice(price) : "—";
        const badge = isGraduated ? "pool" : "launchpad";
        // Pass the token so the detail page resolves THIS token (an attestation
        // can back several distinct tokens).
        const base = isGraduated ? `/pool/${e.attestationId}` : `/trade/${e.attestationId}`;
        const href = `${base}?token=${e.tokenAddress}`;
        const title = e.tokenName || e.attestationId.slice(0, 8) + "…";
        const creator =
          e.royaltyReceiver.slice(0, 6) + "…" + e.royaltyReceiver.slice(-4);
        const img = resolveTokenImage({attestationId: e.attestationId, tokenURI: e.tokenURI});

        return (
          <Link
            key={e.tokenAddress}
            href={href}
            className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-border-strong"
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-bg">
              <CardArt src={img} swatch={hueSwatch(e.attestationId)} alt={title} />
              <div className="absolute left-3 top-3">
                <RiskPill drs={e.drs} gated={false} size="sm" />
              </div>
              <span
                className={
                  badge === "launchpad"
                    ? "absolute right-3 top-3 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500"
                    : "absolute right-3 top-3 rounded-full bg-risk-low/15 px-2 py-0.5 text-[10px] font-medium text-risk-low"
                }
              >
                {badge === "launchpad" ? "Bonding curve" : "v4 pool"}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div>
                <p className="truncate font-display text-base font-semibold text-ink">{title}</p>
                <p className="text-xs text-muted">by {creator}</p>
              </div>
              <div className="mt-auto flex items-end justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted">Price / token</p>
                  <p className="font-mono text-sm font-semibold text-ink tabular-nums">{priceLabel}</p>
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-primary-ink">
                  {badge === "pool" ? "View pool" : "Trade"}
                  <ArrowRight
                    className="size-3.5 transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2.25}
                  />
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
