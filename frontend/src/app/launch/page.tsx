import type {Metadata} from "next";
import {ArrowRight} from "lucide-react";
import Link from "next/link";
import {Nav} from "@/components/Nav";
import {Footer} from "@/components/Footer";
import {LaunchFlow} from "@/components/LaunchFlow";
import {buttonClasses} from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Launch IP · Veritas Protocol",
  description:
    "Tokenize your visual artwork as an ERC-20 IP token. DRS-gated: only original content passes.",
};

export default function LaunchPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
                Launch Your IP
              </h1>
              <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted">
                Turn your verified artwork into a tradeable ERC-20 token with a bonding-curve
                launchpad and perpetual on-chain royalties. Only content that passes the DRS gate
                can be tokenized — no copies, no AI-generated art.
              </p>
            </div>
            <Link href="/attest" className={buttonClasses("secondary", "md")}>
              Attest first
              <ArrowRight className="size-4" strokeWidth={2.25} />
            </Link>
          </div>

          <LaunchFlow />
        </div>
      </main>
      <Footer />
    </>
  );
}
