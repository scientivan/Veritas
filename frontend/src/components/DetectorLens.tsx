"use client";

import {useEffect, useRef} from "react";
import {useTheme} from "./theme/ThemeProvider";

/**
 * Ambient background: a faint field of unresolved "content" noise that resolves into a
 * crisp Reactive-blue perceptual-hash fingerprint as the cursor sweeps over it, as if a
 * detector were being run across the field. The product's thesis made tactile (make the
 * invisible legible), not decoration: only the resolved signal is blue, against neutral noise.
 *
 * The reveal is transient. A cell is energized only while the lens is *approaching* it, and
 * otherwise decays to zero at a constant rate, so the resolved patch trails the cursor and
 * fades out over a fixed duration. Hold still and it dissolves; an idle page shows only noise.
 *
 * Restraint by construction:
 *  - the noise field is static (drawn once to an offscreen buffer);
 *  - the render loop is activity-gated: it stops once the lens settles and the reveal has
 *    fully faded, so an idle page paints nothing (no perpetual rAF, no battery drain);
 *  - prefers-reduced-motion renders a single resolved frame and never tracks;
 *  - intensity is driven by the --wave-alpha token (theme-aware).
 */
const CELL = 20; // resolved-fingerprint cell size (px)
const NOISE_GAP = 26; // spacing of the unresolved noise specks (px)
const FOLLOW = 0.09; // low lens-follow easing, so the travel reads as a delay
const FADE = 0.02; // constant decay per frame → reveal fades over ~0.8s

const ss = (p: number) => p * p * (3 - 2 * p); // smoothstep falloff

// Deterministic per-cell hash so a given region always resolves to the same fingerprint.
function bitAt(ix: number, iy: number) {
  const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return s - Math.floor(s); // 0..1
}

export function DetectorLens() {
  const ref = useRef<HTMLCanvasElement>(null);
  const {theme} = useTheme();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cv: HTMLCanvasElement = canvas;
    const cx: CanvasRenderingContext2D = ctx;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isLight = theme === "light";
    const [BR, BG, BB] = [0, 78, 255]; // Reactive blue #004eff
    const NEUTRAL = isLight ? "0,0,0" : "247,247,247"; // chroma-0 noise

    // Theme-tunable atmosphere strength, read from the design token (DESIGN.md).
    const waveAlpha =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--wave-alpha")
      ) || (isLight ? 0.7 : 0.5);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let lensR = 150; // resolve radius around the cursor
    let raf = 0;
    let running = false;

    const lens = {x: window.innerWidth / 2, y: window.innerHeight * 0.42};
    const target = {x: lens.x, y: lens.y};
    let alpha = 0; // global presence 0..1 (fades out when the cursor leaves)
    let alphaTarget = 1;

    // Per-cell state: c = resolve charge, p = last proximity (to detect approach).
    const cells = new Map<number, {c: number; p: number}>();
    const key = (ix: number, iy: number) => ix * 4096 + iy;

    // Offscreen static noise buffer, drawn once per resize, blitted each frame.
    const noise = document.createElement("canvas");
    const nctx = noise.getContext("2d")!;

    function paintNoise() {
      noise.width = Math.floor(w * dpr);
      noise.height = Math.floor(h * dpr);
      nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nctx.clearRect(0, 0, w, h);
      for (let y = NOISE_GAP / 2; y < h; y += NOISE_GAP) {
        for (let x = NOISE_GAP / 2; x < w; x += NOISE_GAP) {
          const r = bitAt(Math.round(x), Math.round(y));
          if (r < 0.34) continue; // sparse, uneven scatter (content, not a grid)
          const a = waveAlpha * (0.04 + r * 0.05);
          nctx.fillStyle = `rgba(${NEUTRAL},${a})`;
          const s = r > 0.86 ? 2 : 1;
          nctx.fillRect(x, y, s, s);
        }
      }
    }

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      lensR = Math.max(110, Math.min(180, w * 0.14));
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintNoise();
    }

    // Proximity (0..1, 0 outside) of each cell within the lens, keyed by grid cell.
    function region(lx: number, ly: number) {
      const out = new Map<number, number>();
      if (alphaTarget <= 0) return out;
      const ix0 = Math.max(0, Math.floor((lx - lensR) / CELL));
      const ix1 = Math.ceil((lx + lensR) / CELL);
      const iy0 = Math.max(0, Math.floor((ly - lensR) / CELL));
      const iy1 = Math.ceil((ly + lensR) / CELL);
      for (let iy = iy0; iy <= iy1; iy++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const d = Math.hypot(ix * CELL + CELL / 2 - lx, iy * CELL + CELL / 2 - ly);
          if (d > lensR) continue;
          out.set(key(ix, iy), 1 - d / lensR);
        }
      }
      return out;
    }

    function drawCell(k: number, intensity: number) {
      const ix = Math.floor(k / 4096);
      const iy = k - ix * 4096;
      const on = bitAt(ix, iy) > 0.55; // ~45% of cells are "1" bits
      const a = waveAlpha * intensity * (on ? 0.55 : 0.07) * alpha;
      if (a < 0.004) return;
      cx.fillStyle = `rgba(${BR},${BG},${BB},${a})`;
      const inset = on ? 3 : 6;
      cx.fillRect(ix * CELL + inset, iy * CELL + inset, CELL - inset * 2, CELL - inset * 2);
    }

    function frame() {
      lens.x += (target.x - lens.x) * FOLLOW;
      lens.y += (target.y - lens.y) * FOLLOW;
      alpha += (alphaTarget - alpha) * FOLLOW;

      const prox = region(lens.x, lens.y);
      for (const k of prox.keys()) if (!cells.has(k)) cells.set(k, {c: 0, p: 0});

      cx.clearRect(0, 0, w, h);
      cx.drawImage(noise, 0, 0, w, h);

      let active = false;
      for (const [k, st] of cells) {
        const p = prox.get(k) ?? 0;
        // Energize only while the lens is moving toward this cell; never while it dwells.
        if (p > st.p + 0.0005) {
          const m = ss(p);
          if (m > st.c) st.c = m;
        }
        st.c -= FADE; // constant fade-away
        if (st.c < 0) st.c = 0;
        st.p = p;

        if (st.c < 0.003 && p <= 0) {
          cells.delete(k);
          continue;
        }
        if (st.c > 0.003 || p > 0.0005) active = true;
        drawCell(k, st.c);
      }

      const moving =
        Math.abs(target.x - lens.x) > 0.4 ||
        Math.abs(target.y - lens.y) > 0.4 ||
        Math.abs(alphaTarget - alpha) > 0.01;

      if (!moving && !active) {
        running = false;
        return; // settled and fully faded; idle page does no work
      }
      raf = requestAnimationFrame(frame);
    }

    function staticFrame() {
      cx.clearRect(0, 0, w, h);
      cx.drawImage(noise, 0, 0, w, h);
      for (const [k, p] of region(lens.x, lens.y)) drawCell(k, ss(p));
    }

    function kick() {
      if (running || reduce || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }

    function onMove(e: PointerEvent) {
      target.x = e.clientX;
      target.y = e.clientY;
      alphaTarget = 1;
      kick();
    }
    function onLeave() {
      alphaTarget = 0;
      kick();
    }
    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        running = false;
      } else {
        kick();
      }
    }

    resize();
    window.addEventListener("resize", resize);

    if (reduce) {
      alpha = 1;
      staticFrame(); // single resolved frame at center, no tracking
    } else {
      window.addEventListener("pointermove", onMove, {passive: true});
      document.addEventListener("pointerleave", onLeave);
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [theme]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
