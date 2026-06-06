import {cn} from "@/lib/utils";
import type {ComponentProps} from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap rounded-[10px] transition-[background,border-color,color,transform] duration-150 ease-out active:translate-y-px disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-on-primary hover:bg-primary-hover shadow-[0_1px_0_oklch(1_0_0/0.12)_inset]",
  secondary: "bg-surface-2 text-ink border border-border hover:border-border-strong",
  ghost: "text-muted hover:text-ink hover:bg-surface",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & {variant?: Variant; size?: Size}) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}
