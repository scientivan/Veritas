import {getDefaultConfig} from "@rainbow-me/rainbowkit";
import {unichainSepolia} from "./chains";

/**
 * wagmi + RainbowKit config. A WalletConnect projectId enables WC wallets;
 * injected wallets (e.g. MetaMask) work without one. Set NEXT_PUBLIC_WC_PROJECT_ID
 * for full wallet support.
 */
export const wagmiConfig = getDefaultConfig({
  appName: "Veritas",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "veritas_demo",
  chains: [unichainSepolia],
  ssr: true,
});
