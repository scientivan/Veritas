import type {Metadata} from "next";
import {Nav} from "@/components/Nav";
import {Footer} from "@/components/Footer";
import {CollectorTabs} from "@/components/CollectorTabs";
import {TradeHistoryView} from "@/components/TradeHistoryView";

export const metadata: Metadata = {
  title: "History · Veritas Protocol",
  description: "Your buy and sell history across creator IP tokens.",
};

export default function TradeHistoryPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
            Trade History
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            A record of every buy and sell you make in the marketplace, with a link to each on-chain
            transaction.
          </p>
          <CollectorTabs current="history" />
          <TradeHistoryView />
        </div>
      </main>
      <Footer />
    </>
  );
}
