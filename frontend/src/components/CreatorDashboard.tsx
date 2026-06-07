"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Rocket,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { IPVerifiedBadge } from "@/components/IPVerifiedBadge";
import { REGISTRY_ABI } from "@/lib/abis";
import {
  LAUNCH_REGISTRY_ADDRESS,
  REGISTRY_ADDRESS,
  EXPLORER,
} from "@/lib/contracts";
import { KNOWN_ATTESTATION_IDS } from "@/lib/knownAttestations";
import { poolTitle } from "@/lib/poolMeta";
import { hasLivePool } from "@/lib/livePools";
import { useLaunchedIPs } from "@/hooks/useLaunchedIPs";
import { DRSGauge } from "./DRSGauge";
import { RoyaltyClaimCard } from "./RoyaltyClaimCard";
import { OpenLaunchpadInline } from "./OpenLaunchpadInline";
import { RiskPill } from "./RiskPill";
import { combineDrs, DRS_GATE } from "@/lib/drs";
import { formatPct, shortenAddress, cn } from "@/lib/utils";
import type { Hex } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const EASE: [number, number, number, number] = [0.25, 1, 0.5, 1];

type AttRecord = {
  aiReplicabilityScore: number;
  offchainD: number;
  ipfsCid: string;
  owner: string;
  // uint64 on-chain → viem decodes it as a bigint, not a number.
  attestedAt: bigint;
  disputed: boolean;
};

export function CreatorDashboard() {
  const { address, isConnected } = useAccount();
  const { launchedIPs, isLaunched, getLaunchedIP } = useLaunchedIPs();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Freshly launched IPs get a brand-new attestation id that is not in the
  // curated KNOWN list, so merge in the ids saved locally at launch time —
  // otherwise a just-launched pool would never show up in the studio.
  const allIds = useMemo<Hex[]>(() => {
    const ids = [...KNOWN_ATTESTATION_IDS];
    for (const ip of launchedIPs) {
      if (!ids.some((x) => x.toLowerCase() === ip.attestationId.toLowerCase())) {
        ids.push(ip.attestationId);
      }
    }
    return ids;
  }, [launchedIPs]);

  const attRecordCalls = allIds.map((id) => ({
    address: REGISTRY_ADDRESS as Hex,
    abi: REGISTRY_ABI,
    functionName: "getRecord" as const,
    args: [id as Hex],
  }));

  const { data: attRecords } = useReadContracts({
    contracts: attRecordCalls,
    query: { enabled: isConnected && !!address },
  });

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="text-muted">
          Connect your wallet to see your Creator Studio.
        </p>
        <ConnectButton />
      </div>
    );
  }

  const myAttestations = allIds.flatMap((id, i) => {
    const rec = attRecords?.[i]?.result as AttRecord | undefined;
    if (!rec) return [];
    if (rec.owner?.toLowerCase() !== address?.toLowerCase()) return [];
    const drs = combineDrs(
      rec.offchainD / 10000,
      rec.aiReplicabilityScore / 10000,
    );
    return [{ id: id as Hex, rec, drs }];
  });

  const isLive = (id: Hex) => isLaunched(id) || hasLivePool(id);
  const launched = myAttestations.filter((a) => isLive(a.id));
  const readyToLaunch = myAttestations.filter(
    (a) => !isLive(a.id) && a.drs < DRS_GATE,
  );
  const gated = myAttestations.filter(
    (a) => !isLive(a.id) && a.drs >= DRS_GATE,
  );

  if (myAttestations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
        <p className="font-display text-xl font-semibold text-ink">
          Nothing here yet
        </p>
        <p className="max-w-sm text-sm text-muted">
          Verify your artwork, attest its DRS score, and launch it as an IP
          token to earn 0.2% royalties on every swap — all in one flow.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/launch"
            className="flex items-center gap-2 rounded-xl bg-primary/20 px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary/30 transition-colors"
          >
            Launch your IP
            <ArrowRight className="size-4" strokeWidth={2.25} />
          </Link>
        </div>
      </div>
    );
  }

  const toggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="flex flex-col gap-8">
      {/* ── Launched IP Tokens ──────────────────────────────────────── */}
      {launched.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader
            icon={<CheckCircle2 className="size-[18px] text-risk-low" />}
            title="Launched IP Tokens"
            count={launched.length}
            countClass="bg-risk-low/15 text-risk-low"
          />
          <ul className="flex flex-col gap-1.5" role="list">
            {launched.map(({ id, rec, drs }) => {
              const gatedFlag = drs >= DRS_GATE;
              const launchInfo = getLaunchedIP(id);
              const isOpen = expandedId === id;
              const title = launchInfo?.tokenName ?? poolTitle(id, rec.ipfsCid);

              return (
                <li
                  key={id}
                  className="overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong"
                >
                  {/* Compact row */}
                  <div
                    className="flex cursor-pointer select-none items-center gap-3 px-4 py-3"
                    onClick={() => toggle(id)}
                  >
                    <RiskPill drs={drs} gated={gatedFlag} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-semibold leading-tight text-ink">
                        <span className="truncate">{title}</span>
                        {launchInfo && (
                          <span className="font-mono text-[11px] font-normal text-muted">
                            {launchInfo.tokenSymbol}
                          </span>
                        )}
                        {launchInfo && (
                          <IPVerifiedBadge tokenAddress={launchInfo.tokenAddress as `0x${string}`} />
                        )}
                      </p>
                      <p className="font-mono text-[11px] text-muted">
                        {shortenAddress(id, 6)}
                      </p>
                    </div>
                    <span className="font-mono tnum shrink-0 text-sm tabular-nums text-ink">
                      {formatPct(drs)}
                    </span>
                    <span
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link
                        href={`/pool/${id}`}
                        className="flex items-center gap-1 text-[11px] font-medium text-primary-ink hover:underline"
                      >
                        View pool
                        <ArrowRight className="size-3" strokeWidth={2.25} />
                      </Link>
                    </span>
                    <ExpandButton isOpen={isOpen} id={id} onToggle={toggle} />
                  </div>

                  {/* Expanded detail */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: EASE }}
                        style={{ overflow: "hidden" }}
                      >
                        <div className="border-t border-border px-4 pb-5 pt-4">
                          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
                            <div className="shrink-0 self-start">
                              <DRSGauge
                                drs={drs}
                                d={rec.offchainD / 10000}
                                a={rec.aiReplicabilityScore / 10000}
                                gated={gatedFlag}
                              />
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-5">
                              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                                {launchInfo && (
                                  <>
                                    <DetailField
                                      label="Token name"
                                      value={launchInfo.tokenName}
                                    />
                                    <DetailField
                                      label="Symbol"
                                      value={launchInfo.tokenSymbol}
                                      mono
                                    />
                                    <div className="col-span-2">
                                      <dt className="text-[11px] uppercase tracking-wide text-muted">
                                        Token address
                                      </dt>
                                      <dd className="mt-0.5 font-mono text-xs text-primary-ink">
                                        <a
                                          href={`${EXPLORER}/token/${launchInfo.tokenAddress}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 hover:underline"
                                        >
                                          {shortenAddress(
                                            launchInfo.tokenAddress,
                                            8,
                                          )}
                                          <ExternalLink className="size-3" />
                                        </a>
                                      </dd>
                                    </div>
                                  </>
                                )}
                                <div className="col-span-2">
                                  <dt className="text-[11px] uppercase tracking-wide text-muted">
                                    Attestation ID
                                  </dt>
                                  <dd className="mt-0.5 font-mono text-xs text-muted">
                                    {shortenAddress(id, 8)}
                                    <a
                                      href={`${EXPLORER}/address/${REGISTRY_ADDRESS}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ml-1.5 hover:text-ink"
                                    >
                                      <ExternalLink className="inline size-3" />
                                    </a>
                                  </dd>
                                </div>
                                <DetailField
                                  label="Attested"
                                  value={
                                    rec.attestedAt
                                      ? new Date(
                                          Number(rec.attestedAt) * 1000,
                                        ).toLocaleDateString()
                                      : "—"
                                  }
                                />
                                <div>
                                  <dt className="text-[11px] uppercase tracking-wide text-muted">
                                    Disputed
                                  </dt>
                                  <dd
                                    className={cn(
                                      "mt-0.5 text-sm font-medium",
                                      rec.disputed
                                        ? "text-risk-high"
                                        : "text-risk-low",
                                    )}
                                  >
                                    {rec.disputed ? "Yes" : "No"}
                                  </dd>
                                </div>
                              </dl>

                              {launchInfo ? (
                                <div className="flex flex-col gap-3">
                                  {/* OpenLaunchpadInline reads the on-chain phase: it shows
                                      "live + view market" if the curve is active, else the
                                      open form (so a phantom localStorage record self-heals). */}
                                  <OpenLaunchpadInline
                                    attestationId={id}
                                    ipToken={launchInfo.tokenAddress}
                                    tokenName={launchInfo.tokenName}
                                    tokenSymbol={launchInfo.tokenSymbol}
                                    tokenURI={rec.ipfsCid}
                                  />
                                  <RoyaltyClaimCard
                                    ipTokenAddress={launchInfo.tokenAddress}
                                    ipTokenSymbol={launchInfo.tokenSymbol}
                                  />
                                </div>
                              ) : (
                                <div className="rounded-xl border border-dashed border-border bg-bg p-4 text-center">
                                  <p className="text-sm text-muted">
                                    This is a live v4 pool — provide liquidity or view it.
                                  </p>
                                  <Link
                                    href={`/pool/${id}`}
                                    className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-primary-ink hover:underline"
                                  >
                                    View pool
                                    <ArrowRight className="size-3.5" strokeWidth={2.25} />
                                  </Link>
                                </div>
                              )}
                            </div>
                          </div>

                          {LAUNCH_REGISTRY_ADDRESS === ZERO_ADDRESS && (
                            <p className="mt-4 text-center text-xs text-amber-500/80">
                              IPLaunchRegistry not yet deployed. Deploy with{" "}
                              <code className="font-mono">
                                forge script script/DeployIPLaunch.s.sol
                              </code>
                              .
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Attested — Ready to Launch ──────────────────────────────── */}
      {readyToLaunch.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader
            icon={<Rocket className="size-[18px] text-primary-ink" />}
            title="Attested — Ready to Launch"
            count={readyToLaunch.length}
            countClass="bg-primary/15 text-primary-ink"
            description={
              <>
                These works passed the DRS gate. Select one in{" "}
                <Link
                  href="/launch"
                  className="text-primary-ink underline-offset-2 hover:underline"
                >
                  Launch IP
                </Link>{" "}
                to mint a token and register it on-chain.
              </>
            }
          />
          <ul className="flex flex-col gap-1.5" role="list">
            {readyToLaunch.map(({ id, rec, drs }) => {
              const isOpen = expandedId === id;
              return (
                <li
                  key={id}
                  className="overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong"
                >
                  <div
                    className="flex cursor-pointer select-none items-center gap-3 px-4 py-3"
                    onClick={() => toggle(id)}
                  >
                    <RiskPill drs={drs} gated={false} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight text-ink">
                        {poolTitle(id, rec.ipfsCid)}
                      </p>
                      <p className="font-mono text-[11px] text-muted">
                        {shortenAddress(id, 6)}
                      </p>
                    </div>
                    <span className="font-mono tnum shrink-0 text-sm tabular-nums text-ink">
                      {formatPct(drs)}
                    </span>
                    <span
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link
                        href="/launch"
                        className="flex items-center gap-1.5 rounded-lg bg-primary/20 px-3 py-1 text-[11px] font-semibold text-primary-ink hover:bg-primary/30 transition-colors"
                      >
                        <Rocket className="size-3" />
                        Launch
                      </Link>
                    </span>
                    <ExpandButton isOpen={isOpen} id={id} onToggle={toggle} />
                  </div>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: EASE }}
                        style={{ overflow: "hidden" }}
                      >
                        <div className="border-t border-border px-4 pb-5 pt-4">
                          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
                            <div className="shrink-0 self-start">
                              <DRSGauge
                                drs={drs}
                                d={rec.offchainD / 10000}
                                a={rec.aiReplicabilityScore / 10000}
                                gated={false}
                              />
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-5">
                              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                                <div className="col-span-2">
                                  <dt className="text-[11px] uppercase tracking-wide text-muted">
                                    Attestation ID
                                  </dt>
                                  <dd className="mt-0.5 font-mono text-xs text-muted">
                                    {shortenAddress(id, 10)}
                                    <a
                                      href={`${EXPLORER}/address/${REGISTRY_ADDRESS}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ml-1.5 hover:text-ink"
                                    >
                                      <ExternalLink className="inline size-3" />
                                    </a>
                                  </dd>
                                </div>
                                <div className="col-span-2">
                                  <dt className="text-[11px] uppercase tracking-wide text-muted">
                                    IPFS CID
                                  </dt>
                                  <dd className="mt-0.5 font-mono text-xs text-muted">
                                    {rec.ipfsCid.length > 44
                                      ? rec.ipfsCid.slice(0, 44) + "…"
                                      : rec.ipfsCid}
                                  </dd>
                                </div>
                                <DetailField
                                  label="Attested"
                                  value={
                                    rec.attestedAt
                                      ? new Date(
                                          Number(rec.attestedAt) * 1000,
                                        ).toLocaleDateString()
                                      : "—"
                                  }
                                />
                                <div>
                                  <dt className="text-[11px] uppercase tracking-wide text-muted">
                                    D / A scores
                                  </dt>
                                  <dd className="mt-0.5 font-mono text-xs text-ink">
                                    {formatPct(rec.offchainD / 10000)} /{" "}
                                    {formatPct(
                                      rec.aiReplicabilityScore / 10000,
                                    )}
                                  </dd>
                                </div>
                              </dl>
                              <Link
                                href="/launch"
                                className="self-start flex items-center gap-2 rounded-xl bg-primary/20 px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary/30 transition-colors"
                              >
                                <Rocket className="size-4" />
                                Launch as IP token
                              </Link>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Gated Content ───────────────────────────────────────────── */}
      {gated.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader
            icon={<AlertTriangle className="size-[18px] text-risk-high" />}
            title="Gated Content"
            count={gated.length}
            countClass="bg-risk-high/10 text-risk-high"
            description="DRS above 85%: too many near-duplicates or high AI-replicability. These cannot be tokenized until the score is disputed and resolved."
          />
          <ul className="flex flex-col gap-1.5" role="list">
            {gated.map(({ id, rec, drs }) => {
              const isOpen = expandedId === id;
              return (
                <li
                  key={id}
                  className="overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong"
                >
                  <div
                    className="flex cursor-pointer select-none items-center gap-3 px-4 py-3"
                    onClick={() => toggle(id)}
                  >
                    <RiskPill drs={drs} gated size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight text-ink">
                        {poolTitle(id, rec.ipfsCid)}
                      </p>
                      <p className="font-mono text-[11px] text-muted">
                        {shortenAddress(id, 6)}
                      </p>
                    </div>
                    <span className="font-mono tnum shrink-0 text-sm tabular-nums text-risk-high">
                      {formatPct(drs)}
                    </span>
                    <span
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link
                        href="/dispute"
                        className="flex items-center gap-1 text-[11px] font-medium text-primary-ink hover:underline"
                      >
                        Dispute
                        <ArrowRight className="size-3" strokeWidth={2.25} />
                      </Link>
                    </span>
                    <ExpandButton isOpen={isOpen} id={id} onToggle={toggle} />
                  </div>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: EASE }}
                        style={{ overflow: "hidden" }}
                      >
                        <div className="border-t border-border px-4 pb-5 pt-4">
                          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
                            <div className="shrink-0 self-start">
                              <DRSGauge
                                drs={drs}
                                d={rec.offchainD / 10000}
                                a={rec.aiReplicabilityScore / 10000}
                                gated
                              />
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-5">
                              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                                <div className="col-span-2">
                                  <dt className="text-[11px] uppercase tracking-wide text-muted">
                                    Attestation ID
                                  </dt>
                                  <dd className="mt-0.5 font-mono text-xs text-muted">
                                    {shortenAddress(id, 10)}
                                    <a
                                      href={`${EXPLORER}/address/${REGISTRY_ADDRESS}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ml-1.5 hover:text-ink"
                                    >
                                      <ExternalLink className="inline size-3" />
                                    </a>
                                  </dd>
                                </div>
                                <div className="col-span-2">
                                  <dt className="text-[11px] uppercase tracking-wide text-muted">
                                    IPFS CID
                                  </dt>
                                  <dd className="mt-0.5 font-mono text-xs text-muted">
                                    {rec.ipfsCid.length > 44
                                      ? rec.ipfsCid.slice(0, 44) + "…"
                                      : rec.ipfsCid}
                                  </dd>
                                </div>
                                <DetailField
                                  label="Attested"
                                  value={
                                    rec.attestedAt
                                      ? new Date(
                                          Number(rec.attestedAt) * 1000,
                                        ).toLocaleDateString()
                                      : "—"
                                  }
                                />
                                <div>
                                  <dt className="text-[11px] uppercase tracking-wide text-muted">
                                    D / A scores
                                  </dt>
                                  <dd className="mt-0.5 font-mono text-xs text-risk-high">
                                    {formatPct(rec.offchainD / 10000)} /{" "}
                                    {formatPct(
                                      rec.aiReplicabilityScore / 10000,
                                    )}
                                  </dd>
                                </div>
                              </dl>
                              <div className="rounded-xl border border-risk-high/20 bg-risk-high/5 p-4">
                                <p className="text-sm text-ink">
                                  This attestation exceeds the 85% DRS gate.
                                  Submit a dispute with on-chain evidence to
                                  request re-evaluation.
                                </p>
                                <Link
                                  href="/dispute"
                                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-ink hover:underline"
                                >
                                  Submit dispute
                                  <ArrowRight
                                    className="size-3.5"
                                    strokeWidth={2.25}
                                  />
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function ExpandButton({
  isOpen,
  id,
  onToggle,
}: {
  isOpen: boolean;
  id: string;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      className="shrink-0 rounded-md p-1 text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-expanded={isOpen}
      aria-label={isOpen ? "Collapse details" : "Expand details"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(id);
      }}
    >
      <motion.span
        animate={{ rotate: isOpen ? 180 : 0 }}
        transition={{ duration: 0.2, ease: EASE }}
        className="block"
      >
        <ChevronDown className="size-4" />
      </motion.span>
    </button>
  );
}

function SectionHeader({
  icon,
  title,
  count,
  countClass,
  description,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  countClass: string;
  description?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-display text-base font-semibold text-ink">
          {title}
        </h2>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
            countClass,
          )}
        >
          {count}
        </span>
      </div>
      {description && <p className="text-sm text-muted">{description}</p>}
    </div>
  );
}

function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-medium text-ink",
          mono && "font-mono",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
