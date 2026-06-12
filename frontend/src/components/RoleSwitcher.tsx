"use client";

import {useEffect, useState, useRef} from "react";
import {usePathname, useRouter} from "next/navigation";
import {Palette, TrendingUp, ShoppingBag} from "lucide-react";
import {cn} from "@/lib/utils";
import {DEFAULT_PATH_BY_ROLE, pathBelongsToRole, type Role} from "@/lib/navigation";

export type {Role};

const STORAGE_KEY = "veritas-role";
const ROLES: Role[] = ["creator", "lp", "collector"];

export function useRole() {
  const [role, setRoleState] = useState<Role>("lp");
  const [isLoaded, setIsLoaded] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const prevPathname = useRef<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (ROLES as string[]).includes(stored)) {
      setRoleState(stored as Role);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    // Only remember a path under the current role if the page actually belongs
    // to that role. This prevents cross-role contamination: e.g. landing on a
    // Creator-only page (/creator, /launch) while the active role is Collector
    // must never be stored as the Collector's "last path".
    if (
      pathname &&
      pathname !== prevPathname.current &&
      pathBelongsToRole(pathname, role)
    ) {
      localStorage.setItem(`veritas-last-path-${role}`, pathname);
      prevPathname.current = pathname;
    }
  }, [pathname, role, isLoaded]);

  const setRole = (r: Role) => {
    localStorage.setItem(STORAGE_KEY, r);
    setRoleState(r);

    // Restore the last page opened in this role, but only if it still belongs
    // to the role (guards against stale/contaminated storage). Otherwise fall
    // back to the role's default landing page.
    const lastPath = localStorage.getItem(`veritas-last-path-${r}`);
    if (lastPath && pathBelongsToRole(lastPath, r)) {
      router.push(lastPath);
    } else {
      router.push(DEFAULT_PATH_BY_ROLE[r]);
    }
  };

  return {role, setRole};
}

interface Props {
  role: Role;
  onChange: (r: Role) => void;
  className?: string;
}

const OPTIONS: {value: Role; label: string; icon: typeof Palette}[] = [
  {value: "creator", label: "Creator", icon: Palette},
  {value: "lp", label: "LP", icon: TrendingUp},
  {value: "collector", label: "Collector", icon: ShoppingBag},
];

export function RoleSwitcher({role, onChange, className}: Props) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 text-xs font-medium",
        className
      )}
    >
      {OPTIONS.map(({value, label, icon: Icon}) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-all",
            role === value
              ? "bg-primary/20 text-primary-ink shadow-sm"
              : "text-muted hover:text-ink"
          )}
        >
          <Icon className="size-3.5" strokeWidth={2.25} />
          {label}
        </button>
      ))}
    </div>
  );
}
