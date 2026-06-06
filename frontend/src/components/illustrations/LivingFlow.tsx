"use client";

import {useEffect, useState} from "react";
import {motion, useReducedMotion} from "motion/react";
import {FileCheck2, Radio, Boxes, Activity, type LucideIcon} from "lucide-react";

/**
 * The trustless living-DRS loop as a self-running diagram: a pulse travels down the
 * four steps, and each completed cycle nudges the on-chain D upward, the way a new
 * near-duplicate would. Conveys "no keeper, it runs itself". Static under reduced motion.
 */
const STEPS: {icon: LucideIcon; label: string}[] = [
  {icon: FileCheck2, label: "NewAttestation"},
  {icon: Radio, label: "DilutionMonitor reacts"},
  {icon: Boxes, label: "getNearDuplicates()"},
  {icon: Activity, label: "DRS rises · fee re-prices"},
];

const D_STEPS = [0.0, 0.4, 0.6, 0.75, 0.85]; // saturateD-style climb across cycles

export function LivingFlow({className}: {className?: string}) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(reduce ? STEPS.length - 1 : -1);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduce) return;
    let step = -1;
    const id = setInterval(() => {
      step = step + 1;
      if (step >= STEPS.length) {
        step = 0;
        setCycle((c) => Math.min(c + 1, D_STEPS.length - 1));
      }
      setActive(step);
    }, 900);
    return () => clearInterval(id);
  }, [reduce]);

  const d = reduce ? 0.6 : D_STEPS[cycle];

  return (
    <div className={className}>
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-5 font-mono text-[13px]">
        {STEPS.map((s, i) => {
          const on = reduce || i <= active;
          const isHead = !reduce && i === active;
          return (
            <div key={s.label}>
              <div className="flex items-center gap-3">
                <motion.span
                  className="grid size-8 shrink-0 place-items-center rounded-lg border"
                  animate={{
                    backgroundColor: isHead
                      ? "color-mix(in oklch, var(--primary) 22%, transparent)"
                      : on
                        ? "var(--surface)"
                        : "var(--bg)",
                    borderColor: isHead ? "var(--primary)" : "var(--border)",
                    color: isHead ? "var(--primary-ink)" : on ? "var(--ink)" : "var(--faint)",
                  }}
                  transition={{duration: 0.3}}
                >
                  <s.icon className="size-4" strokeWidth={2} aria-hidden />
                </motion.span>
                <motion.span
                  animate={{color: isHead ? "var(--primary-ink)" : on ? "var(--ink)" : "var(--faint)"}}
                  transition={{duration: 0.3}}
                >
                  {s.label}
                </motion.span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="ml-4 my-0.5 h-3 w-px overflow-hidden bg-border">
                  <motion.div
                    className="h-full w-full origin-top bg-primary"
                    animate={{scaleY: !reduce && i < active ? 1 : 0}}
                    transition={{duration: 0.3}}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* on-chain D, climbing each completed cycle */}
        <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
          <span className="text-faint">on-chain D</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full bg-primary-ink/70"
              animate={{width: `${Math.round(d * 100)}%`}}
              transition={{duration: 0.6, ease: [0.16, 1, 0.3, 1]}}
            />
          </div>
          <motion.span className="tnum text-ink" key={d}>
            {d.toFixed(2)}
          </motion.span>
        </div>
      </div>
    </div>
  );
}
