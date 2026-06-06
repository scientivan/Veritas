"use client";

import {useState, useCallback, useEffect} from "react";
import type {Hex} from "viem";

export interface LaunchedIP {
  attestationId: Hex;
  tokenAddress: Hex;
  tokenName: string;
  tokenSymbol: string;
  launchedAt: number;
}

const STORAGE_KEY = "veritas-launched-ips";

export function useLaunchedIPs() {
  const [launchedIPs, setLaunchedIPs] = useState<LaunchedIP[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLaunchedIPs(JSON.parse(raw) as LaunchedIP[]);
    } catch {}
  }, []);

  const addLaunchedIP = useCallback((ip: LaunchedIP) => {
    setLaunchedIPs((prev) => {
      const next = [...prev.filter((p) => p.attestationId !== ip.attestationId), ip];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const isLaunched = useCallback(
    (attestationId: Hex) => launchedIPs.some((p) => p.attestationId === attestationId),
    [launchedIPs],
  );

  const getLaunchedIP = useCallback(
    (attestationId: Hex) => launchedIPs.find((p) => p.attestationId === attestationId) ?? null,
    [launchedIPs],
  );

  return {launchedIPs, addLaunchedIP, isLaunched, getLaunchedIP};
}
