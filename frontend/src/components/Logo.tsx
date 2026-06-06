import {cn} from "@/lib/utils";

/** Veritas mark: a 270° arc ring echoing the DRS gauge, in Reactive blue. */
export function Logo({withWordmark = true, className}: {withWordmark?: boolean; className?: string}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M6.34 17.66 A8 8 0 1 1 17.66 17.66"
          stroke="var(--primary)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="2.4" fill="var(--primary)" />
      </svg>
      {withWordmark && (
        <span className="font-display text-[19px] font-semibold tracking-tight text-ink">
          Veritas
        </span>
      )}
    </span>
  );
}
