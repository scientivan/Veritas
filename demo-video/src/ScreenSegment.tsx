import React from "react";
import {AbsoluteFill, Video, staticFile, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {COLORS, FONT} from "./theme";

/**
 * Wraps a screen-recording MP4 with a subtle label overlay.
 * Drop your recordings into demo-video/public/:
 *   seg2-creator.mp4
 *   seg4-collector-lp.mp4
 *   seg6-living-drs.mp4
 *   seg8-gate.mp4
 */
type Props = {
  file: string;
  label: string;
};

export const ScreenSegment: React.FC<Props> = ({file, label}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();

  const labelOpacity = interpolate(frame, [0, 20, durationInFrames - 20, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{background: "#000"}}>
      <Video src={staticFile(file)} style={{width: "100%", height: "100%", objectFit: "contain"}} />

      {/* Segment label — top-right watermark */}
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
        <span style={{fontFamily: FONT.display, fontSize: 12, color: COLORS.ink, fontWeight: 500}}>{label}</span>
      </div>
    </AbsoluteFill>
  );
};
