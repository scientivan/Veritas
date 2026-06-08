import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {COLORS, FONT} from "./theme";

const lines = [
  "Tokenized content pools are illiquid.",
  "Not because of bad tech.",
  "Because IL risk is invisible on-chain.",
  "LPs can't price what they can't see.",
];

function AnimatedLine({text, delay, frame, fps}: {text: string; delay: number; frame: number; fps: number}) {
  const progress = spring({
    fps,
    frame: frame - delay,
    config: {damping: 18, stiffness: 80, mass: 0.6},
  });
  const opacity = interpolate(frame - delay, [0, 15], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return (
    <div
      style={{
        transform: `translateY(${interpolate(progress, [0, 1], [24, 0])}px)`,
        opacity,
        fontFamily: FONT.display,
        fontSize: 32,
        fontWeight: 400,
        color: COLORS.muted,
        lineHeight: 1.5,
        marginBottom: 8,
      }}
    >
      {text}
    </div>
  );
}

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const titleProgress = spring({fps, frame, config: {damping: 14, stiffness: 60}});
  const taglineOpacity = interpolate(frame, [50, 80], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const dividerScale = interpolate(frame, [40, 65], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});

  // Fade out near end
  const endFade = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], {
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
        padding: "0 120px",
        opacity: endFade,
      }}
    >
      {/* Logo / wordmark */}
      <div
        style={{
          transform: `translateY(${interpolate(titleProgress, [0, 1], [40, 0])}px)`,
          opacity: titleProgress,
          marginBottom: 48,
        }}
      >
        <div style={{display: "flex", alignItems: "center", gap: 16, marginBottom: 16}}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.accent})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
              color: "white",
              fontFamily: FONT.display,
            }}
          >
            V
          </div>
          <span
            style={{
              fontFamily: FONT.display,
              fontSize: 28,
              fontWeight: 600,
              color: COLORS.ink,
              letterSpacing: -0.5,
            }}
          >
            Veritas
          </span>
        </div>
        <div
          style={{
            width: 320 * dividerScale,
            height: 1,
            background: `linear-gradient(90deg, ${COLORS.primary}, transparent)`,
            marginBottom: 32,
          }}
        />
        <div
          style={{
            fontFamily: FONT.display,
            fontSize: 18,
            color: COLORS.primaryLight,
            fontWeight: 500,
            opacity: taglineOpacity,
            letterSpacing: 0.5,
          }}
        >
          Provenance-Aware Impermanent Loss Protection
        </div>
      </div>

      {/* Problem lines */}
      <div style={{marginBottom: 56}}>
        {lines.map((line, i) => (
          <AnimatedLine key={i} text={line} delay={70 + i * 25} frame={frame} fps={fps} />
        ))}
      </div>

      {/* Solution reveal */}
      <div
        style={{
          opacity: interpolate(frame, [190, 220], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}),
          transform: `translateY(${interpolate(
            spring({fps, frame: frame - 190, config: {damping: 18}}),
            [0, 1],
            [20, 0]
          )}px)`,
        }}
      >
        <div
          style={{
            fontFamily: FONT.display,
            fontSize: 42,
            fontWeight: 700,
            color: COLORS.ink,
            lineHeight: 1.2,
            letterSpacing: -1,
          }}
        >
          Veritas makes it{" "}
          <span style={{color: COLORS.primaryLight}}>visible.</span>
        </div>
        <div
          style={{
            fontFamily: FONT.display,
            fontSize: 22,
            color: COLORS.muted,
            marginTop: 16,
            fontWeight: 400,
          }}
        >
          One live number. On-chain. Three actors. One lifecycle.
        </div>
      </div>

      {/* UHI9 tag */}
      <div
        style={{
          position: "absolute",
          bottom: 48,
          right: 120,
          fontFamily: FONT.display,
          fontSize: 13,
          color: COLORS.faint,
          opacity: interpolate(frame, [230, 260], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}),
        }}
      >
        UHI9 Hookathon · Unichain Sepolia
      </div>
    </AbsoluteFill>
  );
};
