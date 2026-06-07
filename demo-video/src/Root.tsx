import React from "react";
import {Composition, Series} from "remotion";
import {Intro} from "./Intro";
import {Architecture} from "./Architecture";
import {TitleCard} from "./TitleCard";
import {ScreenSegment} from "./ScreenSegment";
import {Closing} from "./Closing";
import {COLORS} from "./theme";

const FPS = 30;

// Screen recording durations (frames). Adjust when you have real recordings.
// Replace placeholder values with: Math.round(durationSeconds * FPS)
const SEG = {
  creator: 85 * FPS,       // ~85s
  collectorLp: 55 * FPS,   // ~55s
  livingDrs: 27 * FPS,     // ~27s
  gate: 20 * FPS,          // ~20s
};

/**
 * VeritasDemo — full 5-minute video
 *
 * To build:
 *   1. Record each screen segment with OBS:
 *      - seg2-creator.mp4        (~1:25)
 *      - seg4-collector-lp.mp4   (~0:55)
 *      - seg6-living-drs.mp4     (~0:27)
 *      - seg8-gate.mp4           (~0:20)
 *   2. Drop them into demo-video/public/
 *   3. Run: npx remotion render src/index.ts VeritasDemo out/veritas-demo.mp4
 */
export const RemotionRoot: React.FC = () => {
  const totalFrames =
    32 * FPS + // Intro
    25 * FPS + // Architecture
    8 * FPS +  // TitleCard: Creator
    SEG.creator +
    8 * FPS +  // TitleCard: Collector + LP
    SEG.collectorLp +
    8 * FPS +  // TitleCard: Living DRS
    SEG.livingDrs +
    8 * FPS +  // TitleCard: The Gate
    SEG.gate +
    30 * FPS;  // Closing

  return (
    <>
      {/* Full 5-min demo */}
      <Composition
        id="VeritasDemo"
        component={VeritasDemoVideo}
        durationInFrames={totalFrames}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{}}
      />

      {/* Standalone intro only — useful for GIF / thumbnail */}
      <Composition
        id="VeritasIntro"
        component={Intro}
        durationInFrames={32 * FPS}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{}}
      />

      {/* Architecture diagram only */}
      <Composition
        id="VeritasArchitecture"
        component={Architecture}
        durationInFrames={25 * FPS}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};

const VeritasDemoVideo: React.FC = () => {
  return (
    <Series>
      {/* Remotion animated segments */}
      <Series.Sequence durationInFrames={32 * 30}>
        <Intro />
      </Series.Sequence>

      <Series.Sequence durationInFrames={25 * 30}>
        <Architecture />
      </Series.Sequence>

      <Series.Sequence durationInFrames={8 * 30}>
        <TitleCard
          title="Creator Flow"
          subtitle="Verify · Attest · Mint · Register · Launch"
          stepNumber={1}
        />
      </Series.Sequence>

      {/* Screen recording: Creator flow */}
      <Series.Sequence durationInFrames={SEG.creator}>
        <ScreenSegment file="seg2-creator.mp4" label="Creator · /launch" />
      </Series.Sequence>

      <Series.Sequence durationInFrames={8 * 30}>
        <TitleCard
          title="Collector + LP"
          subtitle="Buy on curve · Provide liquidity · IL Simulator"
          accent={COLORS.accent}
          stepNumber={2}
        />
      </Series.Sequence>

      {/* Screen recording: Collector + LP */}
      <Series.Sequence durationInFrames={SEG.collectorLp}>
        <ScreenSegment file="seg4-collector-lp.mp4" label="Collector + LP · /market · /pools" />
      </Series.Sequence>

      <Series.Sequence durationInFrames={8 * 30}>
        <TitleCard
          title="Living DRS"
          subtitle="Reactive Network · cross-chain · no keeper"
          accent={COLORS.riskLow}
          stepNumber={3}
        />
      </Series.Sequence>

      {/* Screen recording: Living DRS */}
      <Series.Sequence durationInFrames={SEG.livingDrs}>
        <ScreenSegment file="seg6-living-drs.mp4" label="Living DRS · Reactive Lasna" />
      </Series.Sequence>

      <Series.Sequence durationInFrames={8 * 30}>
        <TitleCard
          title="The Gate"
          subtitle="DRS too high → blocked on-chain"
          accent={COLORS.riskHigh}
          stepNumber={4}
        />
      </Series.Sequence>

      {/* Screen recording: Gate demo */}
      <Series.Sequence durationInFrames={SEG.gate}>
        <ScreenSegment file="seg8-gate.mp4" label="DRS Gate · IPLaunchRegistry" />
      </Series.Sequence>

      {/* Closing */}
      <Series.Sequence durationInFrames={30 * 30}>
        <Closing />
      </Series.Sequence>
    </Series>
  );
};
