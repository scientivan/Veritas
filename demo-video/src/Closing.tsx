import React from "react";
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import {COLORS, FONT} from "./theme";

const WINS = [
  {label: "Original Idea (30%)", value: "First v4 hook pricing IL from content-authenticity data"},
  {label: "Unique Execution (25%)", value: "2-of-3 oracle quorum · Reactive living-D · bonding curve + graduation"},
  {label: "Impact (20%)", value: "Complete creator economy lifecycle — gate, launch, trade, protect"},
  {label: "Functionality (15%)", value: "81 passing tests · live on Unichain Sepolia · proven cross-chain"},
];

function WinRow({item, delay, frame, fps}: {item: typeof WINS[0]; delay: number; frame: number; fps: number}) {
  const p = spring({fps, frame: frame - delay, config: {damping: 18, stiffness: 80}});
  return (
    <div
      style={{
        display: "flex",
        gap: 24,
        alignItems: "flex-start",
        opacity: interpolate(p, [0, 1], [0, 1]),
        transform: `translateX(${interpolate(p, [0, 1], [-24, 0])}px)`,
        padding: "14px 0",
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      <div
        style={{
          fontFamily: FONT.display,
          fontSize: 13,
          color: COLORS.primaryLight,
          fontWeight: 600,
          minWidth: 200,
          paddingTop: 1,
        }}
      >
        {item.label}
      </div>
      <div style={{fontFamily: FONT.display, fontSize: 15, color: COLORS.ink}}>
        {item.value}
      </div>
    </div>
  );
}

export const Closing: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const titleP = spring({fps, frame, config: {damping: 14, stiffness: 60}});
  const logoFade = interpolate(frame, [durationInFrames - 40, durationInFrames - 15], [0, 1], {
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
        padding: "0 100px",
      }}
    >
      <div
        style={{
          opacity: interpolate(titleP, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(titleP, [0, 1], [24, 0])}px)`,
          marginBottom: 40,
        }}
      >
        <div style={{fontFamily: FONT.display, fontSize: 32, fontWeight: 700, color: COLORS.ink, letterSpacing: -0.5}}>
          Why Veritas wins
        </div>
      </div>

      <div style={{marginBottom: 48}}>
        {WINS.map((item, i) => (
          <WinRow key={item.label} item={item} delay={20 + i * 18} frame={frame} fps={fps} />
        ))}
      </div>

      {/* Final wordmark */}
      <div style={{opacity: logoFade, textAlign: "center", marginTop: 16}}>
        <div
          style={{
            fontFamily: FONT.display,
            fontSize: 52,
            fontWeight: 700,
            background: `linear-gradient(135deg, ${COLORS.primaryLight}, ${COLORS.accent})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: -2,
          }}
        >
          Veritas Protocol
        </div>
        <div style={{fontFamily: FONT.display, fontSize: 16, color: COLORS.muted, marginTop: 8}}>
          github.com/Scientivan/VeritasProtocolv2 · Unichain Sepolia (1301)
        </div>
      </div>
    </AbsoluteFill>
  );
};
