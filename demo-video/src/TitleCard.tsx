import React from "react";
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import {COLORS, FONT} from "./theme";

type Props = {
  title: string;
  subtitle?: string;
  accent?: string;
  stepNumber?: number;
};

export const TitleCard: React.FC<Props> = ({title, subtitle, accent = COLORS.primaryLight, stepNumber}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const p = spring({fps, frame, config: {damping: 16, stiffness: 80}});
  const endFade = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const lineWidth = interpolate(frame, [10, 45], [0, 340], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "0 120px",
        opacity: endFade,
      }}
    >
      {stepNumber && (
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 13,
            color: COLORS.primary,
            letterSpacing: 2,
            marginBottom: 20,
            opacity: interpolate(p, [0, 1], [0, 1]),
          }}
        >
          {`0${stepNumber}`.slice(-2)} /
        </div>
      )}

      <div
        style={{
          transform: `translateY(${interpolate(p, [0, 1], [32, 0])}px)`,
          opacity: interpolate(p, [0, 1], [0, 1]),
        }}
      >
        <div
          style={{
            fontFamily: FONT.display,
            fontSize: 64,
            fontWeight: 700,
            color: accent,
            letterSpacing: -2,
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontFamily: FONT.display,
              fontSize: 20,
              color: COLORS.muted,
              marginTop: 16,
              fontWeight: 400,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 32,
          width: lineWidth,
          height: 2,
          background: `linear-gradient(90deg, ${accent}, transparent)`,
          borderRadius: 2,
        }}
      />
    </AbsoluteFill>
  );
};
