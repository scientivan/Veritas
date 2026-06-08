"use client";

import {useState, useCallback} from "react";
import type {Hex} from "viem";

export interface LaunchedIP {
  attestationId: Hex;
  tokenAddress: Hex;
  tokenName: string;
  tokenSymbol: string;
  launchedAt: number;
}

/**
 * In-session optimistic state for newly launched IP tokens. Used by LaunchFlow to
 * provide immediate feedback in the current browser session. All persistent data
 * reads happen through useMyAttestations (on-chain events), not here.
 */
export function useLaunchedIPs() {
  const [launchedIPs, setLaunchedIPs] = useState<LaunchedIP[]>([]);

  const addLaunchedIP = useCallback((ip: LaunchedIP) => {
    setLaunchedIPs((prev) => [
      ip,
      ...prev.filter((p) => p.attestationId.toLowerCase() !== ip.attestationId.toLowerCase()),
    ]);
  }, []);

  const isLaunched = useCallback(
    (attestationId: Hex) =>
      launchedIPs.some((p) => p.attestationId.toLowerCase() === attestationId.toLowerCase()),
    [launchedIPs]
  );

  const getLaunchedIP = useCallback(
    (attestationId: Hex) =>
      launchedIPs.find((p) => p.attestationId.toLowerCase() === attestationId.toLowerCase()) ?? null,
    [launchedIPs]
  );

  return {launchedIPs, addLaunchedIP, isLaunched, getLaunchedIP};
}
