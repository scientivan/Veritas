import type {Metadata} from "next";
import {Nav} from "@/components/Nav";
import {Footer} from "@/components/Footer";
import {DisputeCenter} from "@/components/DisputeCenter";

export const metadata: Metadata = {
  title: "Disputes · Veritas Protocol",
  description: "Challenge a Dilution Risk Score you believe is a false positive.",
};

export default function DisputePage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">Dispute center</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            A perceptual hash can flag legitimately similar work. A bonded dispute lets a creator
            challenge a false-positive score before it stands.
          </p>

          <div className="mt-12">
            <DisputeCenter />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
