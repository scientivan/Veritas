import {ShieldCheck, TriangleAlert, Lock} from "lucide-react";
import {tierForDrs, TIER_META} from "@/lib/drs";
import type {RiskTier} from "@/lib/types";
import {cn} from "@/lib/utils";

const ICON: Record<RiskTier, typeof ShieldCheck> = {
  low: ShieldCheck,
  elevated: TriangleAlert,
  high: Lock,
};

/**
 * Risk tier badge. Color-blind safe by construction: the tier is carried by an
 * icon AND a text label, not color alone.
 */
export function RiskPill({
  drs,
  gated = false,
  className,
  size = "md",
}: {
  drs: number;
  gated?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const tier = tierForDrs(drs);
  const meta = TIER_META[tier];
  const Icon = ICON[tier];
  const label = gated ? "Gated" : meta.label;

  return (
    <span
      style={{
        color: meta.cssVar,
        backgroundColor: `color-mix(in oklch, ${meta.cssVar} 13%, transparent)`,
        borderColor: `color-mix(in oklch, ${meta.cssVar} 32%, transparent)`,
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2.25} aria-hidden />
      {label}
    </span>
  );
}
