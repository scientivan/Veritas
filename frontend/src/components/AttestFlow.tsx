"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {useAccount, useWriteContract, useWaitForTransactionReceipt} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {toast} from "sonner";
import type {Hex} from "viem";
import {UploadCloud, Check, Loader2, ArrowRight, RotateCcw, ExternalLink} from "lucide-react";
import {DRSGauge} from "./DRSGauge";
import {Button} from "./ui/Button";
import {DRS_GATE, dynamicFeeBps} from "@/lib/drs";
import {useContractMeta} from "@/hooks/useContractMeta";
import {REGISTRY_ABI} from "@/lib/abis";
import {REGISTRY_ADDRESS} from "@/lib/contracts";
import {
  analyzeContent,
  fileToBase64,
  requestAttestation,
  confirmAttestation,
  toOnChainSigs,
  ORACLE_URL,
  type OracleContentType,
  type OracleRisk,
  type OracleAnalysis,
} from "@/lib/oracle";
import {formatFeeBps, formatPct, cn} from "@/lib/utils";

const STEPS = [
  "Fingerprinting (pHash + blockhash)",
  "Embedding + scanning the corpus for near-duplicates",
  "Running the AI detector ensemble",
  "Signing the Dilution Risk Score (EIP-712)",
];

/** A piece of content to attest: enough to re-send to the oracle on submit. */
interface Subject {
  title: string;
  swatch: string;
  type: OracleContentType;
  dataBase64?: string;
  url?: string;
  text?: string;
}

const DEMOS: {label: string; subject: Subject}[] = [
  {
    label: "Unique",
    subject: {
      title: "Unique upload",
      type: "image",
      url: "https://picsum.photos/id/99/320/320",
      swatch: hueSwatch("unique"),
    },
  },
  {
    label: "Widely copied",
    subject: {
      title: "Widely-copied image",
      type: "image",
      url: "https://picsum.photos/id/237/320/320",
      swatch: hueSwatch("common"),
    },
  },
  {
    label: "AI-replicated",
    subject: {
      title: "AI-generated portrait",
      type: "image",
      url: "https://thispersondoesnotexist.com/",
      swatch: hueSwatch("ai"),
    },
  },
];

function hueSwatch(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `oklch(0.62 0.15 ${h})`;
}

interface Analyzed {
  pHash: Hex;
  blockHash: Hex;
  risk: OracleRisk;
  quorum: OracleAnalysis["quorum"];
}

export function AttestFlow() {
  const {isConnected, address} = useAccount();
  const {attestFee, attestFeeEth} = useContractMeta();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [analyzed, setAnalyzed] = useState<Analyzed | null>(null);
  const [phase, setPhase] = useState<"idle" | "computing" | "done" | "error">("idle");
  const [step, setStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {writeContractAsync, isPending: isWriting} = useWriteContract();
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [attestationId, setAttestationId] = useState<Hex | undefined>();
  const {isLoading: isConfirming, isSuccess: isConfirmed} = useWaitForTransactionReceipt({hash: txHash});

  // Kick off a real oracle analysis (preview, no wallet needed).
  const start = useCallback(async (s: Subject) => {
    setSubject(s);
    setAnalyzed(null);
    setTxHash(undefined);
    setStep(0);
    setErrorMsg("");
    setPhase("computing");
    try {
      const json = await analyzeContent({type: s.type, url: s.url, dataBase64: s.dataBase64, text: s.text});
      setAnalyzed({pHash: json.pHash, blockHash: json.blockHash, risk: json.risk, quorum: json.quorum});
      setPhase("done");
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? e.message
          : `Oracle service unreachable at ${ORACLE_URL}. Start it: cd oracle && npm run dev`,
      );
      setPhase("error");
    }
  }, []);

  // Once the attest tx confirms, tell the oracle so it grows its corpus.
  useEffect(() => {
    if (isConfirmed && attestationId) {
      confirmAttestation(attestationId).catch(() => {});
    }
  }, [isConfirmed, attestationId]);

  // Cosmetic step animation while the (real) oracle call is in flight.
  useEffect(() => {
    if (phase !== "computing") return;
    if (step >= STEPS.length - 1) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setStep((s) => s + 1), reduce ? 0 : 620);
    return () => clearTimeout(t);
  }, [phase, step]);

  async function onFiles(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const isText = f.type.startsWith("text/") || f.name.endsWith(".txt");
    try {
      if (isText) {
        start({title: f.name, type: "text", text: await f.text(), swatch: hueSwatch(f.name)});
      } else {
        const type: OracleContentType = f.type.startsWith("audio/") ? "audio" : "image";
        start({title: f.name, type, dataBase64: await fileToBase64(f), swatch: hueSwatch(f.name)});
      }
    } catch {
      toast.error("Could not read that file");
    }
  }

  async function createPool() {
    if (!subject || !analyzed || !address) return;
    try {
      // Re-attest with the connected owner so the signatures bind to the submitter.
      const att = await requestAttestation({
        type: subject.type,
        owner: address,
        ipfsCid: `ipfs://veritas/${subject.title}`,
        dataBase64: subject.dataBase64,
        url: subject.url,
        text: subject.text,
      });
      const hash = await writeContractAsync({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "attest",
        args: [
          att.pHash,
          att.blockHash,
          att.ipfsCid,
          toOnChainSigs(att.aiSigs),
          toOnChainSigs(att.dSigs),
        ],
        value: attestFee ?? 0n,
      });
      setAttestationId(att.attestationId);
      setTxHash(hash);
      toast.success("Attestation submitted", {description: "Signing the pool onto Unichain Sepolia…"});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      toast.error(msg.includes("User rejected") ? "Transaction rejected" : "Could not create pool", {
        description: msg.slice(0, 120),
      });
    }
  }

  const risk = analyzed?.risk;
  const drs = risk?.drs ?? 0;
  const gated = risk?.gated ?? drs > DRS_GATE;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
      {/* Input side */}
      <div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border-strong hover:bg-surface/50"
          )}
        >
          <UploadCloud className="size-8 text-muted" strokeWidth={1.5} aria-hidden />
          <div>
            <p className="text-sm font-medium text-ink">Drop content to attest</p>
            <p className="mt-1 text-xs text-muted">
              Image or text. It&apos;s fingerprinted and scored by the live oracle, then signed.
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept="image/*,audio/*,.txt"
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>

        <div className="mt-6">
          <p className="text-xs text-muted">Or try a demo asset (scored live by the oracle):</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEMOS.map((d) => (
              <button
                key={d.label}
                onClick={() => start(d.subject)}
                className="rounded-lg border border-border bg-surface/50 px-3 py-1.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-ink"
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result side */}
      <div className="rounded-2xl border border-border bg-surface/40 p-6 sm:p-8">
        {phase === "idle" && (
          <div className="flex h-full min-h-[340px] flex-col items-center justify-center text-center">
            <p className="max-w-xs text-sm text-muted">
              The Dilution Risk Score appears here once you add content. Higher scores mean higher
              copy and AI-replication risk, and a higher pool fee.
            </p>
          </div>
        )}

        {phase === "computing" && (
          <div className="flex min-h-[340px] flex-col justify-center gap-3">
            {STEPS.map((label, i) => {
              const state = i < step ? "done" : i === step ? "active" : "pending";
              return (
                <div
                  key={label}
                  className={cn(
                    "flex items-center gap-3 text-sm transition-opacity",
                    state === "pending" ? "opacity-40" : "opacity-100"
                  )}
                >
                  <span className="grid size-6 place-items-center">
                    {state === "done" ? (
                      <Check className="size-4 text-risk-low" strokeWidth={2.5} aria-hidden />
                    ) : state === "active" ? (
                      <Loader2 className="size-4 animate-spin text-primary-ink" aria-hidden />
                    ) : (
                      <span className="size-1.5 rounded-full bg-faint" />
                    )}
                  </span>
                  <span className={state === "done" ? "text-ink" : "text-muted"}>{label}</span>
                </div>
              );
            })}
          </div>
        )}

        {phase === "error" && (
          <div className="flex min-h-[340px] flex-col items-center justify-center gap-4 text-center">
            <p className="max-w-sm text-sm text-risk-high">{errorMsg}</p>
            <Button variant="secondary" size="lg" onClick={() => setPhase("idle")}>
              <RotateCcw className="size-4" strokeWidth={2.25} />
              Try again
            </Button>
          </div>
        )}

        {phase === "done" && subject && risk && (
          <div className="flex min-h-[340px] flex-col">
            <DRSGauge drs={drs} d={risk.d} a={risk.a} gated={gated} />

            {risk.matches.length > 0 && (
              <p className="mt-3 text-center text-xs text-muted">
                Nearest corpus match:{" "}
                <span className="font-mono text-ink">{(risk.matches[0].similarity * 100).toFixed(0)}%</span>{" "}
                similar to {risk.matches[0].label}
              </p>
            )}

            {analyzed && <QuorumStrip ops={analyzed.quorum.operators} />}

            <div className="mt-5 rounded-xl border border-border bg-bg/60 p-4 text-center">
              {gated ? (
                <p className="text-sm leading-relaxed text-muted">
                  DRS {formatPct(drs)} is above the {formatPct(DRS_GATE)} gate. A pool can&apos;t be
                  created for this content.
                </p>
              ) : (
                <p className="text-sm leading-relaxed text-muted">
                  A pool would open at a{" "}
                  <span className="font-mono text-ink">{formatFeeBps(dynamicFeeBps(drs))}</span> LP fee,
                  pricing the dilution risk for liquidity providers.
                  {attestFeeEth && (
                    <span className="mt-1 block text-xs text-faint">
                      On-chain attest fee: {Number(attestFeeEth).toFixed(4)} ETH
                    </span>
                  )}
                </p>
              )}
            </div>

            {isConfirmed && attestationId ? (
              <a
                href={`/pool/${attestationId}`}
                className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-risk-low/40 bg-risk-low/10 px-4 py-3 text-sm font-medium text-risk-low transition-colors hover:bg-risk-low/15"
              >
                <Check className="size-4" strokeWidth={2.5} />
                Pool created, view it
                <ArrowRight className="size-4" strokeWidth={2.25} />
              </a>
            ) : (
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                {gated ? (
                  <Button variant="secondary" size="lg" disabled className="flex-1">
                    Pool gated
                  </Button>
                ) : isConnected ? (
                  <Button
                    size="lg"
                    className="flex-1"
                    onClick={createPool}
                    disabled={isWriting || isConfirming}
                  >
                    {isWriting ? "Confirm in wallet…" : isConfirming ? "Creating pool…" : "Create pool"}
                    {!isWriting && !isConfirming && <ArrowRight className="size-4" strokeWidth={2.25} />}
                  </Button>
                ) : (
                  <div className="flex-1 [&_button]:w-full">
                    <ConnectButton.Custom>
                      {({openConnectModal}) => (
                        <Button size="lg" className="w-full" onClick={openConnectModal}>
                          Connect wallet to create pool
                        </Button>
                      )}
                    </ConnectButton.Custom>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => {
                    setPhase("idle");
                    setSubject(null);
                    setAnalyzed(null);
                    setTxHash(undefined);
                    setAttestationId(undefined);
                  }}
                >
                  <RotateCcw className="size-4" strokeWidth={2.25} />
                  Reset
                </Button>
              </div>
            )}

            {txHash && (
              <a
                href={`https://sepolia.uniscan.xyz/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted hover:text-ink"
              >
                View transaction <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Shows that independent detector ensembles cross-checked the score on-chain (2-of-3). */
function QuorumStrip({ops}: {ops: {ensemble: string; agreesOnD: boolean}[]}) {
  if (!ops.length) return null;
  const agreed = ops.filter((o) => o.agreesOnD).length;
  const label: Record<string, string> = {dinov2: "DINOv2", clip: "CLIP", "dinov2-r": "DINOv2·2"};
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs">
      <span className="text-muted">
        {agreed} of {ops.length} independent detectors agreed
      </span>
      {ops.map((o, i) => (
        <span
          key={i}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono",
            o.agreesOnD
              ? "border-risk-low/40 bg-risk-low/10 text-risk-low"
              : "border-border bg-surface/40 text-faint"
          )}
        >
          {o.agreesOnD && <Check className="size-3" strokeWidth={2.5} />}
          {label[o.ensemble] ?? o.ensemble}
        </span>
      ))}
    </div>
  );
}
