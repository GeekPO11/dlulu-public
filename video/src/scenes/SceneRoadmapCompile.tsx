import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {PortalSurface} from '../portal/PortalSurface';
import {RoadmapPanel} from '../portal/RoadmapPanel';
import {BASE_ROADMAP} from '../data/demoRoadmap';
import {enterUp} from '../motion/primitives';

export const SceneRoadmapCompile: React.FC<{startFrame: number; durationInFrames: number}> = ({
  startFrame,
  durationInFrames,
}) => {
  const frameAbs = useCurrentFrame();
  const frame = frameAbs - startFrame;
  const {fps} = useVideoConfig();

  const revealStart = 24;
  const revealCount = Math.max(0, Math.floor((frame - revealStart) / 10));

  const badgeStart = 620;
  const showBadge = frame >= badgeStart && frame < badgeStart + 110;
  const badgeStyle = enterUp({frame: frame - badgeStart, fps, delay: 0, duration: 18, y: 10, blur: 8});

  return (
    <AbsoluteFill className="items-center justify-center px-20">
      <PortalSurface className="w-[1660px] h-[860px] overflow-hidden relative">
        <RoadmapPanel roadmap={BASE_ROADMAP} revealCount={revealCount} />

        {showBadge ? (
          <div
            className="absolute right-10 top-10 px-5 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-black uppercase tracking-widest text-xs"
            style={badgeStyle as any}
          >
            Strict schema validated
          </div>
        ) : null}

        <div className="absolute left-10 top-10 px-5 py-3 rounded-2xl bg-card/60 border border-border text-muted-foreground font-black uppercase tracking-widest text-xs">
          compile → roadmap
        </div>
      </PortalSurface>
    </AbsoluteFill>
  );
};

