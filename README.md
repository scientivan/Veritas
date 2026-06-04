# Veritas Protocol

**Provenance-aware impermanent-loss protection for tokenized content pools.**
A Uniswap v4 hook that turns content authenticity into an on-chain **Dilution Risk Score (DRS)**, prices an LP's real downside, and keeps that score alive autonomously via **Reactive Network**.

> UHI9 Hookathon submission — theme: Impermanent Loss & Yield Systems. Built on Uniswap v4 (Unichain Sepolia) × Reactive Network.

---

## The problem

Content token pools are illiquid not because nobody wants them, but because **LPs cannot price their risk**. The dominant downside driver — dilution by copies and AI replicas — is **invisible on-chain**. An AMM sees an identical pool whether the asset is one of a kind or one of ten thousand.

Veritas is the missing risk layer: a score that makes a content asset's rarity, and its loss of it, legible to the people underwriting the pool. It is empirically grounded in peer-reviewed work showing rarer NFTs carry measurably lower downside risk (Mekacher et al., _Scientific Reports_ / Nature, 2022, over 3.7M transactions).

---

## How it works

DRS blends two risk channels and the v4 hook turns it into a fee + an insurance reserve.

```
DRS = 1 − (1 − D)(1 − A)            (noisy-OR; scaled 0..10000)

A = AI replicability   →  OFF-CHAIN, oracle-signed (detector ensemble)
D = duplicate density  →  max( D_onchain , D_offchain )
       D_onchain  = saturateD(dilutionCount)   ON-CHAIN, trustless (pHash, kept live by Reactive)
       D_offchain = oracle-signed offchainD     OFF-CHAIN, robust (DINOv2 + web corpus)
```

**Why `max()` for D.** It hardens the two failure modes a single source can't:

- A **bribed oracle** that under-reports `offchainD` can't push D below the **on-chain trustless floor**.
- The **on-chain pHash's blindness** to crop / rotation / web copies is covered by the **off-chain DINOv2 signal**.

Neither source can hide risk. The on-chain channel is the trust anchor; the off-chain channel is the sensitivity.

### Architecture

```mermaid
flowchart TB
    subgraph OFF["Off-chain DRS service (oracle operators, 2-of-3, each a different ensemble)"]
      A["A — AI detectors\n(SigLIP / RoBERTa / wav2vec2, transformers.js)"]
      Doff["offchainD — DINOv2 embeddings + pHash\nvs owned web-seeded corpus (sqlite-vec)"]
    end

    subgraph UNI["Unichain Sepolia"]
      ORA[VeritasOracle\n2-of-3 EIP-712, spread, freshness, bounds]
      REG[VeritasRegistry\nstores A + offchainD + dilutionCount\nDRS = noisyOR(max(Don,Doff),A)]
      HOOK[VeritasHook\ndynamic LP fee + LP insurance reserve]
      CB[VeritasRegistryCallback]
      PM[(Uniswap v4 PoolManager)]
    end

    subgraph RN["Reactive Network"]
      RSC[DilutionMonitorRSC]
    end

    A -- sign A --> ORA
    Doff -- sign offchainD --> ORA
    ORA --> REG
    REG -- NewAttestation event --> RSC
    RSC -- Callback --> CB
    CB -- getNearDuplicates + incrementDilutionCount --> REG
    HOOK -- getCurrentDRS --> REG
    PM <-- beforeSwap / afterSwap --> HOOK
```

**The living loop (fully trustless, no bot, no keeper):** a creator attests content → `VeritasRegistry` emits `NewAttestation` → `DilutionMonitorRSC` on Reactive Network catches it → it instructs `VeritasRegistryCallback` on Unichain → the callback finds on-chain near-duplicates and raises `dilutionCount` for every affected asset → the hook's fee re-prices itself on the next swap.

---

## The v4 hook

`VeritasHook` (extends OpenZeppelin `uniswap-hooks` `BaseHook`) uses two DRS-driven layers:

1. **Dynamic LP fee** (`beforeSwap`, override flag): `fee = baseFee + (maxFee − baseFee)·DRS/10000`. Principled as IL compensation — for a 50/50 CP pool expected IL grows with price variance, and DRS proxies that forward variance.
2. **LP Insurance Reserve** (`afterSwap`, taken as ERC-6909 claims): a DRS-scaled slice of each swap accrues into a per-pool buffer, later **donated back to the pool's in-range LPs** on a verified dilution event. Real protection, not just pricing.

**Pool gating:** creation is rejected when DRS exceeds the protocol gate (0.85). Owner authorization is a direct `registerPool` call (`msg.sender == content owner`), the clean fix to v4's router-as-`sender` problem; `beforeInitialize` re-verifies the gate at the exact init moment.

---

## Key parameters

| Parameter                      | Value                                                           |
| ------------------------------ | --------------------------------------------------------------- |
| DRS scale                      | uint16, 0–10000 (0.00–1.00)                                     |
| Protocol gate                  | 8500 (DRS > 0.85 → pool rejected)                               |
| Base / max LP fee              | 3000 / 10000 (0.30% / 1.00%)                                    |
| Max reserve skim               | 2500 (0.25%), scaled by DRS                                     |
| Oracle quorum / bounds         | 2-of-3, MAX_DRS 9500, spread ≤ 500 (5%), freshness 10 min       |
| A-update / large-jump timelock | 1 h / 2 h (>30% change)                                         |
| Dispute bond freeze            | 48 h, slashable bond                                            |
| Hamming threshold (τ)          | 10 bits / 64, dual-hash (pHash AND blockhash)                   |
| `saturateD(count)`             | 0→0, 1→4000, 2→6000, 3→7500, 5→8500, 10→9000, 20→9500, >20→9800 |

---

## Why this is novel

First v4 hook to use **off-chain content uniqueness for IL calibration**, and the first to keep that risk score **autonomously alive on-chain** via Reactive Smart Contracts. The duplicate channel is trustless on-chain (Reactive) yet robust (off-chain DINOv2), combined so neither side can suppress risk.

---

## Repository

```
contracts/         Foundry — 3 core contracts + Reactive integration, 81 tests
  src/
    VeritasOracle.sol            2-of-3 EIP-712 score verifier
    VeritasRegistry.sol          A + offchainD + on-chain dilutionCount; getCurrentDRS
    VeritasHook.sol              dynamic fee + LP insurance reserve
    VeritasRegistryCallback.sol  Reactive callback receiver (Unichain)
    reactive/DilutionMonitorRSC.sol   Reactive Smart Contract (Reactive Network)
  test/            Oracle, Registry, Hook, Integration, EdgeCases, ReactiveIntegration
  script/          Deploy.s.sol, DeployRSC.s.sol
frontend/          Next.js 16 + wagmi + RainbowKit; DRS gauge, pools, attest, dispute
PRODUCT.md / DESIGN.md   product + visual system (impeccable)
```

### Off-chain free AI stack (researched & verified, no paid API)

- **A — image:** `Ateeqq/ai-vs-human-image-detector` (SigLIP, Apache-2.0, ONNX via transformers.js); **text:** `onnx-community/chatgpt-detector-roberta-ONNX`; **audio:** wav2vec2 anti-spoof (Python sidecar). Runtime: `@huggingface/transformers` on `onnxruntime-node` (CPU, no key).
- **offchainD:** **DINOv2-with-registers** (Apache-2.0) semantic embeddings + `sharp-phash` pre-filter, searched in `sqlite-vec`. Operators run _different_ ensembles for genuine 2-of-3 independence.

---

## Demo

One product, three outcomes, decided by one score:

| Tier | Asset                | DRS  | Outcome                 |
| ---- | -------------------- | ---- | ----------------------- |
| A    | Unique illustration  | 0.06 | Pool opens · 0.34% fee  |
| B    | Common stock photo   | 0.61 | Pool opens · 0.73% fee  |
| C    | AI image, 213 copies | 0.94 | **Pool gated** (> 0.85) |

The full **[5-minute video script, live walkthrough, and talking points are in `DEMO.md`](./DEMO.md)**. The fastest way to see it: `cd frontend && npm run dev`, open `/attest`, click the **AI-replicated** demo, and watch the score land at 0.94 and gate the pool. To see the trustless living-DRS loop on-chain: `cd contracts && forge test --match-contract ReactiveIntegrationTest -vvv`.

---

## Run it

**Contracts (tests + coverage):**

```bash
cd contracts
forge test -vv                                   # 81 passing
forge coverage --no-match-coverage "(test|lib)"
forge test --match-contract ReactiveIntegrationTest -vvv   # the living-DRS flow
```

**Frontend:**

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev                                      # http://localhost:3000  (Webpack; see note)
```

> Note: this repo pins `--webpack` because Turbopack's native bindings are broken on the build machine. Drop the flag on a platform with working Turbopack.

**Deploy (Unichain Sepolia, then Reactive):**

```bash
# 1. core + callback on Unichain Sepolia
forge script script/Deploy.s.sol --rpc-url $UNICHAIN_SEPOLIA_RPC_URL --broadcast
#    env: PRIVATE_KEY, POOL_MANAGER, REACTIVE_CALLBACK_PROXY, OPERATOR_1..3, ORACLE_QUORUM
# 2. the RSC on Reactive Network
forge script script/DeployRSC.s.sol --rpc-url $REACTIVE_RPC_URL --broadcast
#    env: PRIVATE_KEY, REGISTRY_ADDRESS, CALLBACK_ADDRESS
```

Deploy order: Oracle → Registry → Hook (CREATE2-mined for permission bits) → RegistryCallback (set as `dilutionUpdater`) → DilutionMonitorRSC (subscribes to `NewAttestation`).

**Contract addresses:** _not yet deployed_ — populate `contracts/deployments/latest.json` after running the scripts.

---

## Honest limitations

- **AI detection accuracy** has a real ceiling and degrades as generators improve; independent 2026 benchmarks show open image detectors fall to ~18–30% on the newest models (Flux/Firefly/MJ v7). A is a calibrated soft signal, never a hard verdict. Mitigated by the conservative ensemble + the dual D channel.
- **On-chain duplicate search is O(n)** over stored fingerprints (fine at hackathon scale; needs pHash-prefix bucketing to scale). It is pHash-only on-chain by necessity (neural nets can't run on-chain); robustness comes from the off-chain DINOv2 `offchainD`, combined via `max()`.
- **Oracle centralization:** 2-of-3 is multisig, not trustless. Genuine independence requires each operator to run a _different_ detector ensemble (enforced operationally). The on-chain D floor bounds how far a bribed oracle can suppress D.
- **`offchainD` is still oracle-signed** (the one trusted input for D), but `max()` with the on-chain floor means it can only ever _raise_ risk above the trustless minimum, not hide it.
- **Reactive contracts can't be unit-tested against a live ReactVM** in Foundry; the callback flow is fully simulated in `ReactiveIntegration.t.sol`, and the RSC's subscription branch is exercised on the real network only.
- **DRS empirically validated at the principle level** (Mekacher, Nature 2022 — rarity ↔ lower downside). The cross-registry operationalization for on-chain fee calibration is this project's novel, not-yet-empirically-validated contribution.
- **Not a formal audit.** Test-backed engineering, no third-party review or formal verification.

---

_"Content asset pools are investable for the first time, because the risk that kept LPs away is finally visible — and alive — on-chain."_
