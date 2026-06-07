export const COLORS = {
  bg: "#0a0a0b",
  surface: "#111114",
  border: "#1e1e24",
  ink: "#f2f2f3",
  muted: "#6b6b7a",
  faint: "#2a2a32",
  primary: "#7c3aed",
  primaryLight: "#a78bfa",
  riskLow: "#22c55e",
  riskMid: "#f59e0b",
  riskHigh: "#ef4444",
  accent: "#06b6d4",
} as const;

export const FONT = {
  display: "'Inter', 'SF Pro Display', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
} as const;

export const FPS = 30;

// Composition durations in frames at 30fps
export const DURATIONS = {
  intro: 32 * FPS,       // 32s animated intro
  architecture: 25 * FPS, // 25s architecture
  titleCard: 8 * FPS,    // 8s title cards
  closing: 30 * FPS,     // 30s closing
} as const;
