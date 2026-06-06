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

// ── v1: IP tokenization + bonding curve launchpad ────────────────────────────

/** v1 VeritasRegistry: permissionless IP token registry (checked by v1 VeritasHook). */
export const V1_REGISTRY_ADDRESS: Address = "0xB44F024468dc78572D1Ad7b3f5Ce3A51408E5C5d";
/** v1 VeritasHook: bonding-curve launchpad + CLMM graduation + perpetual royalties. */
export const V1_HOOK_ADDRESS: Address = "0x2a25c8F17AF1Ac048CeF0d91815e310834d96044";
/** v1 IPTokenFactory: deploys ERC-20 IP tokens on behalf of creators. */
export const IP_TOKEN_FACTORY_ADDRESS: Address = "0xFB112b3AdF5d982A1Da4bEB6CD7370A64B98638c";
/** v1 PoolSwapTest router used for bonding-curve buys. */
export const V1_SWAP_ROUTER_ADDRESS: Address = "0xB50cEEC85d58f3925eee5Ea71790577f5a0df831";

/**
 * IPLaunchRegistry: DRS-gated IP registry bridging v2 attestation with v1 IP launch.
 * Deploy with: forge script script/DeployIPLaunch.s.sol --rpc-url $RPC_URL --broadcast
 * Update this address after deployment.
 */
export const LAUNCH_REGISTRY_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

// ── Shared ────────────────────────────────────────────────────────────────────

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
