"use client";

import {useLaunchpadPools} from "@/hooks/useLaunchpadPools";
import {IPVerifiedBadge} from "@/components/IPVerifiedBadge";

interface Props {
  attestationId: `0x${string}`;
}

/**
 * Shows an "IP Verified" badge in the pool detail page when the attestation's
 * IP token has been registered in the IPLaunchRegistry.
 * Reads token address from localStorage launchpad records, then checks on-chain.
 */
export function IPVerifiedSection({attestationId}: Props) {
  const {getByAttestation} = useLaunchpadPools();
  const record = getByAttestation(attestationId);

  if (!record?.ipToken) return null;

  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">IP Registry status</dt>
      <dd>
        <IPVerifiedBadge tokenAddress={record.ipToken as `0x${string}`} variant="card" />
      </dd>
    </div>
  );
}
