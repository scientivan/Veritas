"use client";

import {useState, useCallback, useEffect} from "react";
import type {Hex} from "viem";
import type {LaunchpadRecord} from "@/lib/launchpad";

/**
 * Locally-tracked bonding-curve launchpads opened through the app. The public RPC
 * caps eth_getLogs, so (like launched IPs) we persist each opened launchpad at
 * creation time and merge it into the marketplace / studio reads. The on-chain
 * VeritasHook.launchpads(poolId) remains the source of truth for live state.
 */
const STORAGE_KEY = "veritas-launchpads";

export function useLaunchpadPools() {
  const [pools, setPools] = useState<LaunchpadRecord[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPools(JSON.parse(raw) as LaunchpadRecord[]);
    } catch {}
  }, []);

  const addLaunchpad = useCallback((rec: LaunchpadRecord) => {
    setPools((prev) => {
      // Dedupe by attestation (one launchpad per IP); a re-open replaces any
      // stale record (e.g. a phantom from a previously-reverted open).
      const next = [
        rec,
        ...prev.filter(
          (p) => p.attestationId.toLowerCase() !== rec.attestationId.toLowerCase()
        ),
      ];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const getByAttestation = useCallback(
    (attestationId: Hex) =>
      pools.find((p) => p.attestationId.toLowerCase() === attestationId.toLowerCase()) ?? null,
    [pools]
  );

  return {launchpads: pools, addLaunchpad, getByAttestation};
}
