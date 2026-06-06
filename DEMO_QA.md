# Demo QA / bug tracker

Derived from the demo flows in [`DEMO.md`](./DEMO.md). Each demo segment lists what must work, the code touchpoints, and the open bugs or unverified items that could break the recording. Fix or verify everything here before recording.

Severity: **BLOCKER** (demo flow does not connect), **HIGH** (likely to fail on camera), **MED** (visibly wrong but not fatal), **LOW** (polish). Status: `[ ]` open, `[~]` needs on-chain verify, `[x]` done.

---

## Prerequisites (all segments)

- `[~]` Oracle running on `http://localhost:8787` AND `npm run seed` has run. Without seed, D = 0 and DRS looks flat/wrong. (`oracle/`)
- `[~]` Wallet connected to Unichain Sepolia (chainId 1301) with test ETH for gas.
- `[x]` `IPLaunchRegistry` deployed and wired: `0x9dF98317b07B2964c25b45a934a0f9DAAB50aea2` (`frontend/src/lib/contracts.ts`).
- `[x]` Pool-state reads use StateView, not PoolManager (PoolManager.getSlot0 reverts on Unichain). Verified on-chain. `STATE_VIEW_ADDRESS` in contracts.ts.
- `[x]` CRITICAL FIX: `V1_HOOK_ADDRESS` was stale (`0x2a25c8…044`, a pre-bonding-curve deploy with NO `initializeLaunchpad`/`launchpads`, which would have reverted Step 4). Corrected to `0x3f0c62c16c13ac9da96db77d6c934006843de0cc`, verified on-chain to have the bonding-curve functions, valid v4 permission bits (& 0x3FFF == 0x20CC), and `registry()` == `V1_REGISTRY_ADDRESS`. Also fixed the `launchpads` ABI (deployed getter returns 12 flat values, not a single tuple) + added `decodeLaunchpads`.
- `[x]` Raise token (Mock USDC `0xD977…`) is 18 decimals and publicly mintable, verified on-chain (collectors can mint test USDC to buy).

---

## Segment 1 - Creator launch (`/launch`, 4 steps)

- `[~]` HIGH - **Step 4 `openLaunchpad` is untested on-chain.** It runs 4 sequential txs: v1 `VeritasRegistry.registerIP` -> `PoolManager.initialize` -> IPToken `approve` -> v1 `VeritasHook.initializeLaunchpad`. Run it once end-to-end from a fresh wallet on testnet. Watch for: `initialize` succeeding (hook `beforeInitialize` needs the token verified in the v1 registry first, which Step 4 does), treasury caching order, and `initializeLaunchpad` not reverting. Code: `frontend/src/hooks/useIPLaunch.ts` (`openLaunchpad`), `frontend/src/lib/launchpad.ts`.
- `[~]` HIGH - **Steps 1-3 end-to-end after all refactors.** Verify the merged Verify -> Attest&Mint -> Register path still completes (prior fixes: TokenCreated event decode, AlreadyAttested precheck). Code: `useIPLaunch.ts`, `components/LaunchFlow.tsx`.
- `[~]` MED - **Studio reflects the launch.** After Step 4, `/creator` should show the IP with a "Bonding curve live" badge. Depends on `useLaunchpadPools` persistence + `getByAttestation` matching the attestation id. Code: `components/CreatorDashboard.tsx`, `components/OpenLaunchpadInline.tsx`, `hooks/useLaunchpadPools.ts`.
- `[ ]` LOW - Oracle-down path in Step 2 surfaces `flowError` cleanly (don't hang).

## Segment 2 - Collector buy (`/market`, `/trade/[id]`, `/market/portfolio`, `/market/history`)

- `[x]` BLOCKER (code done) - **the just-launched IP now appears in the marketplace.** `CollectorMarketplace` merges `useLaunchpadPools` launchpads, reading each one's attestation record (DRS) and `launchpads(poolId)` (curve price), badged "Bonding curve". Needs on-chain click-through to confirm.
- `[x]` BLOCKER (code done) - **launchpad pools are tradeable in the UI.** New `TradeArea` routes a launchpad to `CurveTradePanel` (buy-only exact-input USDC->IP via `V1_SWAP_ROUTER`, reads `launchpads(poolId)` for phase/progress; buy+sell after graduation), and a seeded pool to `TradePanel`. Code: `components/TradeArea.tsx`, `components/CurveTradePanel.tsx`, `lib/curve.ts`.
- `[x]` MED (done) - **Collector portfolio value fixed** to the IP token's assumed unit price (`token0PriceUsd`), no longer the inflated pool-ratio x token1PriceUsd. `components/CollectorPortfolio.tsx`.
- `[~]` HIGH - **A real buy/sell on a SEEDED pool is untested in the UI.** Verify: Mint test tokens -> Buy -> balance updates -> History records the tx -> Sell works. Code: `components/TradePanel.tsx`.
- `[x]` Prices and the "you receive" estimate read live pool state (StateView). Marketplace + TradePanel show the raw quote ratio (not the inflated USD).

## Segment 3 - LP (`/pools`, `/pool/[id]`, `/portfolio`)

- `[~]` HIGH - **Provide / remove untested in the UI after the StateView change.** Verify: Mint test tokens -> Provide -> position appears in `/portfolio` My Positions -> Remove. Code: `components/LpDashboard.tsx`, `hooks/useLpPositions.ts`.
- `[~]` MED - **My Positions rendering.** It joins `useLpPositions` with `useAttestations` (KNOWN ids only). All LP-providable pools are seeded/KNOWN, so titles resolve; confirm a position with no matching pool is simply hidden, not crashing. Code: `components/PortfolioDashboard.tsx`.
- `[x]` Available Pools filtered to LP-providable only, with the on-screen explanation. `app/pools/page.tsx`, `components/PoolTable.tsx` (`lpOnly`).

## Segment 4 - Living DRS (Reactive)

- `[~]` Re-confirm the proven loop is still demoable: oracle up, seeded living-D pair present, `DilutionIncremented` visible, and the dynamic fee reads higher after D rises. Backup is the `ReactiveIntegrationTest` unit test. (`contracts/`)

## Segment 5 - Gate + dispute

- `[~]` Gated content blocks Step 1 Continue (DRS >= 85%) using the AI-replicable demo asset. Code: `components/LaunchFlow.tsx` (StepVerify gate).
- `[~]` `/dispute` file + resolve flow still works (real tx, reads `DisputeFiled`). Code: `components/DisputeCenter.tsx`.

## Cross-cutting / docs

- `[x]` DEMO.md realigned: removed stale `/attest` page references and "paste attestation ID"; added the Collector role; replaced non-existent demo ids (`0xf87daf…`, `0xfe31192b…`) with the real `livePools.ts` ids.
- `[x]` LOW - README "live addresses" now includes `StateView`, `IPLaunchRegistry`, `IPTokenFactory`, v1 hook, v1 registry, and the raise token. (`README.md`)

---

## Status summary

All code-level shortcomings are now CLOSED and type-check + lint clean, and the contract wiring was verified on-chain (StateView, the correct bonding-curve hook, mintable 18-dec USDC, IPLaunchRegistry gate). The creator -> collector loop is wired end to end in code: a launched IP is registered, its launchpad opens on the correct hook, it appears in the marketplace, and it is buyable on the curve.

What REMAINS can only be done with a wallet on the testnet (I cannot drive the browser/wallet):

1. Run the full Creator launch once (Steps 1-4), confirming the 4-tx `openLaunchpad` lands on the corrected hook.
2. Confirm the launched IP then shows in `/market` and a curve buy succeeds.
3. Confirm a seeded-pool buy/sell and an LP provide/remove.
4. Re-confirm the living-DRS Reactive loop is still demoable.

If anything reverts during those runs, capture the error and it becomes the next fix. The likeliest remaining risk is the exact behavior of the 4-tx `openLaunchpad` sequence under real gas/state, which is impossible to fully validate without broadcasting.
