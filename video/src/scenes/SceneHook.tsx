import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {KineticWords} from '../ui/KineticWords';

export const SceneHook: React.FC<{startFrame: number}> = ({startFrame}) => {
  const frameAbs = useCurrentFrame();
  const frame = frameAbs - startFrame;
  const {fps} = useVideoConfig();

  const line2Start = 72;
  const line1Opacity = interpolate(frame, [line2Start - 10, line2Start + 18], [1, 0.18], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const line1Y = interpolate(frame, [line2Start - 10, line2Start + 18], [0, -22], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill className="items-center justify-center px-24">
      <div className="max-w-[1500px] w-full">
        <div style={{opacity: line1Opacity, transform: `translateY(${line1Y}px)`}}>
          <KineticWords
            text="Ambition is easy."
            frame={frame}
            start={0}
            className="text-[92px] font-extrabold tracking-tighter leading-[1.02] text-foreground"
          />
        </div>

        <div className="mt-6">
          <KineticWords
            text="Execution is hard."
            frame={frame}
            start={line2Start}
            className="text-[92px] font-extrabold tracking-tighter leading-[1.02] text-foreground"
          />
        </div>

        <div className="mt-10 text-muted-foreground text-xl font-semibold tracking-tight">
          <span className="text-primary font-black">dlulu</span> turns your goal into a schedule.
        </div>
      </div>
    </AbsoluteFill>
  );
};

