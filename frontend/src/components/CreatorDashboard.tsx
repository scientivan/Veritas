"use client";

import {useMemo, useState} from "react";
import type {ReactNode} from "react";
import {useAccount} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Rocket,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Loader2,
} from "lucide-react";
import {AnimatePresence, motion} from "motion/react";
import {IPVerifiedBadge} from "@/components/IPVerifiedBadge";
import {LAUNCH_REGISTRY_ADDRESS, REGISTRY_ADDRESS, EXPLORER} from "@/lib/contracts";
import {useMyAttestations} from "@/hooks/useMyAttestations";
import {DRSGauge} from "./DRSGauge";
import {RoyaltyClaimCard} from "./RoyaltyClaimCard";
import {OpenLaunchpadInline} from "./OpenLaunchpadInline";
import {RiskPill} from "./RiskPill";
import {DRS_GATE} from "@/lib/drs";
import {formatPct, shortenAddress, cn} from "@/lib/utils";
import type {Hex} from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const EASE: [number, number, number, number] = [0.25, 1, 0.5, 1];

export function CreatorDashboard() {
  const {isConnected} = useAccount();
  const {attestations, isLoading} = useMyAttestations();
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-12 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" />
        Loading your attestations…
      </div>
    );
  }

  const launched = attestations.filter((a) => !!a.tokenAddress);
  const readyToLaunch = attestations.filter((a) => !a.tokenAddress && a.drs < DRS_GATE);
  const gated = attestations.filter((a) => !a.tokenAddress && a.drs >= DRS_GATE);

  if (attestations.length === 0) {
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
            {launched.map((att) => {
              const {id, drs, d, a, attestedAt, disputed} = att;
              const gatedFlag = drs >= DRS_GATE;
              const isOpen = expandedId === id;
              const title = att.tokenName || shortenAddress(att.tokenAddress!, 6);

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
                        {att.tokenSymbol && (
                          <span className="font-mono text-[11px] font-normal text-muted">
                            {att.tokenSymbol}
                          </span>
                        )}
                        {att.tokenAddress && (
                          <IPVerifiedBadge tokenAddress={att.tokenAddress} />
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
                        initial={{height: 0, opacity: 0}}
                        animate={{height: "auto", opacity: 1}}
                        exit={{height: 0, opacity: 0}}
                        transition={{duration: 0.22, ease: EASE}}
                        style={{overflow: "hidden"}}
                      >
                        <div className="border-t border-border px-4 pb-5 pt-4">
                          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
                            <div className="shrink-0 self-start">
                              <DRSGauge drs={drs} d={d} a={a} gated={gatedFlag} />
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-5">
                              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                                {att.tokenName && (
                                  <DetailField label="Token name" value={att.tokenName} />
                                )}
                                {att.tokenSymbol && (
                                  <DetailField label="Symbol" value={att.tokenSymbol} mono />
                                )}
                                {att.tokenAddress && (
                                  <div className="col-span-2">
                                    <dt className="text-[11px] uppercase tracking-wide text-muted">
                                      Token address
                                    </dt>
                                    <dd className="mt-0.5 font-mono text-xs text-primary-ink">
                                      <a
                                        href={`${EXPLORER}/token/${att.tokenAddress}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 hover:underline"
                                      >
                                        {shortenAddress(att.tokenAddress, 8)}
                                        <ExternalLink className="size-3" />
                                      </a>
                                    </dd>
                                  </div>
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
                                    attestedAt
                                      ? new Date(Number(attestedAt) * 1000).toLocaleDateString()
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
                                      disputed ? "text-risk-high" : "text-risk-low"
                                    )}
                                  >
                                    {disputed ? "Yes" : "No"}
                                  </dd>
                                </div>
                              </dl>

                              <div className="flex flex-col gap-3">
                                <OpenLaunchpadInline
                                  attestationId={id}
                                  ipToken={att.tokenAddress!}
                                  tokenName={att.tokenName ?? ""}
                                  tokenSymbol={att.tokenSymbol ?? ""}
                                  tokenURI={att.tokenURI ?? att.ipfsCid}
                                />
                                <RoyaltyClaimCard
                                  ipTokenAddress={att.tokenAddress!}
                                  ipTokenSymbol={att.tokenSymbol ?? ""}
                                />
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
            {readyToLaunch.map((att) => {
              const {id, drs, d, a, attestedAt, ipfsCid} = att;
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
                        {ipfsCid.length > 0 ? ipfsCid.slice(0, 20) + "…" : shortenAddress(id, 6)}
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
                        initial={{height: 0, opacity: 0}}
                        animate={{height: "auto", opacity: 1}}
                        exit={{height: 0, opacity: 0}}
                        transition={{duration: 0.22, ease: EASE}}
                        style={{overflow: "hidden"}}
                      >
                        <div className="border-t border-border px-4 pb-5 pt-4">
                          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
                            <div className="shrink-0 self-start">
                              <DRSGauge drs={drs} d={d} a={a} gated={false} />
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
                                {ipfsCid && (
                                  <div className="col-span-2">
                                    <dt className="text-[11px] uppercase tracking-wide text-muted">
                                      IPFS CID
                                    </dt>
                                    <dd className="mt-0.5 font-mono text-xs text-muted">
                                      {ipfsCid.length > 44 ? ipfsCid.slice(0, 44) + "…" : ipfsCid}
                                    </dd>
                                  </div>
                                )}
                                <DetailField
                                  label="Attested"
                                  value={
                                    attestedAt
                                      ? new Date(Number(attestedAt) * 1000).toLocaleDateString()
                                      : "—"
                                  }
                                />
                                <div>
                                  <dt className="text-[11px] uppercase tracking-wide text-muted">
                                    D / A scores
                                  </dt>
                                  <dd className="mt-0.5 font-mono text-xs text-ink">
                                    {formatPct(d)} / {formatPct(a)}
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
            {gated.map((att) => {
              const {id, drs, d, a, attestedAt, ipfsCid} = att;
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
                        {ipfsCid.length > 0 ? ipfsCid.slice(0, 20) + "…" : shortenAddress(id, 6)}
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
                        initial={{height: 0, opacity: 0}}
                        animate={{height: "auto", opacity: 1}}
                        exit={{height: 0, opacity: 0}}
                        transition={{duration: 0.22, ease: EASE}}
                        style={{overflow: "hidden"}}
                      >
                        <div className="border-t border-border px-4 pb-5 pt-4">
                          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
                            <div className="shrink-0 self-start">
                              <DRSGauge drs={drs} d={d} a={a} gated />
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
                                {ipfsCid && (
                                  <div className="col-span-2">
                                    <dt className="text-[11px] uppercase tracking-wide text-muted">
                                      IPFS CID
                                    </dt>
                                    <dd className="mt-0.5 font-mono text-xs text-muted">
                                      {ipfsCid.length > 44 ? ipfsCid.slice(0, 44) + "…" : ipfsCid}
                                    </dd>
                                  </div>
                                )}
                                <DetailField
                                  label="Attested"
                                  value={
                                    attestedAt
                                      ? new Date(Number(attestedAt) * 1000).toLocaleDateString()
                                      : "—"
                                  }
                                />
                                <div>
                                  <dt className="text-[11px] uppercase tracking-wide text-muted">
                                    D / A scores
                                  </dt>
                                  <dd className="mt-0.5 font-mono text-xs text-risk-high">
                                    {formatPct(d)} / {formatPct(a)}
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
                                  <ArrowRight className="size-3.5" strokeWidth={2.25} />
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
        animate={{rotate: isOpen ? 180 : 0}}
        transition={{duration: 0.2, ease: EASE}}
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
        <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", countClass)}>
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
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={cn("mt-0.5 text-sm font-medium text-ink", mono && "font-mono")}>{value}</dd>
    </div>
  );
}
