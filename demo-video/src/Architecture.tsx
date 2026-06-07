import React from "react";
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import {COLORS, FONT} from "./theme";

type Actor = {label: string; role: string; color: string; icon: string};
const ACTORS: Actor[] = [
  {label: "Creator", role: "Verifies + tokenizes IP", color: COLORS.primaryLight, icon: "✦"},
  {label: "Collector", role: "Buys on bonding curve", color: COLORS.accent, icon: "◈"},
  {label: "LP", role: "Provides liquidity", color: COLORS.riskLow, icon: "◉"},
];

const LIFECYCLE = [
  "Verify Art (DRS gate)",
  "Attest + Mint ERC-20",
  "Register (IPLaunchRegistry)",
  "Open Bonding Curve",
  "Collectors Buy",
  "Graduate → v4 Pool",
  "LP Fee Protection",
];

function ActorCard({actor, delay, frame, fps}: {actor: Actor; delay: number; frame: number; fps: number}) {
  const p = spring({fps, frame: frame - delay, config: {damping: 16, stiffness: 70}});
  return (
    <div
      style={{
        opacity: interpolate(p, [0, 1], [0, 1]),
        transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)`,
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: "20px 28px",
        minWidth: 200,
        textAlign: "center",
      }}
    >
      <div style={{fontSize: 28, marginBottom: 8, color: actor.color}}>{actor.icon}</div>
      <div style={{fontFamily: FONT.display, fontSize: 22, fontWeight: 600, color: COLORS.ink, marginBottom: 6}}>
        {actor.label}
      </div>
      <div style={{fontFamily: FONT.display, fontSize: 13, color: COLORS.muted}}>{actor.role}</div>
    </div>
  );
}

function LifecycleStep({text, index, frame, fps}: {text: string; index: number; frame: number; fps: number}) {
  const delay = 90 + index * 12;
  const p = spring({fps, frame: frame - delay, config: {damping: 18, stiffness: 90}});
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        opacity: interpolate(p, [0, 1], [0, 1]),
        transform: `translateX(${interpolate(p, [0, 1], [-20, 0])}px)`,
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.accent})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          color: "white",
          fontWeight: 700,
          fontFamily: FONT.display,
          flexShrink: 0,
        }}
      >
        {index + 1}
      </div>
      <div style={{fontFamily: FONT.display, fontSize: 15, color: COLORS.ink}}>{text}</div>
      {index < LIFECYCLE.length - 1 && (
        <div style={{height: 1, flex: 1, background: COLORS.border}} />
      )}
    </div>
  );
}

export const Architecture: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const titleP = spring({fps, frame, config: {damping: 14, stiffness: 60}});
  const drsLabelP = spring({fps, frame: frame - 40, config: {damping: 14, stiffness: 70}});
  const endFade = interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 80px",
        opacity: endFade,
      }}
    >
      {/* Header */}
      <div
        style={{
          opacity: titleP,
          transform: `translateY(${interpolate(titleP, [0, 1], [24, 0])}px)`,
          marginBottom: 48,
        }}
      >
        <div style={{fontFamily: FONT.display, fontSize: 36, fontWeight: 700, color: COLORS.ink, letterSpacing: -1}}>
          One Score. Three Actors. One Lifecycle.
        </div>
      </div>

      {/* Actors row */}
      <div style={{display: "flex", gap: 24, marginBottom: 48, justifyContent: "flex-start"}}>
        {ACTORS.map((actor, i) => (
          <ActorCard key={actor.label} actor={actor} delay={20 + i * 15} frame={frame} fps={fps} />
        ))}

        {/* DRS orb */}
        <div
          style={{
            opacity: interpolate(drsLabelP, [0, 1], [0, 1]),
            transform: `scale(${interpolate(drsLabelP, [0, 1], [0.6, 1])}) translateY(${interpolate(drsLabelP, [0,1],[20,0])}px)`,
            marginLeft: "auto",
            background: `radial-gradient(circle at 50% 40%, ${COLORS.primary}33, transparent 70%)`,
            border: `1px solid ${COLORS.primary}44`,
            borderRadius: 16,
            padding: "20px 28px",
            textAlign: "center",
            minWidth: 180,
          }}
        >
          <div style={{fontFamily: FONT.mono, fontSize: 38, fontWeight: 700, color: COLORS.primaryLight}}>DRS</div>
          <div style={{fontFamily: FONT.display, fontSize: 13, color: COLORS.muted, marginTop: 6}}>
            Dilution Risk Score
          </div>
          <div style={{fontFamily: FONT.display, fontSize: 11, color: COLORS.primary, marginTop: 4}}>
            D + A → noisy-OR
          </div>
        </div>
      </div>

      {/* Lifecycle flow */}
      <div
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: "24px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {LIFECYCLE.map((step, i) => (
          <LifecycleStep key={step} text={step} index={i} frame={frame} fps={fps} />
        ))}
      </div>

      {/* Reactive tag */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          right: 80,
          fontFamily: FONT.display,
          fontSize: 12,
          color: COLORS.primary,
          opacity: interpolate(frame, [280, 300], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}),
          background: `${COLORS.primary}18`,
          border: `1px solid ${COLORS.primary}44`,
          borderRadius: 8,
          padding: "6px 14px",
        }}
      >
        Living DRS: powered by Reactive Network (cross-chain, no keeper)
      </div>
    </AbsoluteFill>
  );
};
