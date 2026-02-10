import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {PortalSurface} from '../portal/PortalSurface';
import {enterUp} from '../motion/primitives';

const Bullet: React.FC<{title: string; detail: string; style: React.CSSProperties}> = ({
  title,
  detail,
  style,
}) => (
  <div style={style} className="rounded-2xl border border-border bg-card/55 p-6">
    <div className="text-xs font-black uppercase tracking-widest text-primary/80">{title}</div>
    <div className="mt-3 text-lg text-muted-foreground font-semibold">{detail}</div>
  </div>
);

export const SceneGovernance: React.FC<{startFrame: number; durationInFrames: number}> = ({
  startFrame,
  durationInFrames,
}) => {
  const frameAbs = useCurrentFrame();
  const frame = frameAbs - startFrame;
  const {fps} = useVideoConfig();

  const h = enterUp({frame, fps, delay: 18, duration: 18});
  const b1 = enterUp({frame, fps, delay: 44, duration: 18});
  const b2 = enterUp({frame, fps, delay: 56, duration: 18});
  const b3 = enterUp({frame, fps, delay: 68, duration: 18});
  const code = enterUp({frame, fps, delay: 90, duration: 18});

  return (
    <AbsoluteFill className="items-center justify-center px-20">
      <PortalSurface className="w-[1660px] h-[780px] overflow-hidden relative">
        <div className="w-full h-full p-10">
          <div style={h as any}>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground/70">
              governance
            </div>
            <div className="mt-3 text-6xl font-extrabold tracking-tight text-foreground">
              Guardrails, not vibes
            </div>
            <div className="mt-4 text-xl text-muted-foreground font-semibold">
              AI creativity with system-level safety.
            </div>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-5">
            <Bullet
              title="Redacted logs"
              detail="Sensitive data is scrubbed before it ships."
              style={b1 as any}
            />
            <Bullet
              title="Structured outputs"
              detail="Outputs stay machine-checkable and consistent."
              style={b2 as any}
            />
            <Bullet
              title="Confirmation gates"
              detail="High-impact actions can require explicit approval."
              style={b3 as any}
            />
          </div>

          <div style={code as any} className="mt-8 rounded-2xl border border-border bg-background/40 p-6">
            <div className="text-xs font-black uppercase tracking-widest text-muted-foreground/70">
              example
            </div>
            <pre className="mt-3 text-sm leading-relaxed text-foreground font-mono whitespace-pre-wrap">
{`logger.info("Created goal", {
  email: "[REDACTED_EMAIL]",
  token: "[REDACTED_TOKEN]",
  prompt: "[REDACTED]"
});`}
            </pre>
          </div>
        </div>
      </PortalSurface>
    </AbsoluteFill>
  );
};

