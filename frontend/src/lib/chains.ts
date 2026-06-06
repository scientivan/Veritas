import {defineChain} from "viem";

/** Unichain Sepolia testnet (target deployment for Veritas). */
export const unichainSepolia = defineChain({
  id: 1301,
  name: "Unichain Sepolia",
  nativeCurrency: {name: "Sepolia Ether", symbol: "ETH", decimals: 18},
  rpcUrls: {
    default: {http: ["https://sepolia.unichain.org"]},
  },
  blockExplorers: {
    default: {name: "Uniscan", url: "https://sepolia.uniscan.xyz"},
  },
  testnet: true,
});
