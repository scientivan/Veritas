import {clsx, type ClassValue} from "clsx";
import {twMerge} from "tailwind-merge";

/** Merge Tailwind classes with conditional logic. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a 0..1 score as a percentage string, e.g. 0.612 -> "61%". */
export function formatPct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** Hundredths-of-a-bip fee (3000 = 0.30%) -> "0.30%". */
export function formatFeeBps(bps: number): string {
  return `${(bps / 10000).toFixed(2)}%`;
}

/** Compact USD, e.g. 1_240_000 -> "$1.24M". */
export function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/** 0x1234…abcd */
export function shortenAddress(address: string, chars = 4): string {
  if (!address?.startsWith("0x") || address.length < 10) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

/** Shorten a 0x fingerprint/hash for display. */
export function shortenHash(hash: string, head = 6, tail = 4): string {
  if (!hash) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}
