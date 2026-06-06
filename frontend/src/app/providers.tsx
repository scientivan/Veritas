"use client";

import {useState, type ReactNode} from "react";
import {WagmiProvider} from "wagmi";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {RainbowKitProvider, darkTheme, lightTheme} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import {Toaster} from "sonner";
import {wagmiConfig} from "@/lib/wagmi";
import {ThemeProvider, useTheme} from "@/components/theme/ThemeProvider";

const rkOptions = {
  accentColor: "#004eff",
  accentColorForeground: "#ffffff",
  borderRadius: "medium",
  fontStack: "system",
  overlayBlur: "small",
} as const;

function RainbowKitThemed({children}: {children: ReactNode}) {
  const {theme} = useTheme();
  const rk = theme === "light" ? lightTheme(rkOptions) : darkTheme(rkOptions);
  return (
    <RainbowKitProvider theme={rk}>
      {children}
      <Toaster
        theme={theme}
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--ink)",
          },
        }}
      />
    </RainbowKitProvider>
  );
}

export function Providers({children}: {children: ReactNode}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RainbowKitThemed>{children}</RainbowKitThemed>
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
