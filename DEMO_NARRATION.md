# Veritas Protocol: Narration Script

> Voice delivery: calm, confident, conversational. Not rushed.
> Total target: under 5 minutes.
> [ACTION] = on-screen action. [PAUSE] = brief pause for effect.

---

## [0:00 - 0:32] Animated Intro (Remotion - narrate over animated text)

*On screen: animated text sequence*

> "Creators built a $250 billion economy."
> "Intermediaries captured most of it. And the LPs who could have backed them?"
> "They couldn't price the risk."
> "Veritas changes both. One score. One launchpad. One lifecycle."

---

## [0:32 - 0:57] Architecture Overview (Remotion - light narration)

> "Veritas is two systems connected by a single number."
> "System V1: a trustless fair-launch launchpad where creators tokenize original work, raise capital through a bonding curve, and earn perpetual royalties from every swap."
> "System V2: a Dilution Risk Score oracle that quantifies content authenticity risk on-chain - and uses it to calibrate the LP fee automatically."
> "The DRS score is what makes V1 trustworthy and V2 actionable. Without it, neither system is safe to use."

---

## [0:57 - 2:22] Screen Recording - Creator Flow

**[ACTION: Open /launch, role = Creator]**

> "Let's start with a creator. They go to the Launchpad."
> "This is the route a creator takes today without Veritas: upload to a marketplace, sign over rights, hope royalties arrive through a centralized intermediary. Veritas replaces that entire chain."

**[ACTION: Click demo asset button "Unique" (picsum #700, low DRS)]**

> "They drop their original artwork. The oracle takes over."
> "Off-chain, it fingerprints the image with a perceptual hash, queries a DINOv2 corpus for near-duplicates, and runs an ensemble AI detector - two of three independent operators must co-sign."

[PAUSE - wait for DRS gauge to load]

> "DRS comes back at 1%. D is near zero - no near-copies in the corpus. A is near zero - not AI-generated. This content is original. Continue is enabled."

**[ACTION: Click Continue to Step 2]**

> "Step 2: attest and mint. Two transactions. The DRS is signed onto Unichain by the 2-of-3 quorum. Then the ERC-20 IP token is deployed."

**[ACTION: Approve wallet - Attest tx, then Mint tx]**

> "Both confirmed. The score is permanent, verifiable by anyone. No centralized party can change it."

**[ACTION: Click Continue to Step 3]**

> "Step 3: register. IPLaunchRegistry re-checks DRS on-chain. Below 85%: it passes. This is the gate. A plagiarized image would revert here with DRSTooHigh. No policy. Just code."

**[ACTION: Approve wallet - Register tx]**

**[ACTION: Click Continue to Step 4]**

> "Step 4: open the launchpad. This is where the creator's capital rail opens. Sixty percent goes on the bonding curve for fair price discovery. Thirty percent is locked permanently for the graduated pool. Ten percent to the creator. No insider allocation possible."

**[ACTION: Approve wallet - Open Launchpad tx]**

> "The curve is live."

**[ACTION: Navigate to /creator]**

> "Creator Studio confirms it - bonding curve active. And that royalty rate: 0.20% of every swap, automatically routed to the creator on-chain. No intermediary. Perpetual."

---

## [2:22 - 2:30] Title Card (Remotion)

*On screen: "Collector + LP"*

---

## [2:30 - 3:25] Screen Recording - Collector + LP

**[ACTION: Switch to Collector role, go to /market]**

> "Now the collector. The marketplace shows every IP token with its live DRS as a trust signal - before they spend a single dollar."

**[ACTION: Click on Demo IP Token]**

> "Each token has its DRS gauge, the AI-replicability score, and the bonding curve panel. This is price discovery with provenance built in."

**[ACTION: Mint test USDC, enter amount, click Buy]**

> "Real buy on a real bonding curve. Price rises with each purchase. At graduation, liquidity locks permanently - no rug possible after the curve closes."

**[ACTION: Switch to LP role, go to /pools]**

> "Now the LP. This is the side of the market that was broken before Veritas. LPs couldn't commit capital to content pools because they had no way to price dilution risk."

**[ACTION: Click a pool, show pool detail]**

> "The dynamic fee is calibrated by DRS. Lower DRS: lower fee. Higher DRS: higher fee. The mechanism compensates for the impermanent loss that comes from holding a pool of a diluted asset."

**[ACTION: Drag IL simulator slider]**

> "The IL simulator shows the breakeven point: the DRS level at which the fee covers the loss. The LP knows their protection before they commit."

**[ACTION: Click Provide, approve tx]**

> "Real liquidity added. Real Uniswap v4 modifyLiquidity transaction. This pool is now investable - because its risk is visible."

---

## [3:25 - 3:33] Title Card (Remotion)

*On screen: "Living DRS - Autonomous On-Chain"*

---

## [3:33 - 4:00] Screen Recording - Living DRS Proof

**[ACTION: Navigate to Living-D Original pool]**

> "Now the part that makes this system trustless. The D channel - duplicate density - is not a snapshot taken once at attestation. It lives."

**[ACTION: Point at dilutionCount value on screen]**

> "This asset's dilution count is 2. It got there automatically. When a near-duplicate was attested on Unichain, a Reactive Smart Contract on Lasna detected the NewAttestation event cross-chain. It found the near-duplicates using the on-chain dual-hash scan, and called back to increment the dilution count."

> "No bot. No cron job. The chain reacted to itself."

> "The dynamic fee for this pool is now higher - because the content has been copied, and IL risk has risen. The LP who provided liquidity here was protected automatically."

---

## [4:00 - 4:10] Title Card (Remotion)

*On screen: "The Gate"*

---

## [4:10 - 4:30] Screen Recording - Gate Demo

**[ACTION: Switch to Creator, go to /launch, click "AI-replicated" demo asset]**

> "What happens to content that doesn't pass?"

[PAUSE - DRS gauge loads]

> "DRS above the gate threshold. Continue is disabled. IPLaunchRegistry would revert with DRSTooHigh. This content cannot raise capital. The market is protected."

> "No AI-replicated content. No copied work. The gate is on-chain and enforced by code, not policy."

---

## [4:30 - 5:00] Closing (Remotion - narrate over animated text)

> "Two systems. One score. One lifecycle that was never possible before."

> "For creators: a fair-launch launchpad with trustless royalties and no intermediary."
> "For LPs: impermanent loss protection calibrated from real content-authenticity data, kept alive without a keeper."

> "Original idea. Working on-chain."
> "Veritas Protocol."

---

## Recording tips

- Speak at a natural pace: aim for 130-140 words per minute
- Don't rush transactions: let on-screen confirmations breathe for 2-3 seconds
- If a tx takes longer than expected, fill with commentary about what is happening on-chain
- Record each screen segment in one continuous take if possible
- Name segments: `seg2-creator.mp4`, `seg4-collector-lp.mp4`, `seg6-living-drs.mp4`, `seg8-gate.mp4`
- Drop them into `demo-video/public/` then render: `cd demo-video && npx remotion render src/index.ts VeritasDemo out/veritas-demo.mp4`
