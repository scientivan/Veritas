"use client";

import {useState, useCallback, useEffect} from "react";
import type {Hex} from "viem";
import type {LaunchpadRecord} from "@/lib/launchpad";
import {RAISE_TOKEN_ADDRESS} from "@/lib/contracts";

/**
 * Locally-tracked bonding-curve launchpads opened through the app. The public RPC
 * caps eth_getLogs, so (like launched IPs) we persist each opened launchpad at
 * creation time and merge it into the marketplace / studio reads. The on-chain
 * VeritasHook.launchpads(poolId) remains the source of truth for live state.
 */
const STORAGE_KEY = "veritas-launchpads";

/**
 * Seeded demo pool: the fixed-hook (graduation-overflow-fixed) bonding curve pool
 * deployed on 2026-06-07. Linked to the first non-gated v2 attestation so the
 * /trade route renders a CurveTradePanel without requiring localStorage.
 */
const DEMO_LAUNCHPAD: LaunchpadRecord = {
  attestationId: "0x40e6a7dc19b5b6314b6084ff13db1475e0ac3c9859fb884b969e2ab861a1a4b9",
  ipToken: "0xc858FE61C1f38D5c18C002aa37fAeA7Fefe7238A",
  poolId: "0x9b16df9753284cdecc8bf027f1905d985ca112cc037fd79aaa1427dc7592cb82",
  raiseToken: RAISE_TOKEN_ADDRESS,
  ipIsToken0: true,
  tokenName: "Veritas IP Token v2",
  tokenSymbol: "VIP2",
  hardCap: "1000",
  openedAt: 1749254400,
};

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
    (attestationId: Hex) => {
      const fromStorage = pools.find(
        (p) => p.attestationId.toLowerCase() === attestationId.toLowerCase()
      );
      if (fromStorage) return fromStorage;
      if (DEMO_LAUNCHPAD.attestationId.toLowerCase() === attestationId.toLowerCase()) {
        return DEMO_LAUNCHPAD;
      }
      return null;
    },
    [pools]
  );

  return {launchpads: [DEMO_LAUNCHPAD, ...pools], addLaunchpad, getByAttestation};
}
