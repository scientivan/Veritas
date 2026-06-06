import Link from "next/link";
import {ExternalLink} from "lucide-react";
import {Logo} from "./Logo";
import {HOOK_ADDRESS, REGISTRY_ADDRESS, ORACLE_ADDRESS} from "@/lib/contracts";
import {unichainSepolia} from "@/lib/chains";

const explorer = unichainSepolia.blockExplorers.default.url;

const CONTRACTS = [
  {label: "Hook", addr: HOOK_ADDRESS},
  {label: "Registry", addr: REGISTRY_ADDRESS},
  {label: "Oracle", addr: ORACLE_ADDRESS},
];

export function Footer() {
  return (
    <footer className="mt-28 border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="max-w-xs text-sm text-muted">
            Provenance-aware impermanent-loss protection for tokenized content pools.
          </p>
        </div>

        <nav className="flex flex-col gap-2.5 text-sm text-muted" aria-label="Product">
          <span className="text-xs font-medium uppercase tracking-wide text-faint">Product</span>
          <Link href="/launch" className="transition-colors hover:text-ink">
            Launch your IP
          </Link>
          <Link href="/pools" className="transition-colors hover:text-ink">
            Explore pools
          </Link>
          <Link href="/dispute" className="transition-colors hover:text-ink">
            Dispute center
          </Link>
        </nav>

        <nav className="flex flex-col gap-2.5 text-sm text-muted" aria-label="On-chain contracts">
          <span className="text-xs font-medium uppercase tracking-wide text-faint">
            On-chain · Unichain Sepolia
          </span>
          {CONTRACTS.map((c) => (
            <a
              key={c.label}
              href={`${explorer}/address/${c.addr}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`View Veritas ${c.label} contract on Uniscan`}
              className="group inline-flex items-center gap-1.5 transition-colors hover:text-ink"
            >
              {c.label}
              <ExternalLink
                className="size-3 text-faint transition-colors group-hover:text-primary-ink"
                strokeWidth={2}
                aria-hidden
              />
            </a>
          ))}
        </nav>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-5 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
          <span>Built for the UHI9 Hookathon · Uniswap v4 × Reactive Network</span>
          <span className="font-mono">Unichain Sepolia · testnet</span>
        </div>
      </div>
    </footer>
  );
}
