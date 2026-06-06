import type {Metadata} from "next";
import {Fraunces, Hanken_Grotesk, IBM_Plex_Mono} from "next/font/google";
import "./globals.css";
import {Providers} from "./providers";
import {themeInitScript} from "@/components/theme/ThemeProvider";
import {DetectorLens} from "@/components/DetectorLens";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
});

const sans = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Veritas Protocol · Provenance-aware risk for content pools",
  description:
    "Veritas turns content authenticity into an on-chain Dilution Risk Score that prices an LP's real downside and calibrates a Uniswap v4 pool's fee automatically.",
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-bg text-ink">
        <script dangerouslySetInnerHTML={{__html: themeInitScript}} />
        <Providers>
          <DetectorLens />
          <div className="relative z-10 flex min-h-screen flex-col">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
