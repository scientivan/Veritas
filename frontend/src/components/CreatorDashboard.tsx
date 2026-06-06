"use client";

import {useAccount, useReadContracts} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import Link from "next/link";
import {ArrowRight, ExternalLink} from "lucide-react";
import {LAUNCH_REGISTRY_ABI, REGISTRY_ABI} from "@/lib/abis";
import {LAUNCH_REGISTRY_ADDRESS, REGISTRY_ADDRESS, EXPLORER} from "@/lib/contracts";
import {KNOWN_ATTESTATION_IDS} from "@/lib/knownAttestations";
import {DRSGauge} from "./DRSGauge";
import {BondingCurveCard} from "./BondingCurveCard";
import {RoyaltyClaimCard} from "./RoyaltyClaimCard";
import {RiskPill} from "./RiskPill";
import {combineDrs, DRS_GATE} from "@/lib/drs";
import {formatPct, shortenAddress} from "@/lib/utils";
import type {Hex} from "viem";
import type {LaunchpadInfo} from "@/lib/types";

/**
 * Reads the creator's registered IP tokens from IPLaunchRegistry by scanning
 * known attestation IDs and checking ownership. In production, this would use
 * an indexer; for the hackathon demo we cross-reference the known set.
 */
export function CreatorDashboard() {
  const {address, isConnected} = useAccount();

  // Read attestation records for known IDs to find ones owned by this wallet.
  const attRecordCalls = KNOWN_ATTESTATION_IDS.map((id) => ({
    address: REGISTRY_ADDRESS as Hex,
    abi: REGISTRY_ABI,
    functionName: "getRecord" as const,
    args: [id as Hex],
  }));

  const {data: attRecords} = useReadContracts({
    contracts: attRecordCalls,
    query: {enabled: isConnected && !!address},
  });

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="text-muted">Connect your wallet to see your IP tokens.</p>
        <ConnectButton />
      </div>
    );
  }

  // Filter to attestations owned by this wallet.
  const myAttestations = KNOWN_ATTESTATION_IDS.filter((_, i) => {
    const rec = attRecords?.[i]?.result as {owner?: string} | undefined;
    return rec?.owner?.toLowerCase() === address?.toLowerCase();
  });

  if (myAttestations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
        <p className="font-display text-xl font-semibold text-ink">No IP tokens yet</p>
        <p className="max-w-sm text-sm text-muted">
          Verify your artwork and launch an IP token to see it here. Each token earns you 0.2%
          royalties on every swap after graduation.
        </p>
        <Link
          href="/launch"
          className="flex items-center gap-2 rounded-xl bg-primary/20 px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary/30 transition-colors"
        >
          Launch your first IP
          <ArrowRight className="size-4" strokeWidth={2.25} />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {myAttestations.map((attestationId, idx) => {
        const recResult = attRecords?.[KNOWN_ATTESTATION_IDS.indexOf(attestationId)]?.result as
          | {
              aiReplicabilityScore: number;
              offchainD: number;
              ipfsCid: string;
              owner: string;
              attestedAt: number;
            }
          | undefined;

        if (!recResult) return null;

        const drs = combineDrs(
          recResult.offchainD / 10000,
          recResult.aiReplicabilityScore / 10000
        );
        const gated = drs >= DRS_GATE;

        // Placeholder launchpad — in production, read from IPLaunchRegistry events.
        const launchpad = null as LaunchpadInfo | null;

        return (
          <div
            key={attestationId}
            className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <DRSGauge
                  drs={drs}
                  d={recResult.offchainD / 10000}
                  a={recResult.aiReplicabilityScore / 10000}
                  gated={gated}
                  className="shrink-0 scale-75 origin-top-left"
                />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-xs text-muted">{shortenAddress(attestationId as Hex, 6)}</p>
                    <a
                      href={`${EXPLORER}/address/${REGISTRY_ADDRESS}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted hover:text-ink"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                  <p className="text-sm text-muted">IPFS: {recResult.ipfsCid.slice(0, 20)}...</p>
                  <div className="flex items-center gap-2 mt-1">
                    <RiskPill drs={drs} gated={gated} size="sm" />
                    <span className="text-xs text-muted">DRS: {formatPct(drs)}</span>
                  </div>
                </div>
              </div>

              <Link
                href={`/pool/${attestationId}`}
                className="flex items-center gap-1.5 text-xs font-medium text-primary-ink hover:underline"
              >
                View pool
                <ArrowRight className="size-3.5" strokeWidth={2.25} />
              </Link>
            </div>

            {launchpad !== null ? (
              <>
                <BondingCurveCard launchpad={launchpad} />
                <RoyaltyClaimCard
                  ipTokenAddress={launchpad.ipToken}
                  ipTokenSymbol="IP"
                />
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-bg p-4 text-center">
                <p className="text-sm text-muted">No pool initialized yet.</p>
                <Link
                  href="/launch"
                  className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-primary-ink hover:underline"
                >
                  Initialize bonding curve
                  <ArrowRight className="size-3.5" strokeWidth={2.25} />
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
