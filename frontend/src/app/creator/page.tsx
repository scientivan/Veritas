import type {Metadata} from "next";
import Link from "next/link";
import {ArrowRight, Plus} from "lucide-react";
import {Nav} from "@/components/Nav";
import {Footer} from "@/components/Footer";
import {CreatorDashboard} from "@/components/CreatorDashboard";
import {buttonClasses} from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Creator Studio · Veritas",
  description: "Your attested works, launched IP tokens, royalties, and bonding curve status.",
};

export default function CreatorPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
                Creator Studio
              </h1>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
                Your attested works, launched IP tokens, live DRS scores, bonding curve progress,
                and unclaimed royalties.
              </p>
            </div>
            <Link href="/launch" className={buttonClasses("primary", "md")}>
              <Plus className="size-4" strokeWidth={2.5} />
              Launch new IP
            </Link>
          </div>

          <div className="mt-10">
            <CreatorDashboard />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
