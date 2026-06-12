import Link from "next/link";
import {Store, Wallet} from "lucide-react";
import {cn} from "@/lib/utils";

const TABS = [
  {key: "market", href: "/market", label: "Marketplace", icon: Store},
  {key: "portfolio", href: "/portfolio", label: "Portfolio", icon: Wallet},
] as const;

export function CollectorTabs({current}: {current: "market" | "portfolio"}) {
  return (
    <div className="mt-6 flex w-fit items-center gap-1 rounded-xl border border-border bg-surface p-1">
      {TABS.map(({key, href, label, icon: Icon}) => (
        <Link
          key={key}
          href={href}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            current === key
              ? "bg-primary/20 text-primary-ink"
              : "text-muted hover:text-ink"
          )}
        >
          <Icon className="size-4" strokeWidth={2.25} />
          {label}
        </Link>
      ))}
    </div>
  );
}
