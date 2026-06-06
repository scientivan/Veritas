"use client";

import {useEffect, useState} from "react";
import {Palette, TrendingUp} from "lucide-react";
import {cn} from "@/lib/utils";

export type Role = "creator" | "lp";

const STORAGE_KEY = "veritas-role";

export function useRole() {
  const [role, setRoleState] = useState<Role>("lp");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "creator" || stored === "lp") setRoleState(stored);
  }, []);

  const setRole = (r: Role) => {
    localStorage.setItem(STORAGE_KEY, r);
    setRoleState(r);
  };

  return {role, setRole};
}

interface Props {
  role: Role;
  onChange: (r: Role) => void;
  className?: string;
}

export function RoleSwitcher({role, onChange, className}: Props) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 text-xs font-medium",
        className
      )}
    >
      <button
        onClick={() => onChange("creator")}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-all",
          role === "creator"
            ? "bg-primary/20 text-primary-ink shadow-sm"
            : "text-muted hover:text-ink"
        )}
      >
        <Palette className="size-3.5" strokeWidth={2.25} />
        Creator
      </button>
      <button
        onClick={() => onChange("lp")}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-all",
          role === "lp"
            ? "bg-primary/20 text-primary-ink shadow-sm"
            : "text-muted hover:text-ink"
        )}
      >
        <TrendingUp className="size-3.5" strokeWidth={2.25} />
        LP
      </button>
    </div>
  );
}
