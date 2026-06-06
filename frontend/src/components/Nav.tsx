"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {Logo} from "./Logo";
import {ThemeToggle} from "./theme/ThemeToggle";
import {RoleSwitcher, useRole} from "./RoleSwitcher";
import {cn} from "@/lib/utils";
import {LINKS_BY_ROLE, LP_LINKS} from "@/lib/navigation";


export function Nav() {
  const pathname = usePathname();
  const {role, setRole} = useRole();

  const links = LINKS_BY_ROLE[role] ?? LP_LINKS;

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="rounded-md focus-visible:outline-none" aria-label="Veritas home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => {
            // "/market" has sibling sub-routes (/market/portfolio, /market/history),
            // so it must match exactly rather than as a prefix of its siblings.
            const exactOnly = link.href === "/market";
            const active =
              pathname === link.href ||
              (!exactOnly && pathname.startsWith(link.href + "/")) ||
              (link.href === "/pools" && pathname.startsWith("/pool/"));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-primary/20 text-primary-ink shadow-[inset_0_-2px_0_0_var(--color-primary-ink)/60]"
                    : "text-muted hover:bg-surface hover:text-ink"
                )}
              >
                {link.label}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-primary-ink opacity-80" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <RoleSwitcher role={role} onChange={setRole} className="hidden sm:flex" />
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
