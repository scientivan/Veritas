# Veritas Protocol

**Provenance-aware impermanent-loss protection for tokenized content pools.**
A Uniswap v4 hook that turns content authenticity into an on-chain **Dilution Risk Score (DRS)**, prices an LP's real downside, and keeps that score alive autonomously via **Reactive Network**.

> UHI9 Hookathon submission. Theme: Impermanent Loss & Yield Systems. Built on Uniswap v4 (Unichain Sepolia) × Reactive Network.

---

## Live on Unichain Sepolia (chainId 1301)

All contracts are deployed and **source-verified on Uniscan** (Etherscan v2) and Sourcify. The oracle runs a real **2-of-3** operator quorum, **two** real Uniswap v4 pools are open through the hook, and the trustless living-DRS loop is **proven live cross-chain** (Reactive Lasna -> Unichain).

| Contract | Chain | Address | |
| --- | --- | --- | --- |
| VeritasOracle | Unichain Sepolia | `0x45b327808f4D719C574D4508DD46a8E7b4124bd3` | 2-of-3, 3 operators registered |
| VeritasRegistry | Unichain Sepolia | `0xe359bdB2cA1A152Ae62E2496F140ea192Ce0d824` | |
| VeritasHook | Unichain Sepolia | `0x0AaAef1B312243EfaAD238fb53403dC5761d60C4` | CREATE2-mined permission bits |
| VeritasRegistryCallback | Unichain Sepolia | `0xa516891eE1a4b0c4a149D1241e2EE00702B7332a` | wired as `dilutionUpdater` |
| DilutionMonitorRSC | Reactive Lasna (5318007) | `0xB44F024468dc78572D1Ad7b3f5Ce3A51408E5C5d` | subscribes to `NewAttestation` |
| PoolManager (Uniswap v4) | Unichain Sepolia | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` | official |

- **Two real v4 pools** opened through the hook (register → initialize → liquidity → swap): poolId `0xf937…ff0e` (DRS 0) and `0x0cb6…0316` (DRS 0.68, higher dynamic fee).
- **2-of-3 oracle:** op1 DINOv2, op2 **CLIP** (independent embedder), op3 DINOv2-redundant; a single signature is rejected on-chain.
- **Living-DRS proven live:** attesting a near-duplicate (same image, two owners) triggered the RSC on Lasna; the callback on Unichain ran `getNearDuplicates` + `incrementDilutionCount`, raising the first attestation's `dilutionCount` 0 → 2 (effective D 0 → 0.60) with **no oracle, no keeper**. `DilutionIncremented` events confirm it. See `contracts/deployments/reactive.json`.

Explorer: `https://sepolia.uniscan.xyz/address/<addr>` · Reactive: `https://lasna.reactscan.net/address/<addr>`.

---

## The problem

Content token pools are illiquid not because nobody wants them, but because **LPs cannot price their risk**. The dominant downside driver, dilution by copies and AI replicas, is **invisible on-chain**. An AMM sees an identical pool whether the asset is one of a kind or one of ten thousand.

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
    subgraph OFF["Off-chain DRS service (oracle, 2-of-3; op2 a different embedder)"]
      A["A: AI detectors\n(SMOGY image / RoBERTa text, transformers.js)"]
      Doff["offchainD: DINOv2 + independent CLIP embeddings\nvs owned corpus (sqlite-vec)"]
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

**The living loop (fully trustless, no bot, no keeper) — proven live on testnet:** a creator attests content → `VeritasRegistry` emits `NewAttestation` → `DilutionMonitorRSC` on Reactive Network catches it → it instructs `VeritasRegistryCallback` on Unichain → the callback finds on-chain near-duplicates and raises `dilutionCount` for every affected asset → the hook's fee re-prices itself on the next swap. This ran end-to-end on testnet: a near-duplicate attestation autonomously raised a live asset's on-chain D from 0 to 0.60 (see the live deployment summary above).

---

## The v4 hook

`VeritasHook` (extends OpenZeppelin `uniswap-hooks` `BaseHook`) uses two DRS-driven layers:

1. **Dynamic LP fee** (`beforeSwap`, override flag): `fee = baseFee + (maxFee − baseFee)·DRS/10000`. Principled as IL compensation: for a 50/50 CP pool expected IL grows with price variance, and DRS proxies that forward variance.
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
contracts/         Foundry: 3 core contracts + Reactive integration, 81 tests
  src/
    VeritasOracle.sol            2-of-3 EIP-712 score verifier
    VeritasRegistry.sol          A + offchainD + on-chain dilutionCount; getCurrentDRS
    VeritasHook.sol              dynamic fee + LP insurance reserve
    VeritasRegistryCallback.sol  Reactive callback receiver (Unichain)
    reactive/DilutionMonitorRSC.sol   Reactive Smart Contract (Reactive Network)
  test/            Oracle, Registry, Hook, Integration, EdgeCases, ReactiveIntegration (81 tests)
  script/          Deploy, DeployCallback, DeployPool, DeployRSC, verify.sh, REACTIVE_RUNBOOK.md
  deployments/     latest.json (Unichain addresses) + pool.json + reactive.json (live RSC) + seeded-dataset.json
oracle/            Node + TS DRS oracle: DINOv2 + CLIP + SMOGY + RoBERTa, EIP-712 2-of-3 signer (14 tests)
frontend/          Next.js 16 + wagmi + RainbowKit; 100% on-chain (no mock): DRS gauge, pools, attest, live dispute + owner-resolve UI
PRODUCT.md / DESIGN.md   product + visual system (impeccable)
```

### Off-chain oracle service (`oracle/`, built and running, no paid API)

Node + TypeScript + Fastify + viem; `@huggingface/transformers` on `onnxruntime-node` (CPU, q8 weights, no key). It fingerprints content, computes the real D + A channels, and returns the EIP-712 operator signatures the registry verifies. See `oracle/README.md`.

- **offchainD (duplicate density):** **DINOv2-with-registers** embeddings vs an owned, growing corpus in `sqlite-vec`; `D = 1 - exp(-λ·Σ sim^β)`. Operator 2 re-derives D with an independent **CLIP** embedder and co-signs only when it agrees, so the 2-of-3 quorum has genuine data-layer independence.
- **A (AI replicability):** image `onnx-community/SMOGY-Ai-images-detector-ONNX`; text `onnx-community/chatgpt-detector-roberta-ONNX`; audio stubbed. A is a soft, co-signed signal (free 2026 image detectors disagree too much to co-vary tightly; the trustless on-chain D floor bounds abuse).
- **Endpoints:** `/analyze` (preview + quorum), `/attest` (signed payload + IPFS CID), `/confirm` (grows the corpus only after the tx lands). IPFS via Pinata (real pinning, live) or a deterministic local CIDv1. A `keeper` re-scores and submits `updateAIScore`/`updateOffchainD`. `npm test` → 14 passing.
- **Image-A over-fire calibration:** the open SMOGY detector is overconfident (measured: ~30% of real photos flagged AI at ~1.0). The A channel applies temperature scaling (`detectors/calibration.ts`, configurable `IMAGE_AI_TEMPERATURE`) to correct overconfidence; confident-wrong outputs are a documented single-model limit, so A stays a soft, capped signal bounded by the trustless on-chain D floor.

---

## Demo

One product, three outcomes, decided by one score:

One product, three outcomes, each scored **live by the running oracle** (real DINOv2 + CLIP + detectors, not mocks):

| Demo asset | Channel | DRS | Outcome |
| --- | --- | --- | --- |
| Unique photo | D 0% · A 0% | 0% | Pool opens · 0.30% fee |
| Widely-copied image | **D 97%** (100% corpus match) | 97% | **Pool gated** |
| AI-generated portrait | **A 100%** | 100% | **Pool gated** |

The duplicate case is the thesis: DINOv2 and the independent CLIP embedder both find the near-duplicates and agree, so the pool is gated by a trustless, cross-checked signal. The full **[walkthrough and talking points are in `DEMO.md`](./DEMO.md)**. Fastest path: `cd oracle && npm run dev` then `cd frontend && npm run dev`, open `/attest`, click a demo, and watch the real score + the "2-of-3 detectors agreed" badge land. Living-DRS loop in tests: `cd contracts && forge test --match-contract ReactiveIntegrationTest -vvv`.

---

## Run it

**Contracts (tests + coverage):**

```bash
cd contracts
forge test -vv                                   # 81 passing
forge coverage --no-match-coverage "(test|lib)"
forge test --match-contract ReactiveIntegrationTest -vvv   # the living-DRS flow
```

**Oracle service:**

```bash
cd oracle
npm install
cp .env.example .env        # set ORACLE_OPERATOR_KEY (+ optional op2/op3, PINATA_JWT)
npm run seed                # build the DINOv2 + CLIP corpus
npm run dev                 # http://localhost:8787
npm test                    # 14 passing
npm run smoke               # full on-chain proof: analyze -> 2-of-3 sign -> attest -> read back
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
# 2. the RSC on Reactive Lasna (needs lREACT for gas; faucet via dev.reactive.network)
#    forge script SIMULATION reverts on service.subscribe (eth_call), so deploy the
#    raw initcode and bypass estimation - full steps in script/REACTIVE_RUNBOOK.md:
cast send --value 2ether --gas-limit 3000000 --legacy \
  --rpc-url https://lasna-rpc.rnk.dev/ --private-key $PRIVATE_KEY \
  --create "<DilutionMonitorRSC initcode + abi-encoded (1301,registry,1301,callback)>"
```

Deploy order: Oracle → Registry → Hook (CREATE2-mined for permission bits) → RegistryCallback (set as `dilutionUpdater`) → DilutionMonitorRSC (subscribes to `NewAttestation`). `DeployCallback.s.sol` adds the callback to an already-live registry; `DeployPool.s.sol` opens a real v4 pool through the hook; `verify.sh` verifies all contracts.

---

## Honest limitations

- **AI detection accuracy** has a real ceiling and degrades as generators improve; independent 2026 benchmarks show open image detectors fall to ~18–30% on the newest models (Flux/Firefly/MJ v7). A is a calibrated soft signal, never a hard verdict. Mitigated by the conservative ensemble + the dual D channel.
- **On-chain duplicate search is O(n)** over stored fingerprints (fine at hackathon scale; needs pHash-prefix bucketing to scale). It is pHash-only on-chain by necessity (neural nets can't run on-chain); robustness comes from the off-chain DINOv2 `offchainD`, combined via `max()`.
- **Oracle centralization:** 2-of-3 is multisig, not trustless. Operator 2 runs a genuinely _different_ embedder (CLIP vs DINOv2) and co-signs D only when it independently agrees, so the duplicate channel has real data-layer independence; A is shared because free 2026 image detectors disagree too much to co-vary within the on-chain spread. The on-chain D floor bounds how far a bribed oracle can suppress D.
- **`offchainD` is still oracle-signed** (the one trusted input for D), but `max()` with the on-chain floor means it can only ever _raise_ risk above the trustless minimum, not hide it.
- **Reactive contracts can't be unit-tested against a live ReactVM** in Foundry; the callback flow is fully simulated in `ReactiveIntegration.t.sol`, and the RSC's subscription branch is exercised on the real network only.
- **DRS empirically validated at the principle level** (Mekacher, Nature 2022: rarity ↔ lower downside). The cross-registry operationalization for on-chain fee calibration is this project's novel, not-yet-empirically-validated contribution.
- **Not a formal audit.** Test-backed engineering, no third-party review or formal verification.

---

_"Content asset pools are investable for the first time, because the risk that kept LPs away is finally visible (and alive) on-chain."_
