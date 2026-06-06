import type {Metadata} from "next";
import Link from "next/link";
import {ArrowRight} from "lucide-react";
import {Nav} from "@/components/Nav";
import {Footer} from "@/components/Footer";
import {PoolTable} from "@/components/PoolTable";
import {VerifiedContracts} from "@/components/VerifiedContracts";
import {buttonClasses} from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Pools · Veritas Protocol",
  description: "Browse content-asset pools and their live Dilution Risk Scores.",
};

export default function PoolsPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">Pools</h1>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
                Every pool carries a live Dilution Risk Score. The fee you see already reflects the
                content&apos;s risk of being copied or AI-replicated.
              </p>
            </div>
            <Link href="/attest" className={buttonClasses("primary", "md")}>
              Attest content
              <ArrowRight className="size-4" strokeWidth={2.25} />
            </Link>
          </div>

          <div className="mt-10">
            <PoolTable />
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
