# Veritas - Demo Flow (Video Recording Guide)

> Target duration: under 5 minutes. No AI voices.
> Tool: OBS Studio (screen recording) + Remotion (animated segments - auto-rendered).
> Wallet: connect deployer `0x490a2F2fE7fB40003585333D5df3C4588f33F11f` on Unichain Sepolia (chainId 1301).

## What this demo shows

Veritas solves two problems that were both broken before this system:

1. **Creator monetization** (V1): creators had no trustless way to tokenize IP, raise capital through a fair launch, or earn enforced perpetual royalties. V1 closes that gap.
2. **LP risk pricing** (V2): LPs had no way to price dilution risk in content-asset pools, so they stayed out. V2 makes that risk visible and prices it into the fee automatically.

Both systems are connected by a single on-chain Dilution Risk Score. IPLaunchRegistry enforces the score as a gate: only original content launches a curve. After graduation, the same score drives the dynamic LP fee.

---

## Pre-recording checklist

```bash
# Terminal 1
cd oracle && npm run dev          # http://localhost:8787

# Terminal 2
cd frontend && npm run dev -- --webpack   # http://localhost:3000
```

- Wallet connected to Unichain Sepolia (chainId 1301)
- Role switcher set to **Creator** at start
- Browser window: 1280x800, hide bookmarks bar
- OBS scene: capture Chrome window, mic on

---

## Segment timeline

| # | Type | Start | Duration | Content |
|---|------|-------|----------|---------|
| 0 | Remotion (auto) | 0:00 | 0:32 | Animated intro: creator economy + LP problem + Veritas |
| 1 | Remotion (auto) | 0:32 | 0:25 | Architecture: V1 + V2 + the score that connects them |
| 2 | **Screen rec** | 0:57 | 1:25 | Creator flow: attest, mint, register, open launchpad |
| 3 | Remotion (auto) | 2:22 | 0:08 | Title card: "Collector + LP" |
| 4 | **Screen rec** | 2:30 | 0:55 | Collector buys on curve + LP provides with DRS-calibrated fee |
| 5 | Remotion (auto) | 3:25 | 0:08 | Title card: "Living DRS" |
| 6 | **Screen rec** | 3:33 | 0:27 | Reactive living-D proof: D auto-incremented, fee rose |
| 7 | Remotion (auto) | 4:00 | 0:10 | Title card: "The Gate" |
| 8 | **Screen rec** | 4:10 | 0:20 | Gate blocks AI content: Continue disabled, DRS too high |
| 9 | Remotion (auto) | 4:30 | 0:30 | Closing: two systems, one score, one lifecycle |

**Total: ~5:00**

---

## Segment 2 - Creator Flow (1:25 screen recording)

**Goal:** Show the full 4-step launch wizard from image upload to live bonding curve. Emphasize: no intermediary, perpetual royalties, DRS gate as the trust foundation.

### Step-by-step actions

1. Navigate to `http://localhost:3000/launch`
2. **Step 1 - Verify Artwork**
   - Click demo asset button **"Unique"** (picsum #700, low DRS)
   - Wait for the DRS gauge to load (~3-5s)
   - Narrate: "Oracle fingerprints the image, scans for near-duplicates, runs the AI ensemble. Two of three operators must co-sign."
   - Point out: DRS gauge ~1%, D bar near zero, A bar near zero, "2 of 3 detectors agreed" badge
   - Click **Continue**
3. **Step 2 - Attest & Mint**
   - Type token name: `Demo IP Token`
   - Type symbol: `DIPT`
   - Click **Attest & Mint** - approve wallet popups (2 txns)
   - Narrate: "First tx: DRS signed onto Unichain by 2-of-3 quorum. Second tx: ERC-20 IP token deployed. Both permanent, verifiable."
   - Wait for success state
   - Click **Continue**
4. **Step 3 - Register IP**
   - Click **Register IP** - approve wallet popup
   - Narrate: "IPLaunchRegistry checks DRS below 85% on-chain. This is the gate that protects the whole market. A copied image would revert here."
   - Wait for success
   - Click **Continue**
5. **Step 4 - Open Launchpad**
   - Leave defaults (hardCap 1000 USDC)
   - Click **Open Launchpad** - approve wallet popup
   - Narrate: "Bonding curve goes live. 60% on the curve, 30% locked for the graduated pool, 10% to the creator. No insider allocation possible. And once it graduates: perpetual 0.20% royalty on every swap - no intermediary, no opt-out."
   - Wait for success
6. Navigate to `/creator` - show the launched IP with "Bonding curve live" badge and royalty card
   - Narrate: "Creator Studio confirms it. This is the creator-economy infrastructure that didn't exist before today."

---

## Segment 4 - Collector + LP (0:55 screen recording)

### Collector (0:30)

1. Switch role to **Collector** in Nav
2. Go to `/market` - show IP grid with DRS pills
   - Narrate: "Every IP token shows its live DRS. This is the trust signal before spending."
3. Click on **Veritas IP Token v2** (DEMO_LAUNCHPAD)
4. Go to `/trade/[id]` - show artwork, DRS gauge, bonding curve panel
5. Mint test USDC (click "Mint test tokens")
6. Enter amount `50`, click **Buy** - approve wallet
   - Narrate: "Real bonding curve buy. Price rises with each purchase. At graduation, liquidity locks permanently."
7. Check `/market/portfolio` - show token balance

### LP (0:25)

1. Switch role to **LP** in Nav
2. Go to `/pools` - show live dynamic-fee pools table
   - Narrate: "This is the market that was inaccessible before Veritas. LPs can now see the risk they are underwriting."
3. Click on **Forest Scene** pool (`0x1105152...`)
4. On `/pool/[id]` - point out DRS gauge, dynamic fee bps, IL simulator
   - Narrate: "Dynamic fee is calibrated by DRS. The IL simulator shows the breakeven point. The LP knows their protection before committing capital."
5. Click **Provide** - mint tokens, approve, add liquidity
   - Narrate: "Real Uniswap v4 modifyLiquidity transaction. This pool is investable because its risk is visible."
6. Go to `/portfolio` - show position with live DRS and IL simulator

---

## Segment 6 - Living DRS Reactive Proof (0:27 screen recording)

1. Stay on LP view, navigate to the **Living-D Original** pool
   - Attestation: `0x7d07e4ea...0a6`
2. Show `dilutionCount` and `effectiveD` values from the pool facts panel
   - Narrate: "This asset's dilution count is 2. When a near-duplicate was attested, a Reactive Smart Contract on Lasna detected it cross-chain and raised the on-chain D automatically."
3. Optional: open a new tab to `lasna.reactscan.net/address/0xB44F024468dc78572D1Ad7b3f5Ce3A51408E5C5d` to show the RSC reacted
4. Back to pool detail - dynamic fee is higher because D is higher
   - Narrate: "The fee rose. The LP who was in this pool was protected automatically. No bot. No cron. No keeper."

---

## Segment 8 - The Gate (0:20 screen recording)

1. Switch role to **Creator**
2. Go to `/launch`
3. Click demo asset **"AI-replicated"** (thispersondoesnotexist.com or similar)
4. DRS gauge loads at ~40-60%, red zone
5. Narrate: "DRS above the gate threshold. Continue is disabled. IPLaunchRegistry would revert with DRSTooHigh."
6. Point at the disabled Continue button
7. Narrate: "No AI-replicated content. No copied work. The gate is on-chain. It cannot be bypassed by policy or goodwill. Only original content can raise capital here."

---

## OBS recording tips

- Record each screen segment separately: `seg2-creator.mp4`, `seg4-collector-lp.mp4`, `seg6-living-drs.mp4`, `seg8-gate.mp4`
- Drop them into `demo-video/public/` folder
- The Remotion project references them at those exact paths
- Render final video: `cd demo-video && npx remotion render src/index.ts VeritasDemo out/veritas-demo.mp4`
