import type {Metadata} from "next";
import {Nav} from "@/components/Nav";
import {Footer} from "@/components/Footer";
import {PortfolioDashboard} from "@/components/PortfolioDashboard";

export const metadata: Metadata = {
  title: "LP Portfolio · Veritas Protocol",
  description: "Compare pool risk, monitor DRS gate proximity, and simulate IL protection for your LP positions.",
};

export default function PortfolioPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="mb-10">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
              LP Portfolio
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
              Compare pools by risk and return, track how close each pool is to the DRS gate, and
              simulate whether the dynamic fee compensates for impermanent loss at any DRS level.
            </p>
          </div>
          <PortfolioDashboard />
        </div>
      </main>
      <Footer />
    </>
  );
}
