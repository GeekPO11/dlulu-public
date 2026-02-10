import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {PortalSurface} from '../portal/PortalSurface';
import {enterUp} from '../motion/primitives';

export const SceneGapCheck: React.FC<{startFrame: number; durationInFrames: number}> = ({
  startFrame,
  durationInFrames,
}) => {
  const frameAbs = useCurrentFrame();
  const frame = frameAbs - startFrame;
  const {fps} = useVideoConfig();

  const card = enterUp({frame, fps, delay: 18, duration: 18});
  const b1 = enterUp({frame, fps, delay: 42, duration: 18});
  const b2 = enterUp({frame, fps, delay: 54, duration: 18});
  const b3 = enterUp({frame, fps, delay: 66, duration: 18});

  return (
    <AbsoluteFill className="items-center justify-center px-20">
      <PortalSurface className="w-[1660px] h-[780px]">
        <div className="w-full h-full flex items-center justify-center">
          <div style={card as any} className="w-[1100px] glass-surface rounded-3xl border border-border p-10">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground/70">gap check</div>
            <div className="mt-3 text-5xl font-extrabold tracking-tight text-foreground">Feasibility in 10 seconds</div>
            <div className="mt-4 text-xl text-muted-foreground font-semibold">
              If timeline and constraints don’t match, dlulu tells you what to change.
            </div>

            <div className="mt-10 grid grid-cols-3 gap-5">
              <div style={b1 as any} className="rounded-2xl border border-border bg-card/55 p-6">
                <div className="text-xs font-black uppercase tracking-widest text-muted-foreground/70">timeline</div>
                <div className="mt-2 text-3xl font-black text-foreground">12 weeks</div>
                <div className="mt-2 text-sm text-muted-foreground font-semibold">Target deadline</div>
              </div>
              <div style={b2 as any} className="rounded-2xl border border-border bg-card/55 p-6">
                <div className="text-xs font-black uppercase tracking-widest text-muted-foreground/70">available</div>
                <div className="mt-2 text-3xl font-black text-foreground">8 hrs/week</div>
                <div className="mt-2 text-sm text-muted-foreground font-semibold">Real calendar gaps</div>
              </div>
              <div style={b3 as any} className="rounded-2xl border border-primary/30 bg-primary/10 p-6">
                <div className="text-xs font-black uppercase tracking-widest text-primary/80">suggestion</div>
                <div className="mt-2 text-3xl font-black text-foreground">Tight</div>
                <div className="mt-2 text-sm text-muted-foreground font-semibold">
                  Add 2 hrs/week or extend to 14 weeks.
                </div>
              </div>
            </div>
          </div>
        </div>
      </PortalSurface>
    </AbsoluteFill>
  );
};

