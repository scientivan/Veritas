---
target: background design and interactivity
total_score: 28
p0_count: 0
p1_count: 3
timestamp: 2026-06-05T01-13-38Z
slug: frontend-src-components-cursorwave-tsx
---
# Critique — Background Design & Interactivity

Scope: CursorWave ambient background + interactive layer (hero gauge tabs, theme toggle, DRS gauge, buttons, reveal motion). Detector clean (0 findings). No live browser pass (no browser tool in session).

## Design Health Score: 28/40 (Good)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Gauge computes well; tab switch not announced to SR |
| 2 | Match System / Real World | 3 | DRS/D/A jargon, but inline copy explains |
| 3 | User Control & Freedom | 3 | Toggle + tabs reversible |
| 4 | Consistency & Standards | 3 | Glass + glow contradict project's own DESIGN.md bans |
| 5 | Error Prevention | 3 | n/a on this surface |
| 6 | Recognition vs Recall | 3 | Labeled tabs and toggle |
| 7 | Flexibility & Efficiency | 2 | No arrow-key tab nav; small targets; desktop-only bg |
| 8 | Aesthetic & Minimalist | 2 | Four simultaneous motions at load fight "calm authority" |
| 9 | Error Recovery | 3 | n/a |
| 10 | Help & Documentation | 3 | Outcome copy explains gate/fee inline |

## Anti-Patterns Verdict
Not SaaS-slop — typography/color/copy clearly authored. BUT falls into the one trap the brief swore off: full-viewport animated blue cursor-trailing glow (CursorWave.tsx:72-76) + backdrop-blur glass hero card (HeroGauge.tsx:22). DESIGN.md bans blue glow + web3 decoration; PRODUCT.md anti-references ban glassmorphism + purple/blue glow. Reads as "generic dApp" to skeptical VC before they read the DRS argument. Detector clean but cannot encode project's self-imposed anti-glow/anti-glass rules.

## What's Working
- Reduced-motion + visibility discipline (canvas static frame, visibilitychange pause, useReducedMotion in gauge, global CSS fallback).
- DRS gauge legibility: risk by color + label + arc position (color-blind safe); 0→value roll reads as "computing."
- Theme toggle: accessible label, scoped theme-anim crossfade only during toggle.

## Priority Issues
- [P1] CursorWave = project's own banned blue glow + decorative motion conveying no state; rAF never settles (constant repaint, battery). Fix: cut, OR demote to static texture (.grid-backdrop already exists, unused), OR settle-to-rest + remove radial glow.
- [P1] Glassmorphism on hero gauge card (bg-surface/60 backdrop-blur-sm) — banned pattern. Fix: make opaque, elevation via surface-lightness + hairline.
- [P1] Hero gauge tabs are half-implemented ARIA tab pattern: no roving tabindex/arrow keys, no aria-controls/tabpanel, no aria-live on gauge update — silent tier change for SR. Fix: full pattern OR switch to aria-pressed toggle buttons + aria-live region.
- [P2] Dead --wave-alpha token (globals.css:32) — defined + commented but never read by CursorWave (hardcoded alphas). Fix: read it, or delete.
- [P2] Motion budget at first paint (reveal + gauge roll + infinite ping + infinite wave) vs "calm authority." Fix: keep gauge roll, demote the rest.
- [P2] Tabs ~32px (<44px touch min), weak inactive hover; background interactivity is pointer/desktop-only, costs mobile battery for no payoff. Fix: ≥40px tabs + hover bg; static texture for bg.

## Persona Red Flags
- Sam (a11y): tablist promises arrow nav that doesn't exist; tier change silent (no aria-live).
- Casey (mobile): cursor bg does nothing on touch but keeps rAF (battery); 32px tabs; backdrop-blur jank.
- Skeptical VC: blue glow + frosted glass = generic-dApp vocabulary in first 2s, undercuts evidence/authority thesis.

## Minor Observations
- useEffect([theme]) rebuilds whole canvas on every toggle.
- reduce captured once at mount; won't react to mid-session OS change.
- .grid-backdrop utility unused — ready-made static alternative.
- Button active:translate-y-px press micro-interaction is good.
