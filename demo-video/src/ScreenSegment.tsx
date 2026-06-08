import React, { useState } from "react";
import {
  AbsoluteFill,
  Video,
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT } from "./theme";

type Props = {
  file: string;
  label: string;
};

export const ScreenSegment: React.FC<Props> = ({ file, label }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const [missing, setMissing] = useState(false);

  const labelOpacity = interpolate(
    frame,
    [0, 20, durationInFrames - 20, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  if (missing) {
    return (
      <AbsoluteFill
        style={{
          background: COLORS.bg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 13,
            color: COLORS.muted,
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 10,
            padding: "20px 36px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, color: COLORS.faint, marginBottom: 8 }}>
            RECORDING PENDING
          </div>
          <div style={{ color: COLORS.ink }}>{file}</div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 6 }}>
            Run: npm run record
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Video
        src={staticFile(file)}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
        onError={() => setMissing(true)}
      />

      {/* Segment label watermark — top right */}
      <div
        style={{
          position: "absolute",
          top: 24,
          right: 32,
          opacity: labelOpacity * 0.85,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: `${COLORS.bg}cc`,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: "6px 14px",
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: COLORS.riskLow,
            boxShadow: `0 0 6px ${COLORS.riskLow}`,
          }}
        />
        <span
          style={{
            fontFamily: FONT.display,
            fontSize: 12,
            color: COLORS.ink,
            fontWeight: 500,
          }}
        >
          {label}
        </span>
      </div>
    </AbsoluteFill>
  );
};
