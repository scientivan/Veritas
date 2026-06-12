"use client";

import {useState} from "react";
import type {ReactNode} from "react";
import {useAccount} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Rocket,
  TrendingUp,
  Lock,
  AlertTriangle,
  ChevronDown,
  Loader2,
} from "lucide-react";
import {AnimatePresence, motion} from "motion/react";
import {IPVerifiedBadge} from "@/components/IPVerifiedBadge";
import {REGISTRY_ADDRESS, RAISE_TOKEN_ADDRESS, EXPLORER} from "@/lib/contracts";
import {useMyAttestations, type MyAttestation} from "@/hooks/useMyAttestations";
import {DRSGauge} from "./DRSGauge";
import {RoyaltyClaimCard} from "./RoyaltyClaimCard";
import {OpenLaunchpadInline} from "./OpenLaunchpadInline";
import {BondingCurveCard} from "./BondingCurveCard";
import {RiskPill} from "./RiskPill";
import {DRS_GATE} from "@/lib/drs";
import {LaunchpadPhase} from "@/lib/launchpad";
import {curvePrice} from "@/lib/curve";
import {poolImage} from "@/lib/poolMeta";
import {formatPct, shortenAddress, cn} from "@/lib/utils";
import type {LaunchpadPhase as LaunchpadPhaseLabel} from "@/lib/types";

const EASE: [number, number, number, number] = [0.25, 1, 0.5, 1];

type Variant = "ready" | "raising" | "graduated" | "gated";
type Tab = Variant;

function phaseLabel(phase?: number): LaunchpadPhaseLabel | null {
  if (phase === undefined) return null;
  if (phase === LaunchpadPhase.GRADUATED) return "GRADUATED";
  if (phase === LaunchpadPhase.LAUNCHPAD) return "LAUNCHPAD";
  return "INACTIVE";
}

function getAttestationImage(att: MyAttestation): string | null {
  const known = poolImage(att.id);
  if (known) return known;
  if (att.tokenURI?.startsWith("http")) return att.tokenURI;
  if (att.tokenURI?.startsWith("ipfs://")) {
    const cid = att.tokenURI.slice(7);
    if (/^(bafy|bafk|Qm)/i.test(cid)) return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  const cid = att.ipfsCid.replace(/^ipfs:\/\//, "");
  if (/^(bafy|bafk|Qm)/i.test(cid)) return `https://gateway.pinata.cloud/ipfs/${cid}`;
  return null;
}

function attSwatch(id: string): string {
  const hue = parseInt(id.slice(2, 6), 16) % 360;
  return `oklch(0.62 0.14 ${hue})`;
}

export function CreatorDashboard() {
  const {isConnected} = useAccount();
  const router = useRouter();
  const {attestations, isLoading} = useMyAttestations();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab | null>(null);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="text-muted">Connect your wallet to see your Creator Studio.</p>
        <ConnectButton />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-12 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" />
        Loading your attestations...
      </div>
    );
  }

  const gated = attestations.filter((a) => !a.tokenAddress && a.drs >= DRS_GATE);
  const notGated = attestations.filter((a) => !(!a.tokenAddress && a.drs >= DRS_GATE));
  const readyToLaunch = notGated.filter((a) => {
    const p = phaseLabel(a.launchpadPhase);
    return p === null || p === "INACTIVE";
  });
  const raising = notGated.filter((a) => phaseLabel(a.launchpadPhase) === "LAUNCHPAD");
  const graduated = notGated.filter((a) => phaseLabel(a.launchpadPhase) === "GRADUATED");

  if (attestations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
        <p className="font-display text-xl font-semibold text-ink">Nothing here yet</p>
        <p className="max-w-sm text-sm text-muted">
          Verify your artwork, attest its DRS score, and launch it as an IP token to earn 0.2%
          royalties on every swap in one flow.
        </p>
        <Link
          href="/launch"
          className="flex items-center gap-2 rounded-xl bg-primary/20 px-4 py-2 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary/30"
        >
          Launch your IP
          <ArrowRight className="size-4" strokeWidth={2.25} />
        </Link>
      </div>
    );
  }

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));
  const launch = (id: string) => router.push(`/launch?attestation=${id}`);

  const TAB_CONFIG: {
    key: Tab;
    icon: ReactNode;
    title: string;
    shortTitle: string;
    count: number;
    countClass: string;
    activeClass: string;
    description?: ReactNode;
    items: MyAttestation[];
    variant: Variant;
  }[] = [
    {
      key: "graduated",
      icon: <Lock className="size-4 shrink-0" />,
      title: "Graduated Pools",
      shortTitle: "Graduated",
      count: graduated.length,
      countClass: "bg-risk-low/15 text-risk-low",
      activeClass: "border-risk-low/40 bg-risk-low/8 text-risk-low shadow-sm shadow-risk-low/10",
      description:
        "Hard cap reached: liquidity is locked in a Uniswap v4 pool and you earn royalties on every swap.",
      items: graduated,
      variant: "graduated",
    },
    {
      key: "raising",
      icon: <TrendingUp className="size-4 shrink-0" />,
      title: "Raising Pools",
      shortTitle: "Raising",
      count: raising.length,
      countClass: "bg-amber-500/15 text-amber-500",
      activeClass: "border-amber-500/40 bg-amber-500/8 text-amber-500 shadow-sm shadow-amber-500/10",
      description: "Bonding curves actively raising. They graduate to a locked v4 pool at the hard cap.",
      items: raising,
      variant: "raising",
    },
    {
      key: "ready",
      icon: <Rocket className="size-4 shrink-0" />,
      title: "Ready to Launch",
      shortTitle: "Ready",
      count: readyToLaunch.length,
      countClass: "bg-primary/15 text-primary-ink",
      activeClass: "border-primary/40 bg-primary/8 text-primary-ink shadow-sm shadow-primary/10",
      description:
        "These passed the DRS gate. Launch one into a bonding-curve pool (paired with USDC) to start raising.",
      items: readyToLaunch,
      variant: "ready",
    },
    {
      key: "gated",
      icon: <AlertTriangle className="size-4 shrink-0" />,
      title: "Gated Content",
      shortTitle: "Gated",
      count: gated.length,
      countClass: "bg-risk-high/10 text-risk-high",
      activeClass: "border-risk-high/40 bg-risk-high/8 text-risk-high shadow-sm shadow-risk-high/10",
      description:
        "DRS above 85%: too many near-duplicates or high AI-replicability. Cannot be tokenized until the score is disputed and resolved.",
      items: gated,
      variant: "gated",
    },
  ];

  const availableTabs = TAB_CONFIG.filter((t) => t.count > 0);
  const resolvedTab =
    activeTab && availableTabs.some((t) => t.key === activeTab)
      ? activeTab
      : availableTabs[0]?.key ?? "ready";
  const activeSection = TAB_CONFIG.find((t) => t.key === resolvedTab)!;

  return (
    <div className="flex flex-col gap-5">
      {/* Tab switcher */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface/60 p-1 backdrop-blur-sm">
        {availableTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
              resolvedTab === t.key
                ? cn("ring-1", t.activeClass)
                : "text-muted hover:text-ink hover:bg-surface/70"
            )}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.shortTitle}</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
                t.countClass
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.section
          key={resolvedTab}
          initial={{opacity: 0, y: 6}}
          animate={{opacity: 1, y: 0}}
          exit={{opacity: 0, y: -6}}
          transition={{duration: 0.18, ease: EASE}}
          className="flex flex-col gap-3"
        >
          <SectionHeader
            icon={activeSection.icon}
            title={activeSection.title}
            count={activeSection.count}
            countClass={activeSection.countClass}
            description={activeSection.description}
          />
          <ul className="flex flex-col gap-1.5" role="list">
            {activeSection.items.map((att) => (
              <AttestationCard
                key={att.id}
                att={att}
                variant={activeSection.variant}
                isOpen={expandedId === att.id}
                onToggle={toggle}
                onLaunch={launch}
              />
            ))}
          </ul>
        </motion.section>
      </AnimatePresence>
    </div>
  );
}

/* ── Attestation card (compact row + expandable detail) ───────────────── */

function AttestationCard({
  att,
  variant,
  isOpen,
  onToggle,
  onLaunch,
}: {
  att: MyAttestation;
  variant: Variant;
  isOpen: boolean;
  onToggle: (id: string) => void;
  onLaunch: (id: string) => void;
}) {
  const {id, drs, ipfsCid} = att;
  const phaseStr = phaseLabel(att.launchpadPhase);
  const minted = !!att.tokenAddress;
  const gatedFlag = drs >= DRS_GATE;
  const title = minted
    ? att.tokenName || shortenAddress(att.tokenAddress!, 6)
    : ipfsCid.length > 0
      ? ipfsCid.slice(0, 20) + "..."
      : shortenAddress(id, 6);
  const livePrice =
    variant === "raising" && att.curveA != null && att.curveB != null
      ? curvePrice(att.curveA, att.curveB, att.tokensSold ?? 0n)
      : undefined;

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong">
      {/* Compact row */}
      <div
        className="flex cursor-pointer select-none items-center gap-3 px-4 py-3"
        onClick={() => onToggle(id)}
      >
        <AttestationThumb att={att} size="sm" />
        <RiskPill drs={drs} gated={variant === "gated" || gatedFlag} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-semibold leading-tight text-ink">
            <span className="truncate">{title}</span>
            {minted && att.tokenSymbol && (
              <span className="font-mono text-[11px] font-normal text-muted">{att.tokenSymbol}</span>
            )}
            {minted && att.tokenAddress && <IPVerifiedBadge tokenAddress={att.tokenAddress} />}
          </p>
          <p className="font-mono text-[11px] text-muted">{shortenAddress(id, 6)}</p>
        </div>
        {phaseStr && phaseStr !== "INACTIVE" && <PhaseChip phase={phaseStr} />}
        <span
          className={cn(
            "font-mono tnum shrink-0 text-sm tabular-nums",
            variant === "gated" ? "text-risk-high" : "text-ink"
          )}
        >
          {formatPct(drs)}
        </span>

        {/* Per-variant primary action */}
        <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {variant === "ready" && !minted && (
            <button
              onClick={() => onLaunch(id)}
              className="flex items-center gap-1.5 rounded-lg bg-primary/20 px-3 py-1 text-[11px] font-semibold text-primary-ink transition-colors hover:bg-primary/30"
            >
              <Rocket className="size-3" strokeWidth={2.25} />
              Launch
            </button>
          )}
          {variant === "ready" && minted && (
            <button
              onClick={() => onToggle(id)}
              className="flex items-center gap-1.5 rounded-lg bg-primary/20 px-3 py-1 text-[11px] font-semibold text-primary-ink transition-colors hover:bg-primary/30"
            >
              <TrendingUp className="size-3" strokeWidth={2.25} />
              Open pool
            </button>
          )}
          {variant === "raising" && (
            <Link
              href={att.tokenAddress ? `/trade/${id}?token=${att.tokenAddress}` : `/trade/${id}`}
              className="flex items-center gap-1 text-[11px] font-medium text-primary-ink hover:underline"
            >
              View curve
              <ArrowRight className="size-3" strokeWidth={2.25} />
            </Link>
          )}
          {variant === "graduated" && (
            <Link
              href={att.tokenAddress ? `/pool/${id}?token=${att.tokenAddress}` : `/pool/${id}`}
              className="flex items-center gap-1 text-[11px] font-medium text-primary-ink hover:underline"
            >
              View pool
              <ArrowRight className="size-3" strokeWidth={2.25} />
            </Link>
          )}
          {variant === "gated" && (
            <Link
              href="/dispute"
              className="flex items-center gap-1 text-[11px] font-medium text-primary-ink hover:underline"
            >
              Dispute
              <ArrowRight className="size-3" strokeWidth={2.25} />
            </Link>
          )}
        </span>

        <ExpandButton isOpen={isOpen} id={id} onToggle={onToggle} />
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
              <DetailHeader att={att}>
                {variant === "ready" && minted && (
                  <div className="flex flex-col gap-3">
                    <OpenLaunchpadInline
                      attestationId={id}
                      ipToken={att.tokenAddress!}
                      tokenName={att.tokenName ?? ""}
                      tokenSymbol={att.tokenSymbol ?? ""}
                      tokenURI={att.tokenURI ?? ipfsCid}
                    />
                    <RoyaltyClaimCard
                      ipTokenAddress={att.tokenAddress!}
                      ipTokenSymbol={att.tokenSymbol ?? ""}
                    />
                  </div>
                )}

                {variant === "ready" && !minted && (
                  <button
                    onClick={() => onLaunch(id)}
                    className="flex items-center gap-2 self-start rounded-xl bg-primary/20 px-4 py-2 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary/30"
                  >
                    <Rocket className="size-4" strokeWidth={2.25} />
                    Launch as IP token
                  </button>
                )}

                {(variant === "raising" || variant === "graduated") && att.poolId && (
                  <div className="flex flex-col gap-3">
                    <BondingCurveCard
                      launchpad={{
                        poolId: att.poolId,
                        ipToken: att.tokenAddress!,
                        raiseToken: RAISE_TOKEN_ADDRESS,
                        phase: variant === "graduated" ? "GRADUATED" : "LAUNCHPAD",
                        fundsRaised: att.fundsRaised ?? 0n,
                        hardCap: att.hardCap ?? 0n,
                        tokensSold: att.tokensSold ?? 0n,
                        curveAllocation: att.curveAllocation ?? 0n,
                      }}
                      currentPrice={livePrice}
                    />
                    <RoyaltyClaimCard
                      ipTokenAddress={att.tokenAddress!}
                      ipTokenSymbol={att.tokenSymbol ?? ""}
                    />
                  </div>
                )}

                {variant === "gated" && (
                  <div className="rounded-xl border border-risk-high/20 bg-risk-high/5 p-4">
                    <p className="text-sm text-ink">
                      This attestation exceeds the 85% DRS gate. Submit a dispute with on-chain
                      evidence to request re-evaluation.
                    </p>
                    <Link
                      href="/dispute"
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-ink hover:underline"
                    >
                      Submit dispute
                      <ArrowRight className="size-3.5" strokeWidth={2.25} />
                    </Link>
                  </div>
                )}
              </DetailHeader>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/* ── Thumbnail component ─────────────────────────────────────────────── */

function AttestationThumb({att, size = "sm"}: {att: MyAttestation; size?: "sm" | "lg"}) {
  const [err, setErr] = useState(false);
  const src = getAttestationImage(att);
  const swatch = attSwatch(att.id);
  const cls = size === "lg"
    ? "w-full aspect-[4/3] rounded-xl object-cover ring-1 ring-inset ring-white/10"
    : "size-9 shrink-0 rounded-lg object-cover ring-1 ring-inset ring-white/10";
  const swatchCls = size === "lg"
    ? "w-full aspect-[4/3] rounded-xl ring-1 ring-inset ring-white/10 flex items-center justify-center"
    : "size-9 shrink-0 rounded-lg ring-1 ring-inset ring-white/10";

  if (!src || err) {
    return (
      <span
        className={swatchCls}
        style={{background: swatch}}
        aria-hidden
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setErr(true)}
      className={cls}
    />
  );
}

/* ── Expanded detail header: image + DRS gauge + metadata grid ───────── */

function DetailHeader({att, children}: {att: MyAttestation; children: ReactNode}) {
  const {id, drs, d, a, attestedAt, disputed, ipfsCid} = att;
  const minted = !!att.tokenAddress;
  const gatedFlag = drs >= DRS_GATE;
  const hasImage = !!getAttestationImage(att);

  return (
    <div className="flex flex-col gap-6">
      {/* Image banner (if available) */}
      {hasImage && (
        <div className="overflow-hidden rounded-xl">
          <AttestationThumb att={att} size="lg" />
        </div>
      )}

      <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
        <div className="shrink-0 self-start">
          <DRSGauge drs={drs} d={d} a={a} gated={gatedFlag} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {minted && att.tokenName && <DetailField label="Token name" value={att.tokenName} />}
            {minted && att.tokenSymbol && <DetailField label="Symbol" value={att.tokenSymbol} mono />}
            {minted && att.tokenAddress && (
              <div className="col-span-2">
                <dt className="text-[11px] uppercase tracking-wide text-muted">Token address</dt>
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
              <dt className="text-[11px] uppercase tracking-wide text-muted">Attestation ID</dt>
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
            {ipfsCid && (
              <div className="col-span-2">
                <dt className="text-[11px] uppercase tracking-wide text-muted">IPFS CID</dt>
                <dd className="mt-0.5 font-mono text-xs text-muted">
                  {ipfsCid.length > 44 ? ipfsCid.slice(0, 44) + "..." : ipfsCid}
                </dd>
              </div>
            )}
            <DetailField
              label="Attested"
              value={attestedAt ? new Date(Number(attestedAt) * 1000).toLocaleDateString() : "n/a"}
            />
            {minted ? (
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Disputed</dt>
                <dd
                  className={cn(
                    "mt-0.5 text-sm font-medium",
                    disputed ? "text-risk-high" : "text-risk-low"
                  )}
                >
                  {disputed ? "Yes" : "No"}
                </dd>
              </div>
            ) : (
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">D / A scores</dt>
                <dd className={cn("mt-0.5 font-mono text-xs", gatedFlag ? "text-risk-high" : "text-ink")}>
                  {formatPct(d)} / {formatPct(a)}
                </dd>
              </div>
            )}
          </dl>

          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

const PHASE_CHIP: Record<LaunchpadPhaseLabel, {label: string; cls: string}> = {
  INACTIVE: {label: "Not opened", cls: "text-muted bg-surface-2"},
  LAUNCHPAD: {label: "Launchpad", cls: "text-amber-500 bg-amber-500/10"},
  GRADUATED: {label: "Graduated", cls: "text-risk-low bg-risk-low/10"},
};

function PhaseChip({phase}: {phase: LaunchpadPhaseLabel}) {
  const {label, cls} = PHASE_CHIP[phase];
  return (
    <span
      className={cn(
        "hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline-flex",
        cls
      )}
    >
      {label}
    </span>
  );
}

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

function DetailField({label, value, mono = false}: {label: string; value: string; mono?: boolean}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={cn("mt-0.5 text-sm font-medium text-ink", mono && "font-mono")}>{value}</dd>
    </div>
  );
}
