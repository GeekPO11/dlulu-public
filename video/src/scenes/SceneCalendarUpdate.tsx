import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {PortalSurface} from '../portal/PortalSurface';
import {CalendarWeek} from '../portal/CalendarWeek';
import {withExtraSession} from '../data/demoCalendar';

export const SceneCalendarUpdate: React.FC<{startFrame: number; durationInFrames: number}> = ({
  startFrame,
  durationInFrames,
}) => {
  const frameAbs = useCurrentFrame();
  const frame = frameAbs - startFrame;

  const title = 'Post on Product Hunt';
  const events = withExtraSession(title);

  const revealSessionsCount = frame < 60 ? 3 : 4;
  const highlightId = frame >= 60 ? 's_new' : null;

  const zoom = interpolate(frame, [0, durationInFrames], [1.02, 1.06], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill className="items-center justify-center px-20">
      <PortalSurface className="w-[1660px] h-[900px] overflow-hidden">
        <div style={{transform: `scale(${zoom})`, transformOrigin: '50% 55%'}}>
          <CalendarWeek events={events} revealSessionsCount={revealSessionsCount} highlightEventId={highlightId} />
        </div>
      </PortalSurface>
    </AbsoluteFill>
  );
};

