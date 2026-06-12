import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { PoolTable } from "@/components/PoolTable";
import { VerifiedContracts } from "@/components/VerifiedContracts";
import { buttonClasses } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Pools · Veritas",
  description:
    "Browse content-asset pools and their live Dilution Risk Scores.",
};

export default function PoolsPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
                Available Pools
              </h1>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
                Pools you can provide liquidity to right now. Each carries a live Dilution Risk
                Score, and the LP fee already reflects the content&apos;s risk of being copied or
                AI-replicated, protecting you automatically.
              </p>
            </div>
          </div>

          {/* LP context strip */}
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-border bg-surface px-5 py-4">
            <span className="mt-0.5 size-2 shrink-0 rounded-full bg-green-500" />
            <p className="text-sm text-muted">
              Only pools <span className="font-semibold text-ink">open to liquidity providers</span>{" "}
              are listed here (live Uniswap v4 dynamic-fee pools). Bonding-curve launchpad pools
              aren&apos;t shown, their liquidity is permanently locked at graduation, so there&apos;s
              no LP position to take.
            </p>
          </div>

          <div className="mt-8">
            <PoolTable lpOnly />
          </div>

          <div className="mt-10">
            <VerifiedContracts />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
