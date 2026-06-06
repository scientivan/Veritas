import {cn} from "@/lib/utils";
import type {ComponentProps} from "react";

/** Quiet panel: surface lift + hairline border, no heavy shadow. */
export function Card({className, ...props}: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-[var(--radius-card)] border border-border bg-surface", className)}
      {...props}
    />
  );
}
