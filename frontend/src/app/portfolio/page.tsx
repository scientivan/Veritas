import type {Metadata} from "next";
import {Nav} from "@/components/Nav";
import {Footer} from "@/components/Footer";
import {PortfolioDashboard} from "@/components/PortfolioDashboard";

export const metadata: Metadata = {
  title: "Portfolio · Veritas",
  description: "Your liquidity positions, IP-token collection, trade history, and IL protection simulator in one place.",
};

export default function PortfolioPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="mb-10">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
              Portfolio
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
              Everything you hold in Veritas: liquidity positions and their DRS-calibrated fees, your
              collection of IP tokens, your full trade history, and an IL protection simulator.
            </p>
          </div>
          <PortfolioDashboard />
        </div>
      </main>
      <Footer />
    </>
  );
}
