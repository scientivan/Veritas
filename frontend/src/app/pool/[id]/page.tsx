import type {Metadata} from "next";
import {notFound} from "next/navigation";
import Link from "next/link";
import {ArrowLeft, Radio, ExternalLink} from "lucide-react";
import {Nav} from "@/components/Nav";
import {Footer} from "@/components/Footer";
import {DRSGauge} from "@/components/DRSGauge";
import {DrsHistory} from "@/components/DrsHistory";
import {LpDashboard} from "@/components/LpDashboard";
import {LpHistory} from "@/components/LpHistory";
import {LivePoolCard} from "@/components/LivePoolCard";
import {Card} from "@/components/ui/Card";
import {getOnChainPool} from "@/lib/serverRegistry";
import {getLivePool, getLivePoolTvl} from "@/lib/livePools";
import {poolImage, ASSUMED_ANNUAL_TURNOVER} from "@/lib/poolMeta";
import {dynamicFeeBps} from "@/lib/drs";
import {formatFeeBps, formatPct, formatUsd, shortenAddress, shortenHash} from "@/lib/utils";
import {ExplorerLink} from "@/components/ExplorerLink";

function isAttestationId(id: string): id is `0x${string}` {
  return id.startsWith("0x") && id.length === 66;
}

/** A public gateway URL for a real IPFS CID, or undefined for placeholder CIDs. */
function ipfsGateway(ipfsCid: string): string | undefined {
  const cid = ipfsCid.replace(/^ipfs:\/\//, "");
  return /^(bafy|bafk|Qm)/i.test(cid) ? `https://gateway.pinata.cloud/ipfs/${cid}` : undefined;
}

export async function generateMetadata({params}: {params: Promise<{id: string}>}): Promise<Metadata> {
  const {id} = await params;
  const pool = isAttestationId(id) ? await getOnChainPool(id) : undefined;
  return {title: pool ? `${pool.title} · Veritas Protocol` : "Pool · Veritas Protocol"};
}

function fmtDate(ts: number) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export default async function PoolDetail({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  // Only bytes32 hex attestation IDs are valid; everything else is not found.
  if (!isAttestationId(id)) notFound();
  const pool = await getOnChainPool(id);
  if (!pool) notFound();

  const livePool = getLivePool(id);
  const tvl = livePool ? await getLivePoolTvl(livePool) : null;

  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <Link
            href="/pools"
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" strokeWidth={2.25} />
            All pools
          </Link>

          {/* Header */}
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
            <span
              className="size-16 shrink-0 overflow-hidden rounded-2xl ring-1 ring-inset ring-white/10"
              style={{background: pool.swatch}}
              aria-hidden
            >
              {poolImage(pool.id) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={poolImage(pool.id)!} alt={pool.title} className="size-full object-cover" />
              )}
            </span>
            <div className="flex-1">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{pool.title}</h1>
              <p className="mt-1 text-sm text-muted">
                {pool.medium} · by {pool.creator}{" "}
                <ExplorerLink
                  value={pool.creatorAddress}
                  type="address"
                  className="text-faint hover:text-muted"
                />
              </p>
            </div>
            {pool.living && (
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-surface/60 px-3 py-1.5 text-xs text-primary-ink">
                <Radio className="size-3.5" strokeWidth={2.25} aria-hidden />
                Live DRS via Reactive
              </div>
            )}
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            {/* Left: risk + history + provenance */}
            <div className="flex flex-col gap-6">
              <Card className="flex flex-col items-center gap-4 p-8">
                <DRSGauge drs={pool.drs} d={pool.d} a={pool.a} gated={pool.gated} />
              </Card>

              <Card className="p-6">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-lg font-semibold text-ink">Dilution risk over time</h2>
                  <span className="font-mono text-sm tnum text-muted">{formatPct(pool.drs)} now</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  The duplicate-density channel rises on-chain as near-duplicates are detected.
                </p>
                <div className="mt-5">
                  <DrsHistory pool={pool} />
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="font-display text-lg font-semibold text-ink">Provenance</h2>
                <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  <Fact label="pHash fingerprint" mono value={shortenHash(pool.pHash, 10, 6)} explorerValue={pool.pHash} explorerType="address" />
                  <Fact label="Near-duplicates" value={`${pool.duplicateCount}`} />
                  <Fact
                    label="IPFS CID"
                    mono
                    value={shortenHash(pool.ipfsCid, 12, 6)}
                    href={ipfsGateway(pool.ipfsCid)}
                  />
                  <Fact label="Attested" value={fmtDate(pool.attestedAt)} />
                </dl>
              </Card>
            </div>

            {/* Right: LP + facts */}
            <div className="flex flex-col gap-6">
              {livePool && <LivePoolCard pool={livePool} drs={pool.drs} />}
              <LpDashboard pool={pool} />
              <LpHistory pool={pool} />

              <Card className="p-6">
                <h2 className="font-display text-lg font-semibold text-ink">Pool</h2>
                <dl className="mt-4 flex flex-col gap-3 text-sm">
                  <Fact
                    label="Current LP fee"
                    value={pool.gated ? "n/a" : formatFeeBps(dynamicFeeBps(pool.drs, pool.baseFeeBps, pool.maxFeeBps))}
                    inline
                  />
                  <Fact
                    label="Fee range"
                    value={`${formatFeeBps(pool.baseFeeBps)} to ${formatFeeBps(pool.maxFeeBps)}`}
                    inline
                  />
                  <Fact
                    label="TVL"
                    value={tvl ? `${formatUsd(tvl.tvlUsd)} (sim.)` : "-"}
                    inline
                  />
                  <ApyBreakdown pool={pool} />
                  <Fact label="Duplicates" value={`${pool.duplicateCount}`} inline />
                </dl>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function ApyBreakdown({pool}: {pool: import("@/lib/types").Pool}) {
  const baseApy = (pool.baseFeeBps / 10000) * ASSUMED_ANNUAL_TURNOVER;
  const maxApy = (pool.maxFeeBps / 10000) * ASSUMED_ANNUAL_TURNOVER;
  const currentApy = pool.gated
    ? null
    : (dynamicFeeBps(pool.drs, pool.baseFeeBps, pool.maxFeeBps) / 10000) * ASSUMED_ANNUAL_TURNOVER;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <dt className="text-muted">APY (est.)</dt>
        <dd className="font-mono tnum text-ink">
          {currentApy !== null ? `${currentApy.toFixed(1)}%` : "- (gated)"}
        </dd>
      </div>
      <div className="flex items-center justify-between pl-3">
        <dt className="text-xs text-faint">At DRS=0 (base fee)</dt>
        <dd className="font-mono tnum text-xs text-faint">{baseApy.toFixed(1)}%</dd>
      </div>
      <div className="flex items-center justify-between pl-3">
        <dt className="text-xs text-faint">At gate (DRS=85%)</dt>
        <dd className="font-mono tnum text-xs text-faint">{maxApy.toFixed(1)}%</dd>
      </div>
      <p className="pl-3 text-[10px] text-faint">
        Based on {ASSUMED_ANNUAL_TURNOVER}× assumed annual turnover. No real volume on testnet.
      </p>
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
  inline,
  explorerValue,
  explorerType,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  inline?: boolean;
  explorerValue?: string;
  explorerType?: "address" | "tx";
  href?: string;
}) {
  const valueNode = explorerValue ? (
    <ExplorerLink value={explorerValue} type={explorerType ?? "address"} label={value} />
  ) : href ? (
    <dd>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-mono text-sm text-primary-ink underline-offset-2 hover:underline"
      >
        {value}
        <ExternalLink className="size-3" strokeWidth={2} aria-hidden />
      </a>
    </dd>
  ) : (
    <dd className={mono ? "font-mono text-sm text-ink" : "text-sm text-ink"}>{value}</dd>
  );

  if (inline) {
    return (
      <div className="flex items-center justify-between">
        <dt className="text-muted">{label}</dt>
        {explorerValue ? (
          valueNode
        ) : (
          <dd className="font-mono tnum text-ink">{value}</dd>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted">{label}</dt>
      {valueNode}
    </div>
  );
}
