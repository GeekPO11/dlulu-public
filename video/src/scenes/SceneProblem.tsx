import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {KineticWords} from '../ui/KineticWords';
import {PortalSurface} from '../portal/PortalSurface';

const GridMini: React.FC<{frame: number}> = ({frame}) => {
  const {fps} = useVideoConfig();
  const wobble = interpolate(Math.sin(frame / fps / 2.5), [-1, 1], [-2, 2]);

  return (
    <div className="relative w-[1500px] h-[520px] rounded-3xl border border-border bg-card/35 overflow-hidden">
      {/* grid */}
      <div className="absolute inset-0 grid grid-cols-7">
        {Array.from({length: 7}).map((_, i) => (
          <div key={i} className="border-l border-border/70 first:border-l-0" />
        ))}
      </div>
      <div className="absolute inset-0 grid grid-rows-6">
        {Array.from({length: 6}).map((_, i) => (
          <div key={i} className="border-t border-border/70 first:border-t-0" />
        ))}
      </div>

      {/* blocked slabs */}
      <div className="absolute left-[0%] top-[18%] w-[18%] h-[64%] rounded-2xl bg-slate-600/35 border border-slate-500/30" />
      <div className="absolute left-[20%] top-[18%] w-[18%] h-[64%] rounded-2xl bg-slate-600/35 border border-slate-500/30" />
      <div className="absolute left-[40%] top-[18%] w-[18%] h-[64%] rounded-2xl bg-slate-600/35 border border-slate-500/30" />

      {/* to-do cards collide */}
      <div
        className="absolute left-[-10%] top-[22%] w-[320px] rounded-2xl border border-border bg-card/70 px-5 py-4"
        style={{
          transform: `translateX(${interpolate(frame, [0, 26, 46, 70], [0, 760, 720, 740], {
            extrapolateRight: 'clamp',
          })}px) translateY(${wobble}px) rotate(${interpolate(frame, [0, 70], [-4, 1])}deg)`,
        }}
      >
        <div className="text-xs font-black uppercase tracking-widest text-muted-foreground/70">to-do</div>
        <div className="mt-2 text-lg font-extrabold text-foreground">Ship MVP</div>
      </div>

      <div
        className="absolute left-[-10%] top-[48%] w-[360px] rounded-2xl border border-border bg-card/70 px-5 py-4"
        style={{
          transform: `translateX(${interpolate(frame, [0, 34, 56, 78], [0, 820, 780, 800], {
            extrapolateRight: 'clamp',
          })}px) translateY(${wobble * 1.6}px) rotate(${interpolate(frame, [0, 78], [5, -2])}deg)`,
        }}
      >
        <div className="text-xs font-black uppercase tracking-widest text-muted-foreground/70">to-do</div>
        <div className="mt-2 text-lg font-extrabold text-foreground">Interview users</div>
      </div>
    </div>
  );
};

export const SceneProblem: React.FC<{startFrame: number}> = ({startFrame}) => {
  const frameAbs = useCurrentFrame();
  const frame = frameAbs - startFrame;

  const textStart = 130;

  return (
    <AbsoluteFill className="items-center justify-center px-20">
      <PortalSurface className="w-[1660px] h-[780px]">
        <div className="w-full h-full p-10 flex flex-col">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-black text-foreground tracking-tight">Reality check</div>
            <div className="px-4 py-2 rounded-full bg-card/60 border border-border text-muted-foreground text-xs font-black uppercase tracking-widest">
              constraints
            </div>
          </div>

          <div className="mt-8 flex-1 flex items-center justify-center">
            <GridMini frame={frame} />
          </div>

          <div className="mt-8">
            <KineticWords
              text="Your calendar is the constraint."
              frame={frame}
              start={textStart}
              className="text-[52px] font-extrabold tracking-tight leading-[1.05] text-foreground"
              framesPerWord={2}
            />
            <div className="mt-2 text-lg text-muted-foreground font-semibold">
              Most plans ignore it. Dlulu doesn’t.
            </div>
          </div>
        </div>
      </PortalSurface>
    </AbsoluteFill>
  );
};

