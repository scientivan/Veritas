import type {Address} from "viem";

// ── v2: DRS attestation + dynamic fee ────────────────────────────────────────

/** Live Veritas v2 contract addresses on Unichain Sepolia (chainId 1301). All verified on Sourcify. */
export const REGISTRY_ADDRESS: Address = "0xe359bdB2cA1A152Ae62E2496F140ea192Ce0d824";
export const ORACLE_ADDRESS: Address = "0x45b327808f4D719C574D4508DD46a8E7b4124bd3";
export const HOOK_ADDRESS: Address = "0x0AaAef1B312243EfaAD238fb53403dC5761d60C4";
export const REGISTRY_CALLBACK_ADDRESS: Address = "0xa516891eE1a4b0c4a149D1241e2EE00702B7332a";
export const POOL_MANAGER_ADDRESS: Address = "0x00B036B58a818B1BC34d502D3fE730Db729e62AC";
/** Persistent PoolModifyLiquidityTest router (real add/remove liquidity from the UI). */
export const LIQUIDITY_ROUTER_ADDRESS: Address = "0x7FaeB8F738DA1248D63728D90A16913f32651bbe";
/**
 * v4-periphery StateView. PoolManager.getSlot0/getLiquidity REVERT on Unichain
 * Sepolia's v4-core deployment, so all pool-state reads must go through StateView.
 */
export const STATE_VIEW_ADDRESS: Address = "0xc199f1072a74d4e905aba1a84d9a45e2546b6222";

// ── v1: IP tokenization + bonding curve launchpad ────────────────────────────

/**
 * v1 VeritasRegistry: permissionless IP token registry (checked by v1 VeritasHook).
 * MUST be the registry that the chosen V1_HOOK_ADDRESS reads (`hook.registry()`) AND
 * that actually exposes `registerIP`. Verified on-chain 2026-06-07: 0xB44F… has the
 * `registry` getter but NO `registerIP`, so it is unusable; 0x17c5e35D… is the
 * functional one paired with hook 0xcecf19….
 */
export const V1_REGISTRY_ADDRESS: Address = "0x17c5e35D11D6Af09869aD48e8Da54F5a07780fC8";
/**
 * v1 VeritasHook: bonding-curve launchpad + CLMM graduation + perpetual royalties.
 * MUST be the deploy that (a) has `initializeLaunchpad`/`launchpads`, (b) has valid v4
 * permission bits (address & 0x3FFF == 0x20CC), and (c) whose `registry()` is a registry
 * that actually exposes `registerIP` (= V1_REGISTRY_ADDRESS). Verified on-chain
 * 2026-06-07: 0xcecf19…20cc -> registry 0x17c5e35D… (which has registerIP). The
 * 0x3f0c62… deploy reads 0xB44F… which has no registerIP, so it is unusable.
 * 2026-06-07 v2 redeploy: graduation overflow fixed (used actual pool sqrtPrice instead
 * of graduationSqrtPriceX96 in _computeLiquidityFromAmounts during _migrateToCLMM).
 */
export const V1_HOOK_ADDRESS: Address = "0xc3CfD4756d8d1B02B57d7b80082c1A95e515A0cc";
/** v1 IPTokenFactory: deploys ERC-20 IP tokens on behalf of creators. */
export const IP_TOKEN_FACTORY_ADDRESS: Address = "0xFB112b3AdF5d982A1Da4bEB6CD7370A64B98638c";
/** v1 PoolSwapTest router used for bonding-curve buys. */
export const V1_SWAP_ROUTER_ADDRESS: Address = "0xB50cEEC85d58f3925eee5Ea71790577f5a0df831";
/** Mock USDC (18-decimals): the raise token launchpad buyers pay with. */
export const RAISE_TOKEN_ADDRESS: Address = "0xD977AD033490EF42Db9E3B8Fc294425369b5A15a";
export const RAISE_TOKEN_SYMBOL = "USDC";

/**
 * IPLaunchRegistry: DRS-gated IP registry bridging v2 attestation with v1 IP launch.
 * Deployed on Unichain Sepolia 2026-06-07 (forge script DeployIPLaunch.s.sol).
 */
export const LAUNCH_REGISTRY_ADDRESS: Address = "0x9dF98317b07B2964c25b45a934a0f9DAAB50aea2";

// ── Shared ────────────────────────────────────────────────────────────────────

/** Deployment blocks for event log queries (used to set fromBlock for chunked getLogs). */
export const REGISTRY_DEPLOY_BLOCK = 53748173n;
export const LAUNCH_REGISTRY_DEPLOY_BLOCK = 53918446n;

export const CHAIN_ID = 1301;
export const EXPLORER = "https://sepolia.uniscan.xyz";
export const SOURCIFY_LOOKUP = "https://sourcify.dev/#/lookup";

/** The live, Sourcify-verified contracts, for the on-chain provenance strip. */
export const VERIFIED_CONTRACTS: {name: string; address: Address}[] = [
  {name: "Oracle", address: ORACLE_ADDRESS},
  {name: "Registry (DRS)", address: REGISTRY_ADDRESS},
  {name: "Hook (dynamic fee)", address: HOOK_ADDRESS},
  {name: "Reactive callback", address: REGISTRY_CALLBACK_ADDRESS},
  {name: "IP Launch Registry", address: LAUNCH_REGISTRY_ADDRESS},
  {name: "Hook (bonding curve)", address: V1_HOOK_ADDRESS},
  {name: "IP Token Factory", address: IP_TOKEN_FACTORY_ADDRESS},
];
