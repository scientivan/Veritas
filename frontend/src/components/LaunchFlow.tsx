"use client";

import {useState, useCallback} from "react";
import {useAccount} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {useRouter} from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Coins,
  Rocket,
  AlertCircle,
} from "lucide-react";
import type {Hex} from "viem";
import {parseUnits} from "viem";
import {Button} from "./ui/Button";
import {DRSGauge} from "./DRSGauge";
import {ExplorerLink} from "./ExplorerLink";
import {useIPLaunch} from "@/hooks/useIPLaunch";
import {REGISTRY_ADDRESS} from "@/lib/contracts";
import {REGISTRY_ABI} from "@/lib/abis";
import {DRS_GATE, combineDrs, dynamicFeeBps, tierForDrs} from "@/lib/drs";
import {formatPct, formatFeeBps, cn} from "@/lib/utils";
import {useReadContract} from "wagmi";

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {id: 1, icon: ShieldCheck, label: "Verify Artwork", desc: "DRS attestation gates entry"},
  {id: 2, icon: Coins, label: "Mint IP Token", desc: "Deploy your ERC-20 on-chain"},
  {id: 3, icon: Rocket, label: "Register & Launch", desc: "Link attestation + open pool"},
] as const;

// ── Main component ────────────────────────────────────────────────────────────

export function LaunchFlow() {
  const {address, isConnected} = useAccount();
  const router = useRouter();
  const {state, mintToken, registerIP, reset} = useIPLaunch();

  const [currentStep, setCurrentStep] = useState(1);
  const [attestationId, setAttestationId] = useState<Hex | null>(null);
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenSupply, setTokenSupply] = useState("1000000");
  const [ipfsUri, setIpfsUri] = useState("");

  // Read the attestation from v2 registry (if user entered an ID)
  const {data: attestRecord} = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "getRecord",
    args: attestationId ? [attestationId] : undefined,
    query: {enabled: !!attestationId},
  });

  const drs = attestRecord
    ? combineDrs(
        Number(attestRecord.offchainD) / 10000,
        Number(attestRecord.aiReplicabilityScore) / 10000
      )
    : null;
  const isGated = drs !== null && drs >= DRS_GATE;
  const tier = drs !== null ? tierForDrs(drs) : null;

  const handleMint = useCallback(async () => {
    if (!tokenName || !tokenSymbol) return;
    const supply = parseUnits(tokenSupply, 18);
    const token = await mintToken(tokenName, tokenSymbol, supply);
    if (token) setCurrentStep(3);
  }, [tokenName, tokenSymbol, tokenSupply, mintToken]);

  const handleRegister = useCallback(async () => {
    if (!state.ipTokenAddress || !attestationId || !address || !ipfsUri) return;
    await registerIP(state.ipTokenAddress, address, ipfsUri, attestationId);
  }, [state.ipTokenAddress, attestationId, address, ipfsUri, registerIP]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="text-muted">Connect your wallet to launch an IP token.</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Step indicator */}
      <ol className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const done = currentStep > step.id || state.step === "registered";
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
                  {done ? (
                    <CheckCircle2 className="size-5" />
                  ) : (
                    <step.icon className="size-4" />
                  )}
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

      {/* Step panels */}
      {currentStep === 1 && (
        <StepVerify
          attestationId={attestationId}
          setAttestationId={setAttestationId}
          drs={drs}
          isGated={isGated}
          tier={tier}
          attestRecord={attestRecord}
          onNext={() => setCurrentStep(2)}
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
          onMint={handleMint}
          isPending={state.step === "minting"}
          mintTxHash={state.mintTxHash}
          error={state.step === "error" ? state.error : null}
        />
      )}

      {currentStep === 3 && (
        <StepRegister
          ipTokenAddress={state.ipTokenAddress}
          ipfsUri={ipfsUri}
          setIpfsUri={setIpfsUri}
          onRegister={handleRegister}
          isPending={state.step === "registering"}
          isDone={state.step === "registered"}
          registerTxHash={state.registerTxHash}
          error={state.step === "error" ? state.error : null}
          onViewCreator={() => router.push("/creator")}
          onReset={reset}
        />
      )}
    </div>
  );
}

// ── Step 1: Verify ────────────────────────────────────────────────────────────

function StepVerify({
  attestationId,
  setAttestationId,
  drs,
  isGated,
  tier,
  attestRecord,
  onNext,
}: {
  attestationId: Hex | null;
  setAttestationId: (v: Hex | null) => void;
  drs: number | null;
  isGated: boolean;
  tier: string | null;
  attestRecord: unknown;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">
          Step 1 — Verify Your Artwork
        </h2>
        <p className="mt-1 text-sm text-muted">
          Your content must have a Veritas attestation with DRS below 85% to be tokenized.
          <br />
          No attestation yet?{" "}
          <a href="/attest" className="text-primary-ink underline-offset-2 hover:underline">
            Attest first
          </a>{" "}
          — it takes under a minute.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink">Attestation ID</label>
        <input
          type="text"
          placeholder="0x..."
          value={attestationId ?? ""}
          onChange={(e) => {
            const v = e.target.value.trim();
            setAttestationId(v.startsWith("0x") && v.length === 66 ? (v as Hex) : null);
          }}
          className="rounded-xl border border-border bg-bg px-4 py-2.5 font-mono text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-ink/30"
        />
        <p className="text-xs text-muted">
          Find your attestation ID on the{" "}
          <a href="/pools" className="text-primary-ink underline-offset-2 hover:underline">
            Pools page
          </a>{" "}
          or in the Attest confirmation screen.
        </p>
      </div>

      {drs !== null && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:flex-row sm:items-center sm:gap-8">
          <DRSGauge
            drs={drs}
            d={attestRecord ? Number((attestRecord as {offchainD: number}).offchainD) / 10000 : 0}
            a={attestRecord ? Number((attestRecord as {aiReplicabilityScore: number}).aiReplicabilityScore) / 10000 : 0}
            gated={isGated}
            className="mx-auto shrink-0"
          />
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
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
              <p className="flex items-start gap-1.5 text-xs text-red-500">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                DRS is above 85%. This content has too many copies or is AI-generated to be
                tokenized. You can dispute the score on the Disputes page.
              </p>
            )}
          </div>
        </div>
      )}

      <Button
        variant="primary"
        size="md"
        disabled={!attestationId || !attestRecord || isGated}
        onClick={onNext}
        className="self-start"
      >
        Continue to Mint
        <ArrowRight className="size-4" strokeWidth={2.25} />
      </Button>
    </div>
  );
}

// ── Step 2: Mint ──────────────────────────────────────────────────────────────

function StepMint({
  tokenName,
  setTokenName,
  tokenSymbol,
  setTokenSymbol,
  tokenSupply,
  setTokenSupply,
  onMint,
  isPending,
  mintTxHash,
  error,
}: {
  tokenName: string;
  setTokenName: (v: string) => void;
  tokenSymbol: string;
  setTokenSymbol: (v: string) => void;
  tokenSupply: string;
  setTokenSupply: (v: string) => void;
  onMint: () => void;
  isPending: boolean;
  mintTxHash: Hex | null;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">Step 2 — Mint IP Token</h2>
        <p className="mt-1 text-sm text-muted">
          Deploy an ERC-20 token representing fractional ownership of your intellectual property.
        </p>
      </div>

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
          <p className="text-xs text-muted">All tokens minted to your wallet. Full supply, no dilution.</p>
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg bg-red-500/10 p-3 text-xs text-red-500">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      {mintTxHash && (
        <p className="text-xs text-muted">
          Tx: <ExplorerLink value={mintTxHash} type="tx" />
        </p>
      )}

      <Button
        variant="primary"
        size="md"
        disabled={!tokenName || !tokenSymbol || isPending}
        onClick={onMint}
        className="self-start"
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Minting...
          </>
        ) : (
          <>
            Mint Token
            <ArrowRight className="size-4" strokeWidth={2.25} />
          </>
        )}
      </Button>
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
            Your IP token is now registered and DRS-verified. Initialize a bonding curve pool from
            your Creator dashboard.
          </p>
        </div>
        {registerTxHash && (
          <p className="text-xs text-muted">
            Tx: <ExplorerLink value={registerTxHash} type="tx" />
          </p>
        )}
        <div className="flex gap-3">
          <Button variant="primary" size="md" onClick={onViewCreator}>
            View My IP
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
          Step 3 — Register in IPLaunchRegistry
        </h2>
        <p className="mt-1 text-sm text-muted">
          Link your IP token to the DRS attestation. The contract verifies DRS on-chain before
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
            Registering...
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
