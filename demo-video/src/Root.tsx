import React from "react";
import { Composition, Series } from "remotion";
import { TitleCard } from "./TitleCard";
import { ScreenSegment } from "./ScreenSegment";
import { PresentationSlides } from "./PresentationSlides";
import { PART1_SLIDES, PART3_SLIDES, calcDuration } from "./slideList";
import { COLORS } from "./theme";

const FPS = 30;
const SEC_PER_SLIDE = 5;

// Screen recording durations (seconds)
const SEG = {
  creator:     85 * FPS,  // 1:25
  collectorLp: 55 * FPS,  // 0:55
  livingDrs:   27 * FPS,  // 0:27
  gate:        20 * FPS,  // 0:20
};

const TITLE_CARD_FRAMES = 5 * FPS;

const part1Frames = calcDuration(PART1_SLIDES, SEC_PER_SLIDE, FPS);
const part3Frames = calcDuration(PART3_SLIDES, SEC_PER_SLIDE, FPS);

const totalFrames =
  part1Frames +
  TITLE_CARD_FRAMES +                 // "Live Demo" transition
  TITLE_CARD_FRAMES + SEG.creator +   // Creator Flow
  TITLE_CARD_FRAMES + SEG.collectorLp +
  TITLE_CARD_FRAMES + SEG.livingDrs +
  TITLE_CARD_FRAMES + SEG.gate +
  part3Frames;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="VeritasDemo"
      component={VeritasDemoVideo}
      durationInFrames={Math.max(totalFrames, FPS)}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{}}
    />
  );
};

const VeritasDemoVideo: React.FC = () => {
  return (
    <Series>
      {/* PART 1: Presentation slides 1-11 */}
      {PART1_SLIDES.length > 0 && (
        <Series.Sequence durationInFrames={part1Frames}>
          <PresentationSlides images={PART1_SLIDES} secPerImage={SEC_PER_SLIDE} />
        </Series.Sequence>
      )}

      {/* Transition into live demo */}
      <Series.Sequence durationInFrames={TITLE_CARD_FRAMES}>
        <TitleCard
          title="Live Demo"
          subtitle="Four flows. On-chain. Unichain Sepolia."
        />
      </Series.Sequence>

      {/* Segment 2: Creator Flow */}
      <Series.Sequence durationInFrames={TITLE_CARD_FRAMES}>
        <TitleCard
          title="Creator Flow"
          subtitle="Verify · Attest · Mint · Register · Launch"
          stepNumber={1}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SEG.creator}>
        <ScreenSegment file="seg2-creator.mp4" label="Creator · /launch" />
      </Series.Sequence>

      {/* Segment 4: Collector + LP */}
      <Series.Sequence durationInFrames={TITLE_CARD_FRAMES}>
        <TitleCard
          title="Collector + LP"
          subtitle="Buy on curve · Provide liquidity · IL Simulator"
          accent={COLORS.accent}
          stepNumber={2}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SEG.collectorLp}>
        <ScreenSegment file="seg4-collector-lp.mp4" label="Collector + LP · /market · /pools" />
      </Series.Sequence>

      {/* Segment 6: Living DRS */}
      <Series.Sequence durationInFrames={TITLE_CARD_FRAMES}>
        <TitleCard
          title="Living DRS"
          subtitle="Reactive Network · cross-chain · no keeper"
          accent={COLORS.riskLow}
          stepNumber={3}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SEG.livingDrs}>
        <ScreenSegment file="seg6-living-drs.mp4" label="Living DRS · Reactive Lasna" />
      </Series.Sequence>

      {/* Segment 8: The Gate */}
      <Series.Sequence durationInFrames={TITLE_CARD_FRAMES}>
        <TitleCard
          title="The Gate"
          subtitle="DRS too high → blocked on-chain"
          accent={COLORS.riskHigh}
          stepNumber={4}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SEG.gate}>
        <ScreenSegment file="seg8-gate.mp4" label="DRS Gate · IPLaunchRegistry" />
      </Series.Sequence>

      {/* PART 3: Presentation slides 11-15 */}
      {PART3_SLIDES.length > 0 && (
        <Series.Sequence durationInFrames={part3Frames}>
          <PresentationSlides images={PART3_SLIDES} secPerImage={SEC_PER_SLIDE} />
        </Series.Sequence>
      )}
    </Series>
  );
};
