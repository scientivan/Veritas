import {ShieldCheck, ExternalLink} from "lucide-react";
import {VERIFIED_CONTRACTS, EXPLORER, SOURCIFY_LOOKUP} from "@/lib/contracts";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** On-chain provenance strip: the live, Sourcify-verified contracts on Unichain Sepolia. */
export function VerifiedContracts() {
  return (
    <section className="rounded-2xl border border-border bg-surface/30 p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-risk-low" strokeWidth={2.25} aria-hidden />
        <h2 className="text-sm font-medium text-ink">Live on Unichain Sepolia</h2>
        <span className="rounded-full border border-risk-low/40 bg-risk-low/10 px-2 py-0.5 text-xs text-risk-low">
          source-verified
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Every contract below is deployed and verified on-chain. The oracle runs a 2-of-3 operator
        quorum; the Reactive callback drives the trustless on-chain dilution channel.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {VERIFIED_CONTRACTS.map((c) => (
          <li
            key={c.address}
            className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg/50 px-3 py-2"
          >
            <span className="text-sm text-ink">{c.name}</span>
            <span className="flex items-center gap-2">
              <a
                href={`${EXPLORER}/address/${c.address}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-muted hover:text-ink"
                title="View on Uniscan"
              >
                {short(c.address)}
              </a>
              <a
                href={`${SOURCIFY_LOOKUP}/${c.address}`}
                target="_blank"
                rel="noreferrer"
                className="text-muted hover:text-primary-ink"
                title="Verified source on Sourcify"
              >
                <ExternalLink className="size-3.5" />
              </a>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
