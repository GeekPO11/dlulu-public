import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {enterUp} from '../motion/primitives';
import {PortalSurface} from '../portal/PortalSurface';

export const SceneIntro: React.FC<{startFrame: number}> = ({startFrame}) => {
  const frameAbs = useCurrentFrame();
  const frame = frameAbs - startFrame;
  const {fps} = useVideoConfig();

  const logoStyle = enterUp({frame, fps, delay: 10, duration: 22, y: 18, blur: 10, scaleFrom: 0.96});
  const t1 = enterUp({frame, fps, delay: 26, duration: 18});
  const t2 = enterUp({frame, fps, delay: 44, duration: 18});

  return (
    <AbsoluteFill className="items-center justify-center px-24">
      <PortalSurface className="w-[1660px] h-[780px]">
        <div className="w-full h-full flex items-center justify-center">
          <div className="max-w-[1100px] text-center">
            <div style={logoStyle as any} className="mx-auto w-[260px]">
              <Img src={staticFile('assets/branding/logoFinal.png')} />
            </div>

            <div style={t1 as any} className="mt-10 text-[78px] font-extrabold tracking-tighter leading-[1.02] text-foreground">
              Turn <span className="text-gradient">Delusion</span> into Execution
            </div>

            <div style={t2 as any} className="mt-6 text-2xl text-muted-foreground font-semibold">
              AI-powered ambition engine. Powered by <span className="text-primary font-black">Gemini 3</span>.
            </div>

            <div className="mt-10 flex items-center justify-center gap-3">
              <div className="px-5 py-3 rounded-full bg-primary/15 border border-primary/25 text-primary font-black uppercase tracking-widest text-xs">
                roadmap
              </div>
              <div className="px-5 py-3 rounded-full bg-primary/15 border border-primary/25 text-primary font-black uppercase tracking-widest text-xs">
                schedule
              </div>
              <div className="px-5 py-3 rounded-full bg-primary/15 border border-primary/25 text-primary font-black uppercase tracking-widest text-xs">
                chatbot
              </div>
              <div className="px-5 py-3 rounded-full bg-card/60 border border-border text-muted-foreground font-black uppercase tracking-widest text-xs">
                guardrails
              </div>
            </div>
          </div>
        </div>
      </PortalSurface>
    </AbsoluteFill>
  );
};

