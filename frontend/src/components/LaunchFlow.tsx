"use client";

import {useState, useCallback, useEffect, useRef} from "react";
import {useAccount, usePublicClient} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {
  CheckCircle2,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Coins,
  Rocket,
  AlertCircle,
  UploadCloud,
  Check,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import type {Hex} from "viem";
import {parseUnits} from "viem";
import {Button} from "./ui/Button";
import {DRSGauge} from "./DRSGauge";
import {ExplorerLink} from "./ExplorerLink";
import {useIPLaunch} from "@/hooks/useIPLaunch";
import {useLaunchedIPs} from "@/hooks/useLaunchedIPs";
import {useLaunchpadPools} from "@/hooks/useLaunchpadPools";
import {useContractMeta} from "@/hooks/useContractMeta";
import {RAISE_TOKEN_ADDRESS, RAISE_TOKEN_SYMBOL, REGISTRY_ADDRESS} from "@/lib/contracts";
import {REGISTRY_ABI} from "@/lib/abis";
import {defaultAllocations, parseHardCap} from "@/lib/launchpad";
import {DRS_GATE, dynamicFeeBps, tierForDrs} from "@/lib/drs";
import {
  analyzeContent,
  requestAttestation,
  fileToBase64,
  toOnChainSigs,
  ORACLE_URL,
  type OracleContentType,
  type OracleRisk,
  type OracleAnalysis,
  type OracleAttestation,
} from "@/lib/oracle";
import {formatPct, formatFeeBps, cn} from "@/lib/utils";
import {formatEther} from "viem";

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {id: 1, icon: ShieldCheck, label: "Verify Artwork", desc: "Upload + score (DRS gate)"},
  {id: 2, icon: Coins, label: "Attest & Mint", desc: "Sign DRS on-chain + deploy token"},
  {id: 3, icon: Rocket, label: "Register IP", desc: "Link token to attestation"},
  {id: 4, icon: TrendingUp, label: "Open Launchpad", desc: "Bonding curve + royalties"},
] as const;

// ── Oracle preview animation labels ─────────────────────────────────────────────

const SCAN_STEPS = [
  "Fingerprinting (pHash + blockhash)",
  "Embedding + scanning the corpus for near-duplicates",
  "Running the AI detector ensemble",
  "Scoring the Dilution Risk Score",
];

// ── Types ────────────────────────────────────────────────────────────────────

/** A piece of content to attest: enough to re-send to the oracle on submit. */
interface Subject {
  title: string;
  swatch: string;
  type: OracleContentType;
  dataBase64?: string;
  url?: string;
  text?: string;
}

interface Analyzed {
  pHash: Hex;
  blockHash: Hex;
  risk: OracleRisk;
  quorum: OracleAnalysis["quorum"];
}

const DEMOS: {label: string; subject: Subject}[] = [
  {
    label: "Unique",
    subject: {
      title: "Unique upload",
      type: "image",
      url: "https://picsum.photos/id/700/320/320",
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

// ── Main component ────────────────────────────────────────────────────────────

export function LaunchFlow() {
  const {address, isConnected} = useAccount();
  const publicClient = usePublicClient();
  const router = useRouter();
  const {state, attestOnChain, mintToken, registerIP, openLaunchpad, reset} = useIPLaunch();
  const {addLaunchedIP} = useLaunchedIPs();
  const {addLaunchpad} = useLaunchpadPools();
  const {attestFee, attestFeeEth} = useContractMeta();

  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: content + oracle analysis (off-chain preview).
  const [subject, setSubject] = useState<Subject | null>(null);
  const [analyzed, setAnalyzed] = useState<Analyzed | null>(null);
  const [phase, setPhase] = useState<"idle" | "computing" | "done" | "error">("idle");
  const [scanStep, setScanStep] = useState(0);
  const [analyzeError, setAnalyzeError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Step 2/3: token + registration.
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenSupply, setTokenSupply] = useState("1000000");
  const [ipfsUri, setIpfsUri] = useState("");
  const [flowError, setFlowError] = useState<string | null>(null);

  // Step 4: launchpad raise target (in raise-token units).
  const [hardCap, setHardCap] = useState("1000");

  // Signed attestation, prefetched on Step 1 → 2 so the wallet popup is instant.
  const [attestation, setAttestation] = useState<OracleAttestation | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);

  // Resume mode: when arriving via /launch?attestation=<id> from Creator Studio,
  // skip Verify and jump straight to minting against an already-attested record.
  const [resumeId, setResumeId] = useState<Hex | null>(null);

  const risk = analyzed?.risk ?? null;
  const drs = risk?.drs ?? null;
  const isGated = risk?.gated ?? (drs !== null && drs > DRS_GATE);
  const tier = drs !== null ? tierForDrs(drs) : null;

  // Reset everything when the wallet changes.
  const prevAddressRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevAddressRef.current === undefined) {
      prevAddressRef.current = address;
      return;
    }
    if (address !== prevAddressRef.current) {
      prevAddressRef.current = address;
      setSubject(null);
      setAnalyzed(null);
      setAttestation(null);
      setIsPreparing(false);
      setPhase("idle");
      setScanStep(0);
      setAnalyzeError("");
      setTokenName("");
      setTokenSymbol("");
      setIpfsUri("");
      setFlowError(null);
      setResumeId(null);
      setCurrentStep(1);
      reset();
    }
  }, [address, reset]);

  // Resume from a deep link: /launch?attestation=<id>. If the record is already
  // attested on-chain, prefill its IPFS URI and jump to the mint step (the attest
  // tx is skipped on-chain since the attestation already exists).
  const resumeHandledRef = useRef(false);
  useEffect(() => {
    if (resumeHandledRef.current || typeof window === "undefined" || !publicClient) return;
    const param = new URLSearchParams(window.location.search).get("attestation");
    if (!param || !/^0x[0-9a-fA-F]{64}$/.test(param)) return;
    resumeHandledRef.current = true;
    const attId = param as Hex;
    void (async () => {
      try {
        const attested = await publicClient.readContract({
          address: REGISTRY_ADDRESS,
          abi: REGISTRY_ABI,
          functionName: "isAttested",
          args: [attId],
        });
        if (!attested) return;
        const rec = (await publicClient.readContract({
          address: REGISTRY_ADDRESS,
          abi: REGISTRY_ABI,
          functionName: "getRecord",
          args: [attId],
        })) as {ipfsCid?: string};
        setResumeId(attId);
        if (rec?.ipfsCid) setIpfsUri(rec.ipfsCid);
        setCurrentStep(2);
      } catch {
        // Bad link / read failure: silently stay on Step 1.
      }
    })();
  }, [publicClient]);

  // Cosmetic scan animation while the (real) oracle analyze call is in flight.
  useEffect(() => {
    if (phase !== "computing") return;
    if (scanStep >= SCAN_STEPS.length - 1) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setScanStep((s) => s + 1), reduce ? 0 : 620);
    return () => clearTimeout(t);
  }, [phase, scanStep]);

  // Save the launched record + advance to the launchpad step once registration lands.
  useEffect(() => {
    if (state.step === "registered" && state.ipTokenAddress && state.attestationId) {
      addLaunchedIP({
        attestationId: state.attestationId,
        tokenAddress: state.ipTokenAddress,
        tokenName,
        tokenSymbol,
        launchedAt: Date.now(),
      });
      setCurrentStep(4);
    }
    // state.step is the trigger; token fields are read once at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.ipTokenAddress, state.attestationId, addLaunchedIP]);

  // Persist the opened bonding-curve launchpad so the marketplace / studio find it.
  useEffect(() => {
    if (
      state.step === "opened" &&
      state.poolId &&
      state.ipTokenAddress &&
      state.attestationId &&
      state.ipIsToken0 !== null
    ) {
      addLaunchpad({
        attestationId: state.attestationId,
        ipToken: state.ipTokenAddress,
        poolId: state.poolId,
        raiseToken: RAISE_TOKEN_ADDRESS,
        ipIsToken0: state.ipIsToken0,
        tokenName,
        tokenSymbol,
        hardCap,
        openedAt: Date.now(),
      });
    }
  }, [state.step, state.poolId, state.ipTokenAddress, state.attestationId, state.ipIsToken0, tokenName, tokenSymbol, hardCap, addLaunchpad]);

  // Kick off a real oracle analysis (preview, no wallet, no chain).
  const startAnalyze = useCallback(async (s: Subject) => {
    setSubject(s);
    setAnalyzed(null);
    setAttestation(null);
    setFlowError(null);
    setScanStep(0);
    setAnalyzeError("");
    setPhase("computing");
    try {
      const json = await analyzeContent({type: s.type, url: s.url, dataBase64: s.dataBase64, text: s.text});
      setAnalyzed({pHash: json.pHash, blockHash: json.blockHash, risk: json.risk, quorum: json.quorum});
      setPhase("done");
    } catch (e) {
      setAnalyzeError(
        e instanceof Error
          ? e.message
          : `Oracle service unreachable at ${ORACLE_URL}. Start it: cd oracle && npm run dev`
      );
      setPhase("error");
    }
  }, []);

  async function onFiles(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const isText = f.type.startsWith("text/") || f.name.endsWith(".txt");
    try {
      if (isText) {
        startAnalyze({title: f.name, type: "text", text: await f.text(), swatch: hueSwatch(f.name)});
      } else {
        const type: OracleContentType = f.type.startsWith("audio/") ? "audio" : "image";
        startAnalyze({title: f.name, type, dataBase64: await fileToBase64(f), swatch: hueSwatch(f.name)});
      }
    } catch {
      toast.error("Could not read that file");
    }
  }

  // Request a fresh signed attestation from the oracle (runs the full pipeline).
  const fetchAttestation = useCallback(async (): Promise<OracleAttestation | null> => {
    if (!subject || !address) return null;
    return requestAttestation({
      type: subject.type,
      owner: address,
      ipfsCid: `ipfs://veritas/${subject.title}`,
      dataBase64: subject.dataBase64,
      url: subject.url,
      text: subject.text,
    });
  }, [subject, address]);

  // Prefetch the signed attestation (kicked off when advancing to Step 2) so the
  // slow oracle round-trip overlaps with the user typing token details, and the
  // wallet signature popup appears instantly on "Attest & Mint".
  const prepareAttestation = useCallback(async () => {
    setFlowError(null);
    setIsPreparing(true);
    try {
      const att = await fetchAttestation();
      if (att) setAttestation(att);
    } catch (e) {
      setFlowError(
        e instanceof Error ? e.message : `Oracle unreachable at ${ORACLE_URL}. Start it: cd oracle && npm run dev`
      );
    } finally {
      setIsPreparing(false);
    }
  }, [fetchAttestation]);

  // Step 2 action: attest on-chain (deferred), then mint the IP token.
  const handleAttestAndMint = useCallback(async () => {
    if (!address || !tokenName || !tokenSymbol) return;
    // Fresh flow needs the oracle preview; resume mode reuses an existing attestation.
    if (!resumeId && (!subject || !analyzed)) return;
    setFlowError(null);

    let attId: Hex | null;

    if (resumeId) {
      // Already attested on-chain: attestOnChain detects this and skips the write,
      // so the pHash/blockHash/sigs are unused, pass zero placeholders.
      const zero = `0x${"00".repeat(32)}` as Hex;
      attId = await attestOnChain({
        pHash: zero,
        blockHash: zero,
        ipfsCid: ipfsUri || `ipfs://veritas/${tokenSymbol}`,
        aiSigs: [],
        dSigs: [],
        attestationId: resumeId,
        attestFee: 0n,
      });
    } else {
      // 1. Use the prefetched signed attestation, or fetch it now as a fallback.
      let att = attestation;
      if (!att) {
        try {
          att = await fetchAttestation();
        } catch (e) {
          setFlowError(
            e instanceof Error ? e.message : `Oracle unreachable at ${ORACLE_URL}. Start it: cd oracle && npm run dev`
          );
          return;
        }
      }
      if (!att) return;

      // 2. Attestation tx fires right before mint (reused if already on-chain).
      attId = await attestOnChain({
        pHash: att.pHash,
        blockHash: att.blockHash,
        ipfsCid: att.ipfsCid,
        aiSigs: toOnChainSigs(att.aiSigs),
        dSigs: toOnChainSigs(att.dSigs),
        attestationId: att.attestationId,
        attestFee: attestFee ?? 0n,
      });
      if (attId && !ipfsUri) setIpfsUri(att.ipfsCid);
    }
    if (!attId) return; // hook sets state.error

    // 3. Mint the IP token. IPTokenFactory mints `initialSupply * 10**18` itself,
    //    so pass the RAW human count (not a parseUnits value) to avoid double-scaling.
    const supply = BigInt(Math.max(0, Math.floor(Number(tokenSupply) || 0)));
    const token = await mintToken(tokenName, tokenSymbol, supply);
    if (token) setCurrentStep(3);
  }, [resumeId, subject, analyzed, address, tokenName, tokenSymbol, tokenSupply, ipfsUri, attestFee, attestation, fetchAttestation, attestOnChain, mintToken]);

  const handleRegister = useCallback(async () => {
    if (!state.ipTokenAddress || !state.attestationId || !address || !ipfsUri) return;
    await registerIP(state.ipTokenAddress, address, ipfsUri, state.attestationId);
  }, [state.ipTokenAddress, state.attestationId, address, ipfsUri, registerIP]);

  const handleOpenLaunchpad = useCallback(async () => {
    if (!state.ipTokenAddress || !address) return;
    const cap = parseHardCap(hardCap);
    if (cap <= 0n) return;
    await openLaunchpad({
      ipToken: state.ipTokenAddress,
      royaltyReceiver: address,
      tokenURI: ipfsUri || `ipfs://veritas/${tokenSymbol}`,
      totalSupply: parseUnits(tokenSupply, 18),
      hardCap: cap,
    });
  }, [state.ipTokenAddress, address, hardCap, ipfsUri, tokenSymbol, tokenSupply, openLaunchpad]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="text-muted">Connect your wallet to launch an IP token.</p>
        <ConnectButton />
      </div>
    );
  }

  const isBusy = state.step === "attesting" || state.step === "minting";

  return (
    <div className="flex flex-col gap-8">
      {/* Step indicator */}
      <ol className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const done = currentStep > step.id || state.step === "opened";
          const active = currentStep === step.id;
          return (
            <li key={step.id} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border-2 transition-colors",
                    done
                      ? "border-primary-ink bg-primary/20 text-primary-ink"
                      : active
                        ? "border-primary-ink text-primary-ink"
                        : "border-border text-muted"
                  )}
                >
                  {done ? <CheckCircle2 className="size-5" /> : <step.icon className="size-4" />}
                </div>
                <div className="text-center">
                  <p className={cn("text-xs font-semibold", active ? "text-ink" : "text-muted")}>
                    {step.label}
                  </p>
                  <p className="text-[11px] text-muted">{step.desc}</p>
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-px flex-1 transition-colors",
                    currentStep > step.id ? "bg-primary-ink/50" : "bg-border"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {currentStep === 1 && (
        <StepVerify
          subject={subject}
          analyzed={analyzed}
          phase={phase}
          scanStep={scanStep}
          analyzeError={analyzeError}
          dragOver={dragOver}
          setDragOver={setDragOver}
          inputRef={inputRef}
          onFiles={onFiles}
          onDemo={startAnalyze}
          onReset={() => {
            setSubject(null);
            setAnalyzed(null);
            setAttestation(null);
            setPhase("idle");
            setAnalyzeError("");
          }}
          drs={drs}
          isGated={isGated}
          tier={tier}
          attestFeeEth={attestFeeEth}
          onNext={() => {
            setCurrentStep(2);
            // Prefetch the signed attestation in the background.
            if (!attestation) void prepareAttestation();
          }}
        />
      )}

      {currentStep === 2 && (
        <StepMint
          tokenName={tokenName}
          setTokenName={setTokenName}
          tokenSymbol={tokenSymbol}
          setTokenSymbol={setTokenSymbol}
          tokenSupply={tokenSupply}
          setTokenSupply={setTokenSupply}
          onSubmit={handleAttestAndMint}
          step={state.step}
          isBusy={isBusy}
          isPreparing={isPreparing}
          attestTxHash={state.attestTxHash}
          mintTxHash={state.mintTxHash}
          attestFeeEth={attestFeeEth}
          error={flowError ?? (state.step === "error" ? state.error : null)}
          resumed={!!resumeId}
          onBack={() => (resumeId ? router.push("/creator") : setCurrentStep(1))}
        />
      )}

      {currentStep === 3 && (
        <StepRegister
          ipTokenAddress={state.ipTokenAddress}
          ipfsUri={ipfsUri}
          setIpfsUri={setIpfsUri}
          onRegister={handleRegister}
          isPending={state.step === "registering"}
          isDone={false}
          registerTxHash={state.registerTxHash}
          error={state.step === "error" ? state.error : null}
          onViewCreator={() => router.push("/creator")}
          onReset={() => {
            setSubject(null);
            setAnalyzed(null);
            setAttestation(null);
            setIsPreparing(false);
            setPhase("idle");
            setTokenName("");
            setTokenSymbol("");
            setIpfsUri("");
            setFlowError(null);
            setResumeId(null);
            setCurrentStep(1);
            reset();
          }}
        />
      )}

      {currentStep === 4 && (
        <StepLaunchpad
          tokenSymbol={tokenSymbol}
          tokenSupply={tokenSupply}
          hardCap={hardCap}
          setHardCap={setHardCap}
          onOpen={handleOpenLaunchpad}
          step={state.step}
          openStatus={state.openStatus}
          openTxHash={state.openTxHash}
          isDone={state.step === "opened"}
          error={state.step === "error" ? state.error : null}
          onViewMarketplace={() => router.push("/market")}
          onViewCreator={() => router.push("/creator")}
          onReset={() => {
            setSubject(null);
            setAnalyzed(null);
            setAttestation(null);
            setIsPreparing(false);
            setPhase("idle");
            setTokenName("");
            setTokenSymbol("");
            setIpfsUri("");
            setHardCap("1000");
            setFlowError(null);
            setResumeId(null);
            setCurrentStep(1);
            reset();
          }}
        />
      )}
    </div>
  );
}

// ── Step 1: Verify (upload + DRS preview) ───────────────────────────────────────

function StepVerify({
  subject,
  analyzed,
  phase,
  scanStep,
  analyzeError,
  dragOver,
  setDragOver,
  inputRef,
  onFiles,
  onDemo,
  onReset,
  drs,
  isGated,
  tier,
  attestFeeEth,
  onNext,
}: {
  subject: Subject | null;
  analyzed: Analyzed | null;
  phase: "idle" | "computing" | "done" | "error";
  scanStep: number;
  analyzeError: string;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (files: FileList | null) => void;
  onDemo: (s: Subject) => void;
  onReset: () => void;
  drs: number | null;
  isGated: boolean;
  tier: string | null;
  attestFeeEth: string | undefined;
  onNext: () => void;
}) {
  const risk = analyzed?.risk;

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">Step 1: Verify Your Artwork</h2>
        <p className="mt-1 text-sm text-muted">
          Upload your visual artwork. The live oracle fingerprints it and computes its Dilution Risk
          Score. The DRS must be below {formatPct(DRS_GATE)} to tokenize: no copies, no AI-generated
          art. Nothing is written on-chain yet.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
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
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-border-strong hover:bg-surface/50"
            )}
          >
            <UploadCloud className="size-8 text-muted" strokeWidth={1.5} aria-hidden />
            <div>
              <p className="text-sm font-medium text-ink">Drop your artwork to verify</p>
              <p className="mt-1 text-xs text-muted">
                Image or text. Fingerprinted and scored by the live oracle.
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

          <div className="mt-5">
            <p className="text-xs text-muted">Or try a demo asset (scored live by the oracle):</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DEMOS.map((d) => (
                <button
                  key={d.label}
                  onClick={() => onDemo(d.subject)}
                  className="rounded-lg border border-border bg-surface/50 px-3 py-1.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-ink"
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Result side */}
        <div className="rounded-2xl border border-border bg-bg/50 p-6">
          {phase === "idle" && (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
              <p className="max-w-xs text-sm text-muted">
                Your Dilution Risk Score appears here once you add content. Higher scores mean higher
                copy and AI-replication risk.
              </p>
            </div>
          )}

          {phase === "computing" && (
            <div className="flex min-h-[300px] flex-col justify-center gap-3">
              {SCAN_STEPS.map((label, i) => {
                const st = i < scanStep ? "done" : i === scanStep ? "active" : "pending";
                return (
                  <div
                    key={label}
                    className={cn(
                      "flex items-center gap-3 text-sm transition-opacity",
                      st === "pending" ? "opacity-40" : "opacity-100"
                    )}
                  >
                    <span className="grid size-6 place-items-center">
                      {st === "done" ? (
                        <Check className="size-4 text-risk-low" strokeWidth={2.5} aria-hidden />
                      ) : st === "active" ? (
                        <Loader2 className="size-4 animate-spin text-primary-ink" aria-hidden />
                      ) : (
                        <span className="size-1.5 rounded-full bg-faint" />
                      )}
                    </span>
                    <span className={st === "done" ? "text-ink" : "text-muted"}>{label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {phase === "error" && (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 text-center">
              <p className="max-w-sm text-sm text-risk-high">{analyzeError}</p>
              <Button variant="secondary" size="lg" onClick={onReset}>
                <RotateCcw className="size-4" strokeWidth={2.25} />
                Try again
              </Button>
            </div>
          )}

          {phase === "done" && subject && risk && drs !== null && (
            <div className="flex min-h-[300px] flex-col">
              <DRSGauge drs={drs} d={risk.d} a={risk.a} gated={isGated} />

              {risk.d === 0 && (
                <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-500/90">
                  D=0: oracle corpus is empty. Run <code className="font-mono">npm run seed</code> in
                  the <code className="font-mono">oracle/</code> folder once to populate the
                  duplicate-density channel.
                </p>
              )}

              {risk.matches.length > 0 && (
                <p className="mt-3 text-center text-xs text-muted">
                  Nearest corpus match:{" "}
                  <span className="font-mono text-ink">
                    {(risk.matches[0].similarity * 100).toFixed(0)}%
                  </span>{" "}
                  similar to {risk.matches[0].label}
                </p>
              )}

              {analyzed && <QuorumStrip ops={analyzed.quorum.operators} />}

              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <dt className="text-muted">DRS</dt>
                  <dd className="font-semibold text-ink">{formatPct(drs)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Tier</dt>
                  <dd className="font-semibold capitalize text-ink">{tier}</dd>
                </div>
                <div>
                  <dt className="text-muted">LP Fee</dt>
                  <dd className="font-semibold text-ink">{formatFeeBps(dynamicFeeBps(drs))}</dd>
                </div>
                <div>
                  <dt className="text-muted">Gate</dt>
                  <dd className={cn("font-semibold", isGated ? "text-red-500" : "text-green-600")}>
                    {isGated ? "Blocked" : "Open"}
                  </dd>
                </div>
              </dl>

              {isGated && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-red-500">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  DRS is above {formatPct(DRS_GATE)}. This content has too many copies or is
                  AI-generated to be tokenized. You can dispute the score on the Disputes page.
                </p>
              )}

              {attestFeeEth && !isGated && (
                <p className="mt-3 text-center text-xs text-faint">
                  On-chain attest fee at mint: {Number(attestFeeEth).toFixed(4)} ETH
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <Button
        variant="primary"
        size="md"
        disabled={phase !== "done" || drs === null || isGated}
        onClick={onNext}
        className="self-start"
      >
        Continue to Mint
        <ArrowRight className="size-4" strokeWidth={2.25} />
      </Button>
    </div>
  );
}

// ── Step 2: Attest + Mint ───────────────────────────────────────────────────────

function StepMint({
  tokenName,
  setTokenName,
  tokenSymbol,
  setTokenSymbol,
  tokenSupply,
  setTokenSupply,
  onSubmit,
  step,
  isBusy,
  isPreparing,
  attestTxHash,
  mintTxHash,
  attestFeeEth,
  error,
  resumed = false,
  onBack,
}: {
  tokenName: string;
  setTokenName: (v: string) => void;
  tokenSymbol: string;
  setTokenSymbol: (v: string) => void;
  tokenSupply: string;
  setTokenSupply: (v: string) => void;
  onSubmit: () => void;
  step: string;
  isBusy: boolean;
  isPreparing: boolean;
  attestTxHash: Hex | null;
  mintTxHash: Hex | null;
  attestFeeEth: string | undefined;
  error: string | null;
  resumed?: boolean;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">Step 2: Attest & Mint</h2>
        <p className="mt-1 text-sm text-muted">
          Name your IP token. When you continue, two transactions fire back to back: first the DRS
          attestation is signed onto Unichain, then your ERC-20 IP token is deployed.
        </p>
      </div>

      {resumed && (
        <p className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-primary-ink">
          <CheckCircle2 className="size-3.5 shrink-0" />
          Resuming a verified attestation, verification is already on-chain, so we skip straight to
          minting and opening the pool.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Token Name</label>
          <input
            type="text"
            placeholder="My Artwork"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            className="rounded-xl border border-border bg-bg px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-ink/30"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Symbol</label>
          <input
            type="text"
            placeholder="ARTW"
            maxLength={8}
            value={tokenSymbol}
            onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
            className="rounded-xl border border-border bg-bg px-4 py-2.5 font-mono text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-ink/30"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-sm font-medium text-ink">Initial Supply</label>
          <input
            type="number"
            min="1"
            placeholder="1000000"
            value={tokenSupply}
            onChange={(e) => setTokenSupply(e.target.value)}
            className="rounded-xl border border-border bg-bg px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-ink/30"
          />
          <p className="text-xs text-muted">
            All tokens minted to your wallet. Full supply, no dilution.
            {attestFeeEth && <> Attest fee: {Number(attestFeeEth).toFixed(4)} ETH.</>}
          </p>
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg bg-red-500/10 p-3 text-xs text-red-500">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      {attestTxHash && (
        <p className="text-xs text-muted">
          Attest tx: <ExplorerLink value={attestTxHash} type="tx" />
        </p>
      )}
      {mintTxHash && (
        <p className="text-xs text-muted">
          Mint tx: <ExplorerLink value={mintTxHash} type="tx" />
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          size="md"
          disabled={!tokenName || !tokenSymbol || isBusy || isPreparing}
          onClick={onSubmit}
        >
          {isPreparing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Preparing attestation…
            </>
          ) : step === "attesting" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Attesting on-chain…
            </>
          ) : step === "minting" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Minting token…
            </>
          ) : (
            <>
              Attest & Mint
              <ArrowRight className="size-4" strokeWidth={2.25} />
            </>
          )}
        </Button>
        <Button variant="ghost" size="md" disabled={isBusy} onClick={onBack}>
          Back
        </Button>
      </div>
      {isPreparing && (
        <p className="text-xs text-muted">
          The oracle is signing your DRS in the background, you can fill in the details meanwhile.
        </p>
      )}
    </div>
  );
}

// ── Step 3: Register ──────────────────────────────────────────────────────────

function StepRegister({
  ipTokenAddress,
  ipfsUri,
  setIpfsUri,
  onRegister,
  isPending,
  isDone,
  registerTxHash,
  error,
  onViewCreator,
  onReset,
}: {
  ipTokenAddress: Hex | null;
  ipfsUri: string;
  setIpfsUri: (v: string) => void;
  onRegister: () => void;
  isPending: boolean;
  isDone: boolean;
  registerTxHash: Hex | null;
  error: string | null;
  onViewCreator: () => void;
  onReset: () => void;
}) {
  if (isDone) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-surface p-10 text-center">
        <CheckCircle2 className="size-12 text-green-500" />
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">IP Token Launched!</h2>
          <p className="mt-2 text-sm text-muted">
            Your IP token is now attested, registered, and DRS-verified. Initialize a bonding curve
            pool from your Creator Studio.
          </p>
        </div>
        {registerTxHash && (
          <p className="text-xs text-muted">
            Tx: <ExplorerLink value={registerTxHash} type="tx" />
          </p>
        )}
        <div className="flex gap-3">
          <Button variant="primary" size="md" onClick={onViewCreator}>
            View in Studio
            <ArrowRight className="size-4" strokeWidth={2.25} />
          </Button>
          <Button variant="secondary" size="md" onClick={onReset}>
            Launch Another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">
          Step 3: Register in IPLaunchRegistry
        </h2>
        <p className="mt-1 text-sm text-muted">
          Link your IP token to the DRS attestation. The contract re-checks the DRS on-chain before
          granting verification status.
        </p>
      </div>

      {ipTokenAddress && (
        <div className="flex items-center gap-2 rounded-xl bg-bg p-3 font-mono text-xs text-muted">
          <CheckCircle2 className="size-4 text-green-500 shrink-0" />
          IP Token: <ExplorerLink value={ipTokenAddress} type="token" />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Metadata URI (IPFS)</label>
        <input
          type="text"
          placeholder="ipfs://Qm..."
          value={ipfsUri}
          onChange={(e) => setIpfsUri(e.target.value)}
          className="rounded-xl border border-border bg-bg px-4 py-2.5 font-mono text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-ink/30"
        />
        <p className="text-xs text-muted">
          IPFS CID pointing to your IP metadata JSON (title, description, documents, perks).
        </p>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg bg-red-500/10 p-3 text-xs text-red-500">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      <Button
        variant="primary"
        size="md"
        disabled={!ipTokenAddress || !ipfsUri || isPending}
        onClick={onRegister}
        className="self-start"
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Registering…
          </>
        ) : (
          <>
            Register IP
            <ArrowRight className="size-4" strokeWidth={2.25} />
          </>
        )}
      </Button>
    </div>
  );
}

// ── Step 4: Open the bonding-curve launchpad ────────────────────────────────────

function StepLaunchpad({
  tokenSymbol,
  tokenSupply,
  hardCap,
  setHardCap,
  onOpen,
  step,
  openStatus,
  openTxHash,
  isDone,
  error,
  onViewMarketplace,
  onViewCreator,
  onReset,
}: {
  tokenSymbol: string;
  tokenSupply: string;
  hardCap: string;
  setHardCap: (v: string) => void;
  onOpen: () => void;
  step: string;
  openStatus: string | null;
  openTxHash: Hex | null;
  isDone: boolean;
  error: string | null;
  onViewMarketplace: () => void;
  onViewCreator: () => void;
  onReset: () => void;
}) {
  if (isDone) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-surface p-10 text-center">
        <CheckCircle2 className="size-12 text-green-500" />
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">Launchpad is live!</h2>
          <p className="mt-2 text-sm text-muted">
            Your IP is attested, DRS-verified, and now trading on a bonding curve. Collectors can buy
            in from the marketplace; once the raise target is hit, it graduates to a locked CLMM pool
            and you earn 0.2% royalties on every swap.
          </p>
        </div>
        {openTxHash && (
          <p className="text-xs text-muted">
            Tx: <ExplorerLink value={openTxHash} type="tx" />
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="primary" size="md" onClick={onViewMarketplace}>
            View in Marketplace
            <ArrowRight className="size-4" strokeWidth={2.25} />
          </Button>
          <Button variant="secondary" size="md" onClick={onViewCreator}>
            Creator Studio
          </Button>
          <Button variant="ghost" size="md" onClick={onReset}>
            Launch Another
          </Button>
        </div>
      </div>
    );
  }

  const supply = (() => {
    try {
      return parseUnits(tokenSupply || "0", 18);
    } catch {
      return 0n;
    }
  })();
  const {curveAllocation, lpAllocation, creatorKeep} = defaultAllocations(supply);
  const isOpening = step === "opening";
  const capValid = parseHardCap(hardCap) > 0n;

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">Step 4: Open Launchpad</h2>
        <p className="mt-1 text-sm text-muted">
          Open a fair-launch bonding curve so collectors can buy your IP and you raise initial
          capital, without giving up ownership. The curve auto-graduates to a locked Uniswap v4 pool
          when the raise target is reached.
        </p>
      </div>

      {/* Allocation split */}
      <div className="grid grid-cols-3 gap-3">
        <AllocCard label="On the curve" pct="60%" amount={`${fmtTok(curveAllocation)} ${tokenSymbol}`} />
        <AllocCard label="Reserved for LP" pct="30%" amount={`${fmtTok(lpAllocation)} ${tokenSymbol}`} />
        <AllocCard label="You keep" pct="10%" amount={`${fmtTok(creatorKeep)} ${tokenSymbol}`} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Raise target ({RAISE_TOKEN_SYMBOL})</label>
        <input
          type="number"
          min="1"
          step="any"
          value={hardCap}
          onChange={(e) => setHardCap(e.target.value)}
          placeholder="1000"
          disabled={isOpening}
          className="rounded-xl border border-border bg-bg px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-ink/30"
        />
        <p className="text-xs text-muted">
          When buyers have contributed this much {RAISE_TOKEN_SYMBOL}, the curve graduates and
          liquidity is permanently locked into the pool.
        </p>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg bg-red-500/10 p-3 text-xs text-red-500">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      {isOpening && openStatus && (
        <p className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-xs text-primary-ink">
          <Loader2 className="size-3.5 animate-spin" />
          {openStatus} (4 transactions, keep confirming in your wallet)
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          size="md"
          disabled={!capValid || isOpening}
          onClick={onOpen}
        >
          {isOpening ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Opening…
            </>
          ) : (
            <>
              <TrendingUp className="size-4" strokeWidth={2.25} />
              Open Launchpad
            </>
          )}
        </Button>
        <Button variant="ghost" size="md" disabled={isOpening} onClick={onViewCreator}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}

function AllocCard({label, pct, amount}: {label: string; pct: string; amount: string}) {
  return (
    <div className="rounded-xl border border-border bg-bg p-3 text-center">
      <p className="font-display text-lg font-semibold text-ink">{pct}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] text-muted">{amount}</p>
    </div>
  );
}

/** Compact token amount: 18-dec wei → human, no trailing noise. */
function fmtTok(wei: bigint): string {
  const n = Number(formatEther(wei));
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return n.toFixed(0);
}

// ── Quorum strip (independent detector agreement) ───────────────────────────────

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
