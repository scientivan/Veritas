# Veritas

**Two systems. One score. The creator-economy infrastructure that was missing.**

Veritas is a Uniswap v4 hook submission for UHI9 Hookathon that solves two connected problems simultaneously: **System V1** gives creators a trustless fair-launch launchpad with enforced perpetual royalties and no intermediary. **System V2** gives LPs a live, autonomously-updated content-authenticity risk score so they can price impermanent loss in content-asset pools. The two systems are connected by **IPLaunchRegistry**: a bridge that gates V1 access behind the V2 DRS score, ensuring only original content can raise capital.

> UHI9 Hookathon submission. Theme: Impermanent Loss and Yield Systems. Built on Uniswap v4 (Unichain Sepolia) x Reactive Network.

**Submission files (slides + demo video): [bit.ly/veritas-submission-files](https://bit.ly/veritas-submission-files)**

---

## Live on Unichain Sepolia (chainId 1301)

All contracts are deployed and **source-verified on Uniscan** (Etherscan v2) and Sourcify. The oracle runs a real **2-of-3** operator quorum, two real Uniswap v4 pools are open through the hook, and the trustless living-DRS loop is **proven live cross-chain** (Reactive Lasna -> Unichain).

| Contract | Chain | Address | Notes |
| --- | --- | --- | --- |
| VeritasOracle | Unichain Sepolia | `0x45b327808f4D719C574D4508DD46a8E7b4124bd3` | 2-of-3, 3 operators registered |
| VeritasRegistry | Unichain Sepolia | `0xe359bdB2cA1A152Ae62E2496F140ea192Ce0d824` | |
| VeritasHook v2 | Unichain Sepolia | `0x0AaAef1B312243EfaAD238fb53403dC5761d60C4` | CREATE2-mined permission bits |
| VeritasRegistryCallback | Unichain Sepolia | `0xa516891eE1a4b0c4a149D1241e2EE00702B7332a` | wired as `dilutionUpdater` |
| DilutionMonitorRSC | Reactive Lasna (5318007) | `0xB44F024468dc78572D1Ad7b3f5Ce3A51408E5C5d` | subscribes to `NewAttestation` |
| PoolManager (Uniswap v4) | Unichain Sepolia | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` | official |
| StateView (Uniswap v4) | Unichain Sepolia | `0xc199f1072a74d4e905aba1a84d9a45e2546b6222` | pool-state reads |
| IPLaunchRegistry | Unichain Sepolia | `0x9dF98317b07B2964c25b45a934a0f9DAAB50aea2` | DRS gate: V1/V2 bridge |
| IPTokenFactory (v1) | Unichain Sepolia | `0xFB112b3AdF5d982A1Da4bEB6CD7370A64B98638c` | deploys creator IP ERC-20s |
| VeritasHook v1 (bonding curve) | Unichain Sepolia | `0xcecf19e7722e3b38b399785e00e13f7c3dcd20cc` | fair-launch curve + graduation + royalties |
| VeritasRegistry v1 (IP registry) | Unichain Sepolia | `0x17c5e35D11D6Af09869aD48e8Da54F5a07780fC8` | permissionless IP registry read by v1 hook |
| Mock USDC (raise token) | Unichain Sepolia | `0xD977AD033490EF42Db9E3B8Fc294425369b5A15a` | testnet USDC for launchpad buyers |

- **Two real v4 pools** opened through the hook (register -> initialize -> liquidity -> swap): poolId `0xf937...ff0e` (DRS 0) and `0x0cb6...0316` (DRS 0.68, higher dynamic fee).
- **2-of-3 oracle:** op1 DINOv2, op2 **CLIP** (independent embedder), op3 DINOv2-redundant; a single signature is rejected on-chain.
- **Living-DRS proven live:** attesting a near-duplicate triggered the RSC on Lasna; the callback on Unichain ran `getNearDuplicates` + `incrementDilutionCount`, raising the first attestation's `dilutionCount` 0 to 2 (effective D 0 to 0.60) with **no oracle, no keeper**. `DilutionIncremented` events confirm it. See `contracts/deployments/reactive.json`.

Explorer: `https://sepolia.uniscan.xyz/address/<addr>` · Reactive: `https://lasna.reactscan.net/address/<addr>`.

---

## The problem

The $250B creator economy (Goldman Sachs, 2023) has no on-chain capital infrastructure. Two failures, compounding each other, are the reason.

**The creator side:** Creators who want to tokenize their IP face a market with no fair-launch standard, no enforced royalties after the initial sale, and no trustless mechanism for raising capital without ceding control to intermediaries. IP licensing generates $180B per year globally (WIPO, 2024), most of it captured by platforms and aggregators. OpenSea disabled its free minting tool in 2022 after finding over 80% of mints were copies, plagiarism, or spam (OpenSea, Jan 2022). There is no on-chain gate that enforces origination.

**The LP side:** Even if a creator successfully tokenizes original work, no LP can rationally underwrite the pool. The dominant downside driver in content-asset pools is dilution: as copies and AI replicas multiply, the underlying asset loses scarcity, which drives price divergence. That risk is invisible on-chain. An AMM sees an identical pool whether the asset is one of a kind or one of ten thousand. Roughly 50% of Uniswap v3 LPs earned negative returns due to impermanent loss (Bancor, 2022). Without a way to price dilution risk, TVL in content pools is essentially zero. The two failures reinforce each other: no LP protection means no liquidity, which means no market for the creator.

Veritas is the missing infrastructure layer that fixes both, from the same system.

---

## How it works

### System V1: IP Tokenization Launchpad

A creator submits original work, gets it DRS-attested, and launches a fair-raise bonding curve through VeritasHook v1. The curve enforces a fixed 60/30/10 allocation (curve/LP reserve/creator) with no insider allocation possible. When the hardCap is hit, the curve closes and locked liquidity graduates into a Uniswap v4 dynamic-fee pool. From that point forward, 0.20% of every swap on the graduated pool is routed to the creator's address automatically, enforced in `afterSwap`. No opt-out. No intermediary. Perpetual.

Before any of this can happen, IPLaunchRegistry checks the DRS on-chain. If DRS is at or above 8500 (85%), `registerIP()` reverts with `DRSTooHigh`. Copied and AI-generated content cannot raise capital.

### System V2: Dilution Risk Score Oracle

DRS blends two independent risk channels into one probability that a content position is diluted:

```
DRS = 1 - (1-D)(1-A)            (noisy-OR; scaled 0..10000)

A = AI replicability   ->  OFF-CHAIN, oracle-signed (detector ensemble)
D = duplicate density  ->  max( D_onchain , D_offchain )
       D_onchain  = saturateD(dilutionCount)   ON-CHAIN, trustless (pHash, kept live by Reactive)
       D_offchain = oracle-signed offchainD     OFF-CHAIN, robust (DINOv2 + web corpus)
```

**Why `max()` for D.** It hardens the two failure modes a single source cannot:

- A bribed oracle that under-reports `offchainD` cannot push D below the **on-chain trustless floor**.
- The on-chain pHash's blindness to crop / rotation / web copies is covered by the **off-chain DINOv2 signal**.

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
      ILR[IPLaunchRegistry\ngate: registerIP reverts if DRS >= 8500]
      HOOKV1[VeritasHook v1\nbonding curve + graduation + royalties]
      HOOKV2[VeritasHook v2\ndynamic LP fee = f(DRS)]
      CB[VeritasRegistryCallback]
      PM[(Uniswap v4 PoolManager)]
    end

    subgraph RN["Reactive Network"]
      RSC[DilutionMonitorRSC]
    end

    A -- sign A --> ORA
    Doff -- sign offchainD --> ORA
    ORA --> REG
    REG -- getCurrentDRS --> ILR
    ILR -- gates --> HOOKV1
    REG -- NewAttestation event --> RSC
    RSC -- Callback --> CB
    CB -- getNearDuplicates + incrementDilutionCount --> REG
    HOOKV2 -- getCurrentDRS --> REG
    PM <-- beforeSwap / afterSwap --> HOOKV2
    PM <-- beforeSwap / afterSwap --> HOOKV1
```

**The living loop (fully trustless, no bot, no keeper) - proven live on testnet:** a creator attests content -> `VeritasRegistry` emits `NewAttestation` -> `DilutionMonitorRSC` on Reactive Network catches it -> it instructs `VeritasRegistryCallback` on Unichain -> the callback finds on-chain near-duplicates and raises `dilutionCount` for every affected asset -> VeritasHook v2 re-prices itself on the next swap. This ran end-to-end on testnet: a near-duplicate attestation autonomously raised a live asset's on-chain D from 0 to 0.60 (see the live deployment summary above).

---

## The v4 hooks

**VeritasHook v1** (bonding curve + royalties): Uses `beforeSwap` and `BeforeSwapDelta` to implement a quadratic fair-launch pricing curve that completely bypasses Uniswap's AMM math. After graduation (hardCap hit), `afterSwap` skims 0.20% of every swap into `pendingRoyalties[creator]`. Pool creation is gated by DRS: `beforeInitialize` verifies the content is registered in IPLaunchRegistry.

**VeritasHook v2** (dynamic LP fee + insurance reserve): Uses two DRS-driven layers:

1. **Dynamic LP fee** (`beforeSwap`, override flag): `fee = baseFee + (maxFee - baseFee) * DRS/10000`. Principled as IL compensation: expected IL in a 50/50 CP pool grows with price variance, and DRS proxies that forward variance.
2. **LP Insurance Reserve** (`afterSwap`, taken as ERC-6909 claims): a DRS-scaled slice of each swap accrues into a per-pool buffer, later donated back to in-range LPs on a verified dilution event (DRS rises >= 15% above its value at pool creation). Real protection, not just pricing.

**Pool gating:** creation is rejected when DRS exceeds the protocol gate (0.85). Owner authorization is a direct `registerPool` call (`msg.sender == content owner`), the clean fix to v4's router-as-`sender` problem; `beforeInitialize` re-verifies the gate at the exact init moment.

---

## Key parameters

| Parameter | Value |
| --- | --- |
| DRS scale | uint16, 0-10000 (0.00-1.00) |
| Protocol gate | 8500 (DRS > 0.85 -> pool rejected) |
| Base / max LP fee (v2) | 3000 / 10000 (0.30% / 1.00%) |
| Royalty rate (v1) | 20 bps (0.20%) per swap |
| Max reserve skim | 2500 (0.25%), scaled by DRS |
| Oracle quorum / bounds | 2-of-3, MAX_DRS 9500, spread <= 500 (5%), freshness 10 min |
| A-update / large-jump timelock | 1 h / 2 h (>30% change) |
| Dispute bond freeze | 48 h, slashable bond |
| Hamming threshold (tau) | 10 bits / 64, dual-hash (pHash AND blockhash) |
| `saturateD(count)` | 0->0, 1->4000, 2->6000, 3->7500, 5->8500, 10->9000, 20->9500, >20->9800 |

---

## Why this is novel

**Creator side:** First trustless fair-launch launchpad for IP tokenization with on-chain-enforced perpetual royalties and a DRS origination gate. No existing launchpad enforces royalties on-chain, blocks low-originality content, or locks LP liquidity on graduation to prevent rug.

**LP side:** First v4 hook to use off-chain content uniqueness for IL calibration, and the first to keep that risk score **autonomously alive on-chain** via Reactive Smart Contracts. The duplicate channel is trustless on-chain (Reactive) yet robust (off-chain DINOv2), combined so neither side can suppress risk.

**The bridge:** IPLaunchRegistry makes DRS the prerequisite for participation in V1, creating a feedback loop: V2 makes V1 safe, and V1 gives V2 its real-world consequence.

---

## Why now

Four things converged to make this both possible and urgent.

**1. Uniswap v4 hooks (mainnet, January 2025) enable per-pool programmable logic for the first time.** Every prior version had a single global fee and no mechanism for a pool to be aware of the asset inside it. The architecture that makes DRS-driven pricing even possible is brand new.

**2. The AI content explosion made the A channel acutely necessary.** AI tools now generate an estimated 15 billion images per month (Adobe, 2024). The gap between "provably original" and "practically AI-replicable" is now measured in seconds, not months. An LP underwriting a content pool today faces a risk that did not meaningfully exist at scale three years ago.

**3. The tokenization of content IP is accelerating, but the DeFi infrastructure is missing.** OpenSea disabled its free minting tool in 2022 after finding over 80% of mints were copies, plagiarism, or spam (OpenSea, Jan 2022). That ratio is the LP's problem: it is the exact reason TVL in content pools is essentially zero. The $250B+ creator economy is trying to tokenize, and AMMs are the right venue, but neither creators nor LPs have the tools to participate safely.

**4. Reactive Network (2024) makes trustless living state possible.** Before RSC infrastructure existed, keeping an on-chain risk score alive without a centralized bot required a keeper. The living-D loop would have been impossible to build trustlessly. It is now possible and proven live.

---

## Partner Integrations

### Unichain

The entire Veritas stack is deployed on **Unichain Sepolia (chainId 1301)**, chosen as the primary home for Uniswap v4 activity.

| What | Where in code |
|---|---|
| Primary deploy target (all contracts) | `contracts/script/Deploy.s.sol` |
| Live addresses | `contracts/deployments/latest.json` |
| PoolManager address used | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` (official Unichain Sepolia) |
| Real v4 pools opened through the hook | `contracts/deployments/seeded-dataset.json`, `contracts/script/DeployPool.s.sol` |
| Unichain Sepolia RPC | `https://sepolia.unichain.org` (`UNICHAIN_SEPOLIA_RPC_URL` in `.env`) |
| Source verification | `contracts/verify.sh` (Sourcify + Uniscan/Etherscan v2) |

The frontend reads only on-chain state from Unichain Sepolia via viem/wagmi (`frontend/src/lib/wagmi.ts`). All attestations, pool data, disputes, and liquidity interactions go through Unichain.

### Reactive Network

The living-DRS loop that keeps the duplicate-density score alive on-chain without a bot or keeper runs on **Reactive Lasna (chainId 5318007)** and calls back to Unichain Sepolia.

| What | Where in code |
|---|---|
| `DilutionMonitorRSC` (RSC on Lasna) | `contracts/src/reactive/DilutionMonitorRSC.sol` |
| `VeritasRegistryCallback` (callback receiver on Unichain) | `contracts/src/VeritasRegistryCallback.sol` |
| Deploy script and runbook | `contracts/script/DeployRSC.s.sol`, `contracts/script/REACTIVE_RUNBOOK.md` |
| Live RSC address (Lasna) | `0xB44F024468dc78572D1Ad7b3f5Ce3A51408E5C5d` (see `contracts/deployments/reactive.json`) |
| Integration tests (simulated ReactVM) | `contracts/test/ReactiveIntegration.t.sol` |

The RSC subscribes to `NewAttestation` events emitted by `VeritasRegistry` on Unichain. On each new attestation it calls `getNearDuplicates` + `incrementDilutionCount` on the registry, raising the on-chain D component for every affected asset with no human in the loop. **Proven live on testnet:** a near-duplicate attestation autonomously raised `dilutionCount` from 0 to 2 (effective D from 0 to 0.60), confirmed by `DilutionIncremented` events on Uniscan and the RSC reaction on `lasna.reactscan.net`.

---

## Repository

```
contracts/         Foundry: all contracts + Reactive integration, 81 tests
  src/
    VeritasOracle.sol            2-of-3 EIP-712 score verifier
    VeritasRegistry.sol          A + offchainD + on-chain dilutionCount; getCurrentDRS
    VeritasHook.sol              v2: dynamic fee + LP insurance reserve
    VeritasRegistryCallback.sol  Reactive callback receiver (Unichain)
    reactive/DilutionMonitorRSC.sol   Reactive Smart Contract (Reactive Network)
    IPLaunchRegistry.sol         DRS gate: V1/V2 bridge
    IPTokenFactory.sol           ERC-20 IP token factory (v1)
    VeritasHookV1.sol            Bonding curve + graduation + royalties (v1)
  test/            Oracle, Registry, Hook, Integration, EdgeCases, ReactiveIntegration (81 tests)
  script/          Deploy, DeployCallback, DeployPool, DeployRSC, verify.sh, REACTIVE_RUNBOOK.md
  deployments/     latest.json + pool.json + reactive.json + seeded-dataset.json
oracle/            Node + TS DRS oracle: DINOv2 + CLIP + SMOGY + RoBERTa, EIP-712 2-of-3 signer (14 tests)
frontend/          Next.js 16 + wagmi + RainbowKit; 100% on-chain: DRS gauge, launchpad, pools, creator studio
PRODUCT.md / DESIGN.md   product + visual system
```

### Off-chain oracle service (`oracle/`, built and running, no paid API)

Node + TypeScript + Fastify + viem; `@huggingface/transformers` on `onnxruntime-node` (CPU, q8 weights, no key). It fingerprints content, computes the real D + A channels, and returns the EIP-712 operator signatures the registry verifies. See `oracle/README.md`.

- **offchainD (duplicate density):** DINOv2-with-registers embeddings vs an owned, growing corpus in `sqlite-vec`; `D = 1 - exp(-lambda * sum_i sim^beta)`. Operator 2 re-derives D with an independent **CLIP** embedder and co-signs only when it agrees, so the 2-of-3 quorum has genuine data-layer independence.
- **A (AI replicability):** image `onnx-community/SMOGY-Ai-images-detector-ONNX`; text `onnx-community/chatgpt-detector-roberta-ONNX`; audio stubbed. A is a soft, co-signed signal.
- **Endpoints:** `/analyze` (preview + quorum), `/attest` (signed payload + IPFS CID), `/confirm` (grows the corpus only after the tx lands). IPFS via Pinata (real pinning, live) or a deterministic local CIDv1. A `keeper` re-scores and submits `updateAIScore`/`updateOffchainD`. `npm test` -> 14 passing.

---

## Demo

One system, three outcomes, decided by one score:

| Demo asset | Channel | DRS | Outcome |
| --- | --- | --- | --- |
| Unique photo | D 0% · A 0% | 0% | Launchpad opens, pool graduates at 0.30% fee |
| Widely-copied image | **D 97%** (100% corpus match) | 97% | **Gate blocks: registerIP() reverts** |
| AI-generated portrait | **A 100%** | 100% | **Gate blocks: registerIP() reverts** |

The full **[walkthrough and talking points are in `DEMO.md`](./DEMO.md)**. Fastest path: `cd oracle && npm run dev` then `cd frontend && npm run dev`, open `/launch`, click a demo, and watch the real DRS + "2-of-3 detectors agreed" badge land. Living-DRS loop in tests: `cd contracts && forge test --match-contract ReactiveIntegrationTest -vvv`.

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
# 2. the RSC on Reactive Lasna
#    forge script SIMULATION reverts on service.subscribe (eth_call), so deploy the
#    raw initcode and bypass estimation - full steps in script/REACTIVE_RUNBOOK.md:
cast send --value 2ether --gas-limit 3000000 --legacy \
  --rpc-url https://lasna-rpc.rnk.dev/ --private-key $PRIVATE_KEY \
  --create "<DilutionMonitorRSC initcode + abi-encoded (1301,registry,1301,callback)>"
```

Deploy order: Oracle -> Registry -> Hook v2 (CREATE2-mined for permission bits) -> RegistryCallback (set as `dilutionUpdater`) -> IPLaunchRegistry -> IPTokenFactory -> Hook v1 -> DilutionMonitorRSC (subscribes to `NewAttestation`). `DeployCallback.s.sol` adds the callback to an already-live registry; `DeployPool.s.sol` opens a real v4 pool through the hook; `verify.sh` verifies all contracts.

---

## Honest limitations

- **AI detection accuracy** has a real ceiling and degrades as generators improve; independent 2026 benchmarks show open image detectors fall to ~18-30% on the newest models (Flux/Firefly/MJ v7). A is a calibrated soft signal, never a hard verdict. Mitigated by the conservative ensemble + the dual D channel.
- **On-chain duplicate search is O(n)** over stored fingerprints (fine at hackathon scale; needs pHash-prefix bucketing to scale). It is pHash-only on-chain by necessity (neural nets can't run on-chain); robustness comes from the off-chain DINOv2 `offchainD`, combined via `max()`.
- **Oracle centralization:** 2-of-3 is multisig, not trustless. Operator 2 runs a genuinely different embedder (CLIP vs DINOv2) and co-signs D only when it independently agrees. The on-chain D floor bounds how far a bribed oracle can suppress D.
- **`offchainD` is still oracle-signed**, but `max()` with the on-chain floor means it can only ever raise risk above the trustless minimum, not hide it.
- **Reactive contracts can't be unit-tested against a live ReactVM** in Foundry; the callback flow is fully simulated in `ReactiveIntegration.t.sol`, and the RSC's subscription branch is exercised on the real network only.
- **DRS empirically validated at the principle level** (Mekacher, Nature 2022: rarity and lower downside). The cross-registry operationalization for on-chain fee calibration is this project's novel, not-yet-empirically-validated contribution.
- **Not a formal audit.** Test-backed engineering, no third-party review or formal verification.

---

_"Content asset pools are investable for the first time, because the risk that kept LPs away is finally visible and alive on-chain. And creators have a capital rail that does not require trusting an intermediary."_
