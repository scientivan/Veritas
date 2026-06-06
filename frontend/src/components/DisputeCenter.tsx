"use client";

import {useEffect, useRef, useState} from "react";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {toast} from "sonner";
import {ShieldQuestion, Clock, Loader2, ShieldCheck, ChevronDown} from "lucide-react";
import {formatEther, isHex, parseAbiItem, type Address} from "viem";
import {Card} from "./ui/Card";
import {Button} from "./ui/Button";
import {ExplorerLink} from "./ExplorerLink";
import {useContractMeta} from "@/hooks/useContractMeta";
import {useAttestations} from "@/hooks/useAttestations";
import {REGISTRY_ABI} from "@/lib/abis";
import {REGISTRY_ADDRESS} from "@/lib/contracts";

/** Registry owner: the only account that can resolve disputes. */
const REGISTRY_OWNER = "0x490a2F2fE7fB40003585333D5df3C4588f33F11f";

const DISPUTE_FILED_EVENT = parseAbiItem(
  "event DisputeFiled(bytes32 indexed attestationId, address indexed disputer, uint256 bond, uint64 freezeUntil)"
);

type ActiveDispute = {
  attestationId: `0x${string}`;
  disputer: `0x${string}`;
  bond: bigint;
  freezeUntil: bigint;
};

function shortHash(h: string) {
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

function freezeLabel(freezeUntil: bigint) {
  const until = Number(freezeUntil) * 1000;
  const now = Date.now();
  if (until <= now) return "Freeze elapsed";
  const hours = Math.ceil((until - now) / 3_600_000);
  if (hours >= 24) return `Frozen for ${Math.ceil(hours / 24)}d`;
  return `Frozen for ${hours}h`;
}

export function DisputeCenter() {
  const {address, isConnected} = useAccount();
  const publicClient = usePublicClient();
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const {disputeBond, disputeBondEth} = useContractMeta();
  const {pools, isLoading: poolsLoading} = useAttestations();

  // ── Wallet-switch detection: reset form when account changes ──────────────
  const prevAddressRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevAddressRef.current === undefined) {
      prevAddressRef.current = address;
      return;
    }
    if (address !== prevAddressRef.current) {
      prevAddressRef.current = address;
      setTarget("");
      setReason("");
    }
  }, [address]);

  // ── Live active disputes (bounded recent window) ──────────────────────────
  const [disputes, setDisputes] = useState<ActiveDispute[]>([]);
  const [disputesLoading, setDisputesLoading] = useState(true);

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    setDisputesLoading(true);
    (async () => {
      try {
        const latest = await publicClient.getBlockNumber();
        const fromBlock = latest > 9000n ? latest - 9000n : 0n;
        const logs = await publicClient.getLogs({
          address: REGISTRY_ADDRESS,
          event: DISPUTE_FILED_EVENT,
          fromBlock,
          toBlock: latest,
        });
        // Confirm each is still disputed via getRecord; skip resolved ones.
        const candidates = logs
          .map((l) => ({
            attestationId: l.args.attestationId!,
            disputer: l.args.disputer!,
            bond: l.args.bond!,
            freezeUntil: l.args.freezeUntil!,
          }))
          .filter((d) => d.attestationId && d.disputer);
        const records = await Promise.all(
          candidates.map((d) =>
            publicClient
              .readContract({
                address: REGISTRY_ADDRESS,
                abi: REGISTRY_ABI,
                functionName: "getRecord",
                args: [d.attestationId],
              })
              .catch(() => null)
          )
        );
        const active = candidates.filter((_, i) => {
          const rec = records[i] as {disputed: boolean} | null;
          return rec?.disputed === true;
        });
        if (!cancelled) setDisputes(active);
      } catch {
        if (!cancelled) setDisputes([]);
      } finally {
        if (!cancelled) setDisputesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  // ── Owner detection ───────────────────────────────────────────────────────
  const {data: ownerData} = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "owner",
  });
  const ownerAddress = ((ownerData as Address | undefined) ?? REGISTRY_OWNER).toLowerCase();
  const isOwner = !!address && address.toLowerCase() === ownerAddress;

  const bondLabel = disputeBondEth ? `${Number(disputeBondEth).toFixed(3)} ETH` : "0.1 ETH";
  const bondValue = disputeBond ?? 100_000_000_000_000_000n; // fallback 0.1 ETH

  const {writeContract, data: txHash, isPending, reset} = useWriteContract();
  const {isLoading: isConfirming, isSuccess: isConfirmed} = useWaitForTransactionReceipt({
    hash: txHash,
  });

  function submit() {
    const t = target.trim();
    const r = reason.trim();
    if (!t || !r) {
      toast.error("Add an attestation ID and a reason");
      return;
    }
    if (!isHex(t) || t.length !== 66) {
      toast.error("Attestation ID must be a 32-byte hex string (0x + 64 chars)");
      return;
    }
    writeContract(
      {
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "disputeAttestation",
        args: [t as `0x${string}`],
        value: bondValue,
      },
      {
        onSuccess: (hash) => {
          toast.loading(`Dispute tx submitted`, {
            id: "dispute-tx",
            description: `${hash.slice(0, 18)}…, waiting for confirmation`,
          });
        },
        onError: (err) => {
          toast.error("Dispute failed", {description: err.message.slice(0, 120)});
        },
      }
    );
  }

  if (isConfirmed) {
    toast.dismiss("dispute-tx");
    toast.success("Dispute confirmed", {
      description: `Score frozen for 48 h. Bond: ${bondLabel}.`,
    });
    setTarget("");
    setReason("");
    reset();
  }

  const busy = isPending || isConfirming;

  // ── Owner resolve ─────────────────────────────────────────────────────────
  const {writeContract: writeResolve, isPending: resolvePending} = useWriteContract();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  function resolve(attestationId: `0x${string}`, upheld: boolean) {
    setResolvingId(attestationId);
    writeResolve(
      {
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "resolveDispute",
        args: [attestationId, upheld],
      },
      {
        onSuccess: (hash) => {
          toast.success(upheld ? "Dispute upheld" : "Dispute rejected", {
            description: `${hash.slice(0, 18)}…, awaiting confirmation`,
          });
          // Optimistically drop it from the active list.
          setDisputes((ds) => ds.filter((d) => d.attestationId !== attestationId));
        },
        onError: (err) => {
          toast.error("Resolve failed", {description: err.message.slice(0, 120)});
        },
        onSettled: () => setResolvingId(null),
      }
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
      {/* File a dispute */}
      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold text-ink">File a dispute</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Challenge a score you believe is a false positive. Filing locks a {bondLabel} bond and
          freezes the score for 48 hours while it is reviewed.
        </p>

        <label className="mt-6 block">
          <span className="text-xs text-muted">Attestation</span>
          <div className="relative mt-1.5">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={poolsLoading}
              className="h-11 w-full appearance-none rounded-xl border border-border bg-bg px-3 pr-10 text-sm text-ink focus-visible:border-border-strong disabled:opacity-50"
            >
              <option value="" disabled>
                {poolsLoading ? "Loading attestations…" : "Select an attestation"}
              </option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.id.slice(0, 6)}…{p.id.slice(-4)})
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              strokeWidth={2}
              aria-hidden
            />
          </div>
        </label>

        <label className="mt-4 block">
          <span className="text-xs text-muted">Reason</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Explain why the score is wrong."
            className="mt-1.5 w-full resize-none rounded-xl border border-border bg-bg p-3 text-sm text-ink placeholder:text-faint focus-visible:border-border-strong"
          />
        </label>

        <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          <ShieldQuestion className="size-4 shrink-0" strokeWidth={2} aria-hidden />
          Bond returned if upheld, slashed to the treasury if the dispute is frivolous.
          {disputeBond !== undefined && (
            <span className="ml-auto font-mono text-ink">
              {formatEther(disputeBond)} ETH required
            </span>
          )}
        </div>

        <div className="mt-5">
          {isConnected ? (
            <Button size="lg" className="w-full" onClick={submit} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {busy ? (isConfirming ? "Confirming…" : "Submitting…") : `File dispute · ${bondLabel} bond`}
            </Button>
          ) : (
            <div className="[&_button]:w-full">
              <ConnectButton.Custom>
                {({openConnectModal}) => (
                  <Button size="lg" className="w-full" onClick={openConnectModal}>
                    Connect wallet to dispute
                  </Button>
                )}
              </ConnectButton.Custom>
            </div>
          )}
        </div>
      </Card>

      {/* Active disputes */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-ink">Active disputes</h2>
          {isOwner && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] text-primary-ink">
              <ShieldCheck className="size-3" strokeWidth={2.25} aria-hidden />
              Registry owner
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {disputesLoading && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Scanning recent dispute events…
            </div>
          )}

          {!disputesLoading && disputes.length === 0 && (
            <Card className="p-5">
              <div className="text-sm text-muted">No active disputes.</div>
              <p className="mt-1 text-xs text-faint">
                Expected on a fresh testnet. File one on the left to see it appear here.
              </p>
            </Card>
          )}

          {disputes.map((d) => {
            const resolving = resolvePending && resolvingId === d.attestationId;
            return (
              <Card key={d.attestationId} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm">
                      <ExplorerLink
                        value={d.attestationId}
                        type="tx"
                        prefixChars={6}
                        suffixChars={6}
                        className="text-ink hover:text-primary-ink"
                      />
                    </div>
                    <div className="mt-0.5 truncate font-mono text-xs text-muted">
                      by{" "}
                      <ExplorerLink
                        value={d.disputer}
                        type="address"
                        prefixChars={4}
                        suffixChars={4}
                        className="text-muted hover:text-ink"
                      />
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-muted">
                    <Clock className="size-3" strokeWidth={2.25} aria-hidden />
                    {freezeLabel(d.freezeUntil)}
                  </span>
                </div>
                <div className="mt-3 font-mono text-xs text-faint">
                  Bond: {formatEther(d.bond)} ETH
                </div>
                {isOwner && (
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => resolve(d.attestationId, true)}
                      disabled={resolving}
                    >
                      {resolving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                      Uphold
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => resolve(d.attestationId, false)}
                      disabled={resolving}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}

          <p className="px-1 text-xs text-faint">
            Resolved disputes return or slash the bond based on an off-chain review recorded on-chain.
          </p>
        </div>
      </div>
    </div>
  );
}
