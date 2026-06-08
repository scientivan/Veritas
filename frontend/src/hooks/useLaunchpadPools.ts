"use client";

import {useState, useCallback} from "react";
import type {Hex} from "viem";
import type {LaunchpadRecord} from "@/lib/launchpad";

/**
 * In-session optimistic state for opened launchpads. Used by LaunchFlow and
 * OpenLaunchpadInline to give immediate in-page feedback after a launchpad is
 * opened. All persistent reads happen through useOnChainLaunchpads (on-chain events).
 */
export function useLaunchpadPools() {
  const [pools, setPools] = useState<LaunchpadRecord[]>([]);

  const addLaunchpad = useCallback((rec: LaunchpadRecord) => {
    setPools((prev) => [
      rec,
      ...prev.filter((p) => p.attestationId.toLowerCase() !== rec.attestationId.toLowerCase()),
    ]);
  }, []);

  const getByAttestation = useCallback(
    (attestationId: Hex) =>
      pools.find((p) => p.attestationId.toLowerCase() === attestationId.toLowerCase()) ?? null,
    [pools]
  );

  return {launchpads: pools, addLaunchpad, getByAttestation};
}
