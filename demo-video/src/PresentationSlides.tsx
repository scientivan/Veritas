import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type Props = {
  images: string[];
  secPerImage?: number;
};

export const PresentationSlides: React.FC<Props> = ({
  images,
  secPerImage = 5,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const framesPerImage = secPerImage * fps;
  const crossfadeFrames = 12;

  const currentIdx = Math.min(
    Math.floor(frame / framesPerImage),
    images.length - 1
  );
  const nextIdx = Math.min(currentIdx + 1, images.length - 1);
  const frameInSlide = frame - currentIdx * framesPerImage;

  // Opacity of the NEXT image fading in during the last `crossfadeFrames`
  const crossfadeStart = framesPerImage - crossfadeFrames;
  const nextOpacity =
    frameInSlide >= crossfadeStart
      ? interpolate(
          frameInSlide,
          [crossfadeStart, framesPerImage],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        )
      : 0;

  // Ken Burns: subtle zoom creep on the current image
  const progress = frameInSlide / framesPerImage;
  const scale = interpolate(progress, [0, 1], [1.0, 1.03], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: "#0a0a0b", overflow: "hidden" }}>
      {/* Current slide with Ken Burns */}
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <Img
          src={images[currentIdx]}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </AbsoluteFill>

      {/* Next slide crossfading in */}
      {nextIdx !== currentIdx && (
        <AbsoluteFill style={{ opacity: nextOpacity }}>
          <Img
            src={images[nextIdx]}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
