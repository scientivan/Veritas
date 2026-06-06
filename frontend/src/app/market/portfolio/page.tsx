import type {Metadata} from "next";
import {Nav} from "@/components/Nav";
import {Footer} from "@/components/Footer";
import {CollectorTabs} from "@/components/CollectorTabs";
import {CollectorPortfolio} from "@/components/CollectorPortfolio";

export const metadata: Metadata = {
  title: "Portfolio · Veritas Protocol",
  description: "Your collection of DRS-verified creator IP tokens and its live value.",
};

export default function CollectorPortfolioPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
            Your Collection
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            Every IP token you hold, valued from live pool state. Click any holding to trade it.
          </p>
          <CollectorTabs current="portfolio" />
          <CollectorPortfolio />
        </div>
      </main>
      <Footer />
    </>
  );
}
