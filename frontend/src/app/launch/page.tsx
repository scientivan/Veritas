import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { LaunchFlow } from "@/components/LaunchFlow";

export const metadata: Metadata = {
  title: "Launch Your IP · Veritas",
  description:
    "Verify, attest, and tokenize your visual artwork as an ERC-20 IP token in one flow. DRS-gated: only original content passes.",
};

export default function LaunchPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <div className="mb-10">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
              Launch Your IP
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
              Verify your artwork, attest its Dilution Risk Score on-chain, and
              mint it into a tradeable ERC-20 token with a bonding-curve
              launchpad and perpetual royalties, all in one flow. Only content
              that passes the DRS gate can be tokenized: no copies, no
              AI-generated art.
            </p>
          </div>

          <LaunchFlow />
        </div>
      </main>
      <Footer />
    </>
  );
}
