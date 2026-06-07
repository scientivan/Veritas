"use client";

import {useReadContract} from "wagmi";
import type {Address} from "viem";
import {ShieldCheck} from "lucide-react";
import {LAUNCH_REGISTRY_ABI} from "@/lib/abis";
import {LAUNCH_REGISTRY_ADDRESS} from "@/lib/contracts";

interface Props {
  tokenAddress: Address;
  /** "inline" = small pill for table rows; "card" = slightly larger for cards */
  variant?: "inline" | "card";
}

export function IPVerifiedBadge({tokenAddress, variant = "inline"}: Props) {
  const {data: verified} = useReadContract({
    address: LAUNCH_REGISTRY_ADDRESS,
    abi: LAUNCH_REGISTRY_ABI,
    functionName: "isVerified",
    args: [tokenAddress],
  });

  if (!verified) return null;

  if (variant === "card") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-risk-low/30 bg-risk-low/10 px-2.5 py-0.5 text-xs font-medium text-risk-low">
        <ShieldCheck className="size-3.5" strokeWidth={2.25} />
        IP Verified
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-risk-low/25 bg-risk-low/10 px-1.5 py-px text-[10px] font-medium text-risk-low">
      <ShieldCheck className="size-2.5" strokeWidth={2.25} />
      Verified
    </span>
  );
}
