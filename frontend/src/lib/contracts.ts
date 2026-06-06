import type {Address} from "viem";

/** Live Veritas contract addresses on Unichain Sepolia (chainId 1301). All verified on Sourcify. */
export const REGISTRY_ADDRESS: Address = "0xe359bdB2cA1A152Ae62E2496F140ea192Ce0d824";
export const ORACLE_ADDRESS: Address = "0x45b327808f4D719C574D4508DD46a8E7b4124bd3";
export const HOOK_ADDRESS: Address = "0x0AaAef1B312243EfaAD238fb53403dC5761d60C4";
export const REGISTRY_CALLBACK_ADDRESS: Address = "0xa516891eE1a4b0c4a149D1241e2EE00702B7332a";
export const POOL_MANAGER_ADDRESS: Address = "0x00B036B58a818B1BC34d502D3fE730Db729e62AC";

export const CHAIN_ID = 1301;
export const EXPLORER = "https://sepolia.uniscan.xyz";
export const SOURCIFY_LOOKUP = "https://sourcify.dev/#/lookup";

/** The live, Sourcify-verified contracts, for the on-chain provenance strip. */
export const VERIFIED_CONTRACTS: {name: string; address: Address}[] = [
  {name: "Oracle", address: ORACLE_ADDRESS},
  {name: "Registry", address: REGISTRY_ADDRESS},
  {name: "Hook", address: HOOK_ADDRESS},
  {name: "Reactive callback", address: REGISTRY_CALLBACK_ADDRESS},
];
