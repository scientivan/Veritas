import {Waves} from "lucide-react";
import {Card} from "./ui/Card";
import {ExplorerLink} from "./ExplorerLink";
import {dynamicFeeBps} from "@/lib/drs";
import {formatFeeBps} from "@/lib/utils";
import {POOL_MANAGER_ADDRESS} from "@/lib/contracts";
import type {LivePool} from "@/lib/livePools";


/** Surfaces a real Uniswap v4 pool opened through the hook for this attestation. */
export function LivePoolCard({pool, drs}: {pool: LivePool; drs: number}) {
  const fee = dynamicFeeBps(drs, pool.baseFeeBps, pool.maxFeeBps);
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <Waves className="size-4 text-risk-low" strokeWidth={2.25} aria-hidden />
        <h2 className="font-display text-lg font-semibold text-ink">Live Uniswap v4 pool</h2>
        <span className="rounded-full border border-risk-low/40 bg-risk-low/10 px-2 py-0.5 text-xs text-risk-low">
          open
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        A real v4 pool was opened through the Veritas hook (liquidity added, swap executed). The hook
        sets the LP fee from the live DRS on every swap.
      </p>
      <dl className="mt-4 flex flex-col gap-3 text-sm">
        <Row label="Dynamic LP fee (now)" value={formatFeeBps(fee)} />
        <Row label="Fee range" value={`${formatFeeBps(pool.baseFeeBps)} to ${formatFeeBps(pool.maxFeeBps)}`} />
        <RowLink label="Token 0 (Content)" value={pool.token0} />
        <RowLink label="Token 1 (Quote)" value={pool.token1} />
        <Row
          label="Pool id"
          value={`${pool.poolId.slice(0, 10)}…${pool.poolId.slice(-8)}`}
          mono
        />
      </dl>
      <ExplorerLink
        value={POOL_MANAGER_ADDRESS}
        type="address"
        label="View PoolManager on Uniscan"
        className="mt-4 text-xs text-muted hover:text-ink"
      />
    </Card>
  );
}

function Row({label, value, mono}: {label: string; value: string; mono?: boolean}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono text-xs text-ink" : "font-mono tnum text-ink"}>{value}</dd>
    </div>
  );
}

function RowLink({label, value, type = "address"}: {label: string; value: string; type?: "address" | "tx"}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd>
        <ExplorerLink value={value} type={type} prefixChars={4} suffixChars={4} />
      </dd>
    </div>
  );
}
