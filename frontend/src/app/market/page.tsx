import type {Metadata} from "next";
import {Nav} from "@/components/Nav";
import {Footer} from "@/components/Footer";
import {CollectorTabs} from "@/components/CollectorTabs";
import {CollectorMarketplace} from "@/components/CollectorMarketplace";

export const metadata: Metadata = {
  title: "Marketplace · Veritas Protocol",
  description: "Collect and trade DRS-verified creator IP tokens.",
};

export default function MarketplacePage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
            Marketplace
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            Collect and trade verified creator IP. Every listing carries a live Dilution Risk Score —
            you always see how original the work behind the token is before you buy.
          </p>
          <CollectorTabs current="market" />
          <CollectorMarketplace />
        </div>
      </main>
      <Footer />
    </>
  );
}
