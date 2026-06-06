"use client";

import {useEffect, useRef, useState, type ReactNode} from "react";
import {animate, motion, useInView, useReducedMotion} from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Scroll-triggered entrance that ENHANCES an already-laid-out block (subtle rise +
 * fade, once). Honors prefers-reduced-motion by rendering the content statically.
 */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as];
  if (reduce) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  return (
    <MotionTag
      className={className}
      initial={{opacity: 0, y}}
      whileInView={{opacity: 1, y: 0}}
      viewport={{once: true, margin: "0px 0px -12% 0px"}}
      transition={{duration: 0.6, ease: EASE, delay}}
    >
      {children}
    </MotionTag>
  );
}

/** Children rise in sequence as the group scrolls into view. */
export function RevealStagger({
  children,
  step = 0.08,
  className,
}: {
  children: ReactNode[];
  step?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <Reveal key={i} delay={i * step}>
          {child}
        </Reveal>
      ))}
    </div>
  );
}

/** A number that counts up from 0 the first time it scrolls into view. */
export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1.2,
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, {once: true, margin: "-15%"});
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setN(value);
      return;
    }
    const controls = animate(0, value, {duration, ease: EASE, onUpdate: setN});
    return () => controls.stop();
  }, [inView, value, reduce, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {n.toFixed(decimals)}
      {suffix}
    </span>
  );
}
