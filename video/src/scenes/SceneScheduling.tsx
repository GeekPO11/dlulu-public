import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {PortalSurface} from '../portal/PortalSurface';
import {CalendarWeek} from '../portal/CalendarWeek';
import {BASE_WEEK_EVENTS} from '../data/demoCalendar';

export const SceneScheduling: React.FC<{startFrame: number; durationInFrames: number}> = ({
  startFrame,
  durationInFrames,
}) => {
  const frameAbs = useCurrentFrame();
  const frame = frameAbs - startFrame;
  const {fps} = useVideoConfig();

  const revealSessionsCount = Math.max(0, Math.floor((frame - 36) / 18));

  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.06], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill className="items-center justify-center px-20">
      <PortalSurface className="w-[1660px] h-[900px] overflow-hidden">
        <div style={{transform: `scale(${zoom})`, transformOrigin: '50% 55%'}}>
          <CalendarWeek events={BASE_WEEK_EVENTS} revealSessionsCount={revealSessionsCount} />
        </div>
      </PortalSurface>
    </AbsoluteFill>
  );
};

