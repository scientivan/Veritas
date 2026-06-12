import type {Metadata} from "next";
import {notFound} from "next/navigation";
import Link from "next/link";
import {ArrowLeft, ExternalLink, ShieldCheck} from "lucide-react";
import {Nav} from "@/components/Nav";
import {Footer} from "@/components/Footer";
import {DRSGauge} from "@/components/DRSGauge";
import {RiskPill} from "@/components/RiskPill";
import {TradeArea} from "@/components/TradeArea";
import {getOnChainPool} from "@/lib/serverRegistry";
import {getLivePool} from "@/lib/livePools";
import {poolImage} from "@/lib/poolMeta";
import {dynamicFeeBps} from "@/lib/drs";
import {formatFeeBps, formatPct, shortenAddress} from "@/lib/utils";

function isAttestationId(id: string): id is `0x${string}` {
  return id.startsWith("0x") && id.length === 66;
}

/** Optional `?token=0x…` that disambiguates which token of a shared attestation was clicked. */
function tokenParam(sp: Record<string, string | string[] | undefined>): `0x${string}` | undefined {
  const v = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{id: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const {id} = await params;
  const token = tokenParam(await searchParams);
  const pool = isAttestationId(id) ? await getOnChainPool(id, token) : undefined;
  return {title: pool ? `Trade ${pool.title} · Veritas` : "Trade · Veritas"};
}

export default async function TradePage({
  params,
  searchParams,
}: {
  params: Promise<{id: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const {id} = await params;
  if (!isAttestationId(id)) notFound();
  const token = tokenParam(await searchParams);
  const pool = await getOnChainPool(id, token);
  if (!pool) notFound();

  const livePool = getLivePool(id);
  const img = pool.imageUrl ?? poolImage(id);

  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-5 py-10">
          <Link
            href="/market"
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" strokeWidth={2.25} />
            Marketplace
          </Link>

          <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            {/* Left: artwork + provenance */}
            <div className="flex flex-col gap-6">
              <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="relative aspect-[16/10] w-full bg-bg">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={pool.title}
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : (
                    <div className="size-full" style={{background: pool.swatch}} />
                  )}
                  <div className="absolute left-4 top-4">
                    <RiskPill drs={pool.drs} gated={pool.gated} size="sm" />
                  </div>
                </div>
                <div className="flex items-start justify-between gap-4 p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="font-display text-2xl font-semibold text-ink">{pool.title}</h1>
                      {pool.tokenSymbol && (
                        <span className="rounded-md border border-border bg-surface/60 px-1.5 py-0.5 font-mono text-xs text-muted">
                          {pool.tokenSymbol}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted">
                      by{" "}
                      <Link
                        href={`/creator/${pool.creatorAddress}`}
                        className="text-primary-ink hover:underline"
                      >
                        {shortenAddress(pool.creatorAddress, 6)}
                      </Link>
                    </p>
                  </div>
                  <Link
                    href={`/pool/${id}`}
                    className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
                  >
                    Pool details
                    <ExternalLink className="size-3.5" />
                  </Link>
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface/40 p-6 sm:flex-row sm:items-center sm:gap-8">
                <DRSGauge drs={pool.drs} d={pool.d} a={pool.a} gated={pool.gated} className="mx-auto shrink-0" />
                <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <Field label="DRS" value={formatPct(pool.drs)} />
                  <Field label="LP fee" value={formatFeeBps(dynamicFeeBps(pool.drs, pool.baseFeeBps, pool.maxFeeBps))} />
                  <Field label="Duplicates" value={String(pool.duplicateCount)} />
                  <Field
                    label="Verified"
                    value={pool.gated ? "Gated" : "Original"}
                    accent={pool.gated ? "high" : "low"}
                  />
                </dl>
              </div>

              <p className="flex items-start gap-2 rounded-xl border border-border bg-surface/40 p-4 text-xs leading-relaxed text-muted">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-risk-low" />
                This token is backed by a DRS-verified attestation. The pool fee rises automatically
                if the work is copied or AI-replicated after launch, protecting holders and LPs.
              </p>
            </div>

            {/* Right: trade */}
            <div className="lg:sticky lg:top-20">
              <TradeArea pool={pool} seededLivePool={livePool ?? null} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Field({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "low" | "high";
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd
        className={
          accent === "low"
            ? "mt-0.5 text-sm font-semibold text-risk-low"
            : accent === "high"
              ? "mt-0.5 text-sm font-semibold text-risk-high"
              : "mt-0.5 text-sm font-semibold text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}
