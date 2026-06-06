"use client";

import {useEffect, useState, useRef} from "react";
import {usePathname, useRouter} from "next/navigation";
import {Palette, TrendingUp, ShoppingBag} from "lucide-react";
import {cn} from "@/lib/utils";
import {LINKS_BY_ROLE} from "@/lib/navigation";

export type Role = "creator" | "lp" | "collector";

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
    
    if (pathname && role && pathname !== prevPathname.current) {
      localStorage.setItem(`veritas-last-path-${role}`, pathname);
      prevPathname.current = pathname;
    }
  }, [pathname, role, isLoaded]);

  const setRole = (r: Role) => {
    localStorage.setItem(STORAGE_KEY, r);
    setRoleState(r);
    
    const lastPath = localStorage.getItem(`veritas-last-path-${r}`);
    if (lastPath) {
      router.push(lastPath);
    } else {
      router.push(LINKS_BY_ROLE[r][0].href);
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
