"use client";

import {ExternalLink} from "lucide-react";
import {EXPLORER} from "@/lib/contracts";
import {cn} from "@/lib/utils";

type ExplorerType = "address" | "tx" | "block" | "token";

interface ExplorerLinkProps {
  /** Raw hex value — address (0x…) or tx hash (0x…). */
  value: string;
  /** Kind of entity. Defaults to "address". */
  type?: ExplorerType;
  /** Override the displayed label. Defaults to a shortened version of `value`. */
  label?: string;
  /** Extra Tailwind classes. */
  className?: string;
  /** Number of leading hex chars to show (after "0x"). Defaults to 4 for address, 6 for tx. */
  prefixChars?: number;
  /** Number of trailing hex chars to show. Defaults to 4. */
  suffixChars?: number;
  /** When true the external-link icon is hidden. */
  hideIcon?: boolean;
}

/**
 * A styled anchor that links to the Uniscan block explorer.
 * Works for addresses, transaction hashes, and arbitrary hex identifiers.
 */
export function ExplorerLink({
  value,
  type = "address",
  label,
  className,
  prefixChars,
  suffixChars = 4,
  hideIcon = false,
}: ExplorerLinkProps) {
  if (!value) return null;

  const defaultPrefixChars = prefixChars ?? (type === "tx" ? 6 : 4);
  const displayLabel =
    label ??
    (value.startsWith("0x") && value.length > defaultPrefixChars + suffixChars + 2
      ? `${value.slice(0, 2 + defaultPrefixChars)}…${value.slice(-suffixChars)}`
      : value);

  return (
    <a
      href={`${EXPLORER}/${type}/${value}`}
      target="_blank"
      rel="noreferrer"
      title={value}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs text-primary-ink transition-colors hover:text-ink hover:underline",
        className
      )}
    >
      {displayLabel}
      {!hideIcon && (
        <ExternalLink
          className="size-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
          strokeWidth={2}
          aria-hidden
        />
      )}
    </a>
  );
}
