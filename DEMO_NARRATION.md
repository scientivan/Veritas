# Veritas: Presentation Narration Script

> Voice delivery: calm, confident, conversational. Not rushed.
> Total target: 5 minutes.
> [ACTION] = slide advance or step reveal. [PAUSE] = brief pause for effect.
> The demo recording (Creator Flow, Collector + LP, Living DRS, The Gate) is a SEPARATE video.
> This narration covers slides 1-17 only.

---

## Slide-by-Slide Timing Reference

| Slide | Title | Duration |
|-------|-------|----------|
| 1 | Title | 12s |
| 2 | Problem (5 step-reveals) | 38s |
| 3 | Transition | 10s |
| 4 | Why v4 Hooks? | 22s |
| 5 | V1 Launchpad | 22s |
| 6 | V2 Oracle | 20s |
| 7 | Bridge | 15s |
| 8 | Fee Model | 22s |
| 9 | Code Spotlight (3 step-reveals) | 28s |
| 10 | Three Actors | 18s |
| 11 | Architecture | 16s |
| 12 | Living DRS | 20s |
| 13 | Numbers | 16s |
| 14 | Rubric (5 step-reveals) | 40s |
| 15 | Contracts and Addresses | 12s |
| 16 | Call to Action | 16s |
| 17 | Closing | 10s |
| **Total** | | **~5:17** |

---

## [0:00 - 0:12] Slide 1: Title

> "Veritas. Provenance-aware impermanent loss protection, built on Uniswap v4. Two systems. One score. The full creator economy lifecycle, trustless, from original content to deep liquidity."

---

## [0:12 - 0:50] Slide 2: The Problem

*On screen: four data chips, then 5 rows reveal one at a time.*

> "The creator economy is broken. And so is LP participation in content pools. Five structural failures."

[ACTION: Row 01 appears]

> "Creators locked out of their own IP revenue. The $250 billion creator economy has no trustless capital rail. Royalties route through intermediaries."

[ACTION: Row 02 appears]

> "No fair-launch standard. Insider allocation, rug pulls, and no enforced royalties after the initial sale."

[ACTION: Row 03 appears]

> "Copied and AI content floods the market. No on-chain gate has ever blocked low-originality work from raising capital alongside genuine originals."

[ACTION: Row 04 appears]

> "IL risk from content dilution is invisible on-chain. As copies multiply, scarcity drops, price diverges. The AMM cannot see it, so it cannot price it."

[ACTION: Row 05 appears]

> "LPs cannot enter a market they cannot underwrite. Without a priced dilution risk, there is no rational basis to commit capital. TVL in this category is essentially zero."

---

## [0:50 - 1:00] Slide 3: Transition

*On screen: "Two broken markets. One missing primitive."*

> "Five failures. One system to address all of them. Two integrated subsystems, one score connecting them."

---

## [1:00 - 1:22] Slide 4: Why v4 Hooks?

*On screen: three hook permission cards.*

> "V4 hooks are not an optimization. They are the structural primitive that makes this impossible to replicate in v3. BeforeSwapDelta overrides AMM pricing entirely: the bonding curve runs inside the hook, no separate liquidity pool needed. afterSwap enforces perpetual royalties on every swap with no bypass. The DYNAMIC_FEE flag lets the hook update the LP fee on every swap from a live registry read. No redeployment. No governance."

---

## [1:22 - 1:44] Slide 5: V1 - IP Launchpad

*On screen: four-phase list, bonding curve chart, stats grid.*

> "System V1: the IP Launchpad. Creator mints an ERC-20 via IPTokenFactory. Fixed 60-30-10 split: 60 percent on the bonding curve, 30 locked for the graduated pool, 10 to the creator. No insider allocation possible. Quadratic price discovery via BeforeSwapDelta. When hardcap is hit, the curve closes permanently and liquidity locks into a Uniswap v4 pool. 0.20 percent royalty on every swap after graduation, enforced in afterSwap, perpetual."

---

## [1:44 - 2:04] Slide 6: V2 - DRS Oracle

*On screen: noisy-OR formula, D and A breakdown, oracle pipeline.*

> "System V2: the DRS Oracle. DRS equals 1 minus (1 minus D) times (1 minus A). Noisy-OR: if either channel is clean, neither alone can clear the score. D is duplicate density from DINOv2 cosine similarity against a sqlite-vec corpus. A is AI replicability from SMOGY and ai-source-detector. Three independent operators each sign. 2-of-3 EIP-712 quorum. Single-sig submission reverts on-chain."

---

## [2:04 - 2:19] Slide 7: Bridge

*On screen: V2 and V1 connected through IPLaunchRegistry gate.*

> "The bridge: IPLaunchRegistry. V2 is not a companion system. It is the prerequisite and the ongoing guardian of V1. registerIP reverts if DRS is 85 percent or above. No policy, no admin, no bypass. After graduation, getCurrentDRS still drives the dynamic fee on every swap. V2 guards V1 for its entire lifetime."

---

## [2:19 - 2:41] Slide 8: LP Fee = f(DRS)

*On screen: formula box left, four fee example rows right.*

> "The LP fee is not a parameter you set at deployment. It is a function evaluated on every swap from a live registry read. Base is 0.30 percent. Max is 1.00 percent. DRS 0: base fee, no dilution detected. DRS 30 percent: fee rises to 0.51 percent. DRS 60 percent: 0.72 percent. The LP who provides liquidity knows their protection before they commit, and it adjusts automatically as the content's real-world dilution changes. At 85 percent: the pool was never created."

---

## [2:41 - 3:09] Slide 9: Code Spotlight

*On screen: three code blocks, one per step reveal.*

> "The implementation speaks for itself."

[ACTION: Block 1 appears - getCurrentDRS]

> "getCurrentDRS in VeritasRegistry: saturateD converts dilutionCount to effective D. Noisy-OR in pure integer math. Readable by any contract on any swap."

[ACTION: Block 2 appears - registerIP]

> "registerIP in IPLaunchRegistry: if DRS is 8500 or above, it reverts DRSTooHigh. No policy. Just code."

[ACTION: Block 3 appears - _getDynamicFee]

> "_getDynamicFee in VeritasHook: fee scales linearly with DRS, read fresh from the registry on every swap. As dilutionCount rises, the fee rises automatically."

---

## [3:09 - 3:27] Slide 10: Three Actors

*On screen: Creator, Collector, LP cards.*

> "Three actors aligned by one score. Creator: attests original content, mints the IP token, earns royalties on every swap forever. Collector: buys on the curve with DRS as a trust signal before any purchase. LP: provides liquidity knowing the fee is calibrated to the actual content risk and self-adjusts as that risk changes."

---

## [3:27 - 3:43] Slide 11: Architecture

*On screen: full on-chain and off-chain stack.*

> "Five contracts on Unichain Sepolia. Off-chain oracle service with DINOv2, SMOGY, and ai-source-detector. DilutionMonitorRSC cross-chain on Reactive Lasna. VeritasRegistryCallback receives the cross-chain signal. The whole stack is live and source-verified."

---

## [3:43 - 4:03] Slide 12: Living DRS

*On screen: four-step sequence, before-and-after proof panel.*

> "D updates itself. No keeper needed. Near-duplicate attested on Unichain. DilutionMonitorRSC on Reactive Lasna fires immediately on the NewAttestation event cross-chain. It calls back to VeritasRegistryCallback, which increments dilutionCount. saturateD converts that count to effective D. getCurrentDRS is now higher. The LP fee rises on the very next swap. Proven live: dilutionCount raised 0 to 2 with zero off-chain infrastructure."

---

## [4:03 - 4:19] Slide 13: Numbers

*On screen: four proof cards with count-up animation.*

> "It works. 81 tests passing: unit, integration, and 8 cross-chain tests in ReactiveIntegration.t.sol. 5 contracts deployed and source-verified on Unichain Sepolia. 2-of-3 quorum proven on-chain: single-sig submissions revert. DilutionMonitorRSC proven: dilutionCount raised 0 to 2 cross-chain with no keeper."

---

## [4:19 - 4:59] Slide 14: Rubric

*On screen: five criteria rows, one per step reveal.*

> "Built for the rubric."

[ACTION: Row 1 appears - Original Idea 30%]

> "Original idea: 30 percent. First v4 hook to price impermanent loss from off-chain content-authenticity data. DRS as noisy-OR is novel in DeFi. Peer-reviewed grounding: Mekacher et al., Scientific Reports 2022."

[ACTION: Row 2 appears - Unique Execution 25%]

> "Unique execution: 25 percent. Living D via Reactive Network RSC with no keeper. 2-of-3 quorum. Bonding-curve graduation. Dynamic fee calibrated to a live off-chain signal. Two fully integrated systems, not one hook with a parameter."

[ACTION: Row 3 appears - Impact 20%]

> "Impact: 20 percent. Unlocks the full creator economy lifecycle: verified origination, fair-launch capital, trustworthy LP, all from one score. Currently impossible to build safely without this."

[ACTION: Row 4 appears - Functionality 15%]

> "Functionality: 15 percent. 81 tests, 5 live contracts, proven cross-chain, real oracle with on-chain attest, real swaps on Unichain Sepolia. Not a prototype: a working system."

[ACTION: Row 5 appears - Presentation 10%]

> "Presentation: 10 percent. This deck, 17 slides with full narration. A separate demo video covers all four flows: Creator, Collector plus LP, Living DRS, and The Gate. On-chain proof replaces claims."

---

## [4:59 - 5:11] Slide 15: Contracts and Addresses

*On screen: all deployed contract addresses grouped by V1, V2, Bridge, RSC.*

> "Deployed, verified, live. Every address on this slide is source-verified on sepolia.uniscan.xyz right now. DilutionMonitorRSC live on Lasna at reactscan.net. Every transaction hash exists."

---

## [5:11 - 5:27] Slide 16: Call to Action

*On screen: run-it-yourself steps, verify on-chain links.*

> "Run it yourself. cd oracle, npm run dev. cd frontend, npm run dev --webpack. Navigate to /launch, click Unique. Watch a real DRS score arrive from a live oracle. Run forge test: 81 pass. The demo video is available separately and shows every flow end to end: attest, mint, launch, buy, LP, Living DRS proof, and the Gate blocking AI-replicated content."

---

## [5:27 - 5:37] Slide 17: Closing

*On screen: Veritas logo, closing chips.*

> "Two systems. One score. The missing risk infrastructure for the creator economy. Original idea. Working on-chain. Veritas."

---

## Delivery tips

- Speak at 130-140 words per minute
- Step-reveal slides: advance the next step at the end of its narration sentence, not before
- For the fee model slide (8): pause briefly after each fee example row renders to let the bar animate
- Living DRS slide (12): slow down on "No keeper" - it is the key technical differentiator
- Don't rush slide 4 (Why v4 Hooks): this is the technical credibility moment
- Total with normal pauses and breathing: approximately 5:15 to 5:30
