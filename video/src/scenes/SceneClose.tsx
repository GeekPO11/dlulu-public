import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {enterUp} from '../motion/primitives';

export const SceneClose: React.FC<{startFrame: number}> = ({startFrame}) => {
  const frameAbs = useCurrentFrame();
  const frame = frameAbs - startFrame;
  const {fps} = useVideoConfig();

  const l = enterUp({frame, fps, delay: 10, duration: 22, y: 12, blur: 10, scaleFrom: 0.97});
  const t1 = enterUp({frame, fps, delay: 32, duration: 18});
  const t2 = enterUp({frame, fps, delay: 50, duration: 18});

  return (
    <AbsoluteFill className="items-center justify-center px-24">
      <div className="text-center max-w-[1200px]">
        <div style={l as any} className="mx-auto w-[240px]">
          <Img src={staticFile('assets/branding/logoFinal.png')} />
        </div>
        <div style={t1 as any} className="mt-10 text-[72px] font-extrabold tracking-tighter leading-[1.02] text-foreground">
          Turn <span className="text-gradient">Delusion</span> into Execution
        </div>
        <div style={t2 as any} className="mt-6 text-2xl text-muted-foreground font-semibold">
          dlulu.life
        </div>
      </div>
    </AbsoluteFill>
  );
};

