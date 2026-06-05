import {createPublicClient, defineChain, http, type Hex} from "viem";
import {config} from "./config.js";
import {ORACLE_ABI, REGISTRY_ABI} from "./abi.js";
import type {OperatorSig} from "./types.js";

/** Convert our number-timestamp sigs to the uint64 (bigint) shape viem expects. */
function toAbiSigs(sigs: OperatorSig[]) {
  return sigs.map((s) => ({drs: s.drs, timestamp: BigInt(s.timestamp), signature: s.signature}));
}

export const unichainSepolia = defineChain({
  id: config.chainId,
  name: "Unichain Sepolia",
  nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
  rpcUrls: {default: {http: [config.rpcUrl]}},
});

export const publicClient = createPublicClient({
  chain: unichainSepolia,
  transport: http(config.rpcUrl),
});

/** Ask the live oracle whether a batch of sigs would pass `verify` (no revert). */
export function oracleIsValid(attestationId: Hex, sigs: OperatorSig[]): Promise<boolean> {
  return publicClient.readContract({
    address: config.oracleAddress,
    abi: ORACLE_ABI,
    functionName: "isValid",
    args: [attestationId, toAbiSigs(sigs)],
  });
}

/** Canonical DRS the oracle would store for these sigs (reverts if invalid). */
export function oracleVerify(attestationId: Hex, sigs: OperatorSig[]): Promise<number> {
  return publicClient.readContract({
    address: config.oracleAddress,
    abi: ORACLE_ABI,
    functionName: "verify",
    args: [attestationId, toAbiSigs(sigs)],
  });
}

export function registryAttestFee(): Promise<bigint> {
  return publicClient.readContract({
    address: config.registryAddress,
    abi: REGISTRY_ABI,
    functionName: "attestFee",
  });
}

export function isAttested(attestationId: Hex): Promise<boolean> {
  return publicClient.readContract({
    address: config.registryAddress,
    abi: REGISTRY_ABI,
    functionName: "isAttested",
    args: [attestationId],
  });
}
