import type {Metadata} from "next";
import {Nav} from "@/components/Nav";
import {Footer} from "@/components/Footer";
import {AttestFlow} from "@/components/AttestFlow";

export const metadata: Metadata = {
  title: "Attest · Veritas Protocol",
  description: "Attest content and watch its Dilution Risk Score compute.",
};

export default function AttestPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">Attest content</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            Add a piece of content to compute its Dilution Risk Score. The score combines how
            duplicated the content is (D) with how AI-replicable it looks (A), then sets the pool fee.
          </p>

          <div className="mt-12">
            <AttestFlow />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
