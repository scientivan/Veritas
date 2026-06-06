"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {Logo} from "./Logo";
import {ThemeToggle} from "./theme/ThemeToggle";
import {cn} from "@/lib/utils";

const LINKS = [
  {href: "/attest", label: "Attest"},
  {href: "/pools", label: "Pools"},
  {href: "/dispute", label: "Disputes"},
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="rounded-md focus-visible:outline-none" aria-label="Veritas home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active ? "text-ink" : "text-muted hover:text-ink"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <ConnectButton
            showBalance={false}
            chainStatus={{smallScreen: "icon", largeScreen: "icon"}}
            accountStatus={{smallScreen: "avatar", largeScreen: "address"}}
          />
        </div>
      </div>
    </header>
  );
}
