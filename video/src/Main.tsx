import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {SCENES} from './scene-spec';
import {Background} from './ui/Background';
import {fadeInOut} from './motion/primitives';
import {Captions} from './captions/Captions';

import './styles/portal.css';
import './styles/video.css';

import {SceneHook} from './scenes/SceneHook';
import {SceneProblem} from './scenes/SceneProblem';
import {SceneIntro} from './scenes/SceneIntro';
import {SceneRoadmapCompile} from './scenes/SceneRoadmapCompile';
import {SceneGapCheck} from './scenes/SceneGapCheck';
import {SceneScheduling} from './scenes/SceneScheduling';
import {SceneChatbot} from './scenes/SceneChatbot';
import {SceneCalendarUpdate} from './scenes/SceneCalendarUpdate';
import {SceneGovernance} from './scenes/SceneGovernance';
import {SceneClose} from './scenes/SceneClose';

export type DluluDemoV2Props = {
  /**
   * Paths are relative to `video/public/`.
   * Example: "assets/audio/vo.wav"
   */
  voSrc: string | null;
  musicSrc: string | null;
  /**
   * Captions JSON path relative to `video/public/`.
   * Example: "assets/captions/captions.json"
   */
  captionsSrc: string | null;
};

const SceneWrapper: React.FC<{
  from: number;
  durationInFrames: number;
  children: React.ReactNode;
}> = ({from, durationInFrames, children}) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  const styles = fadeInOut({frame: local, durationInFrames});
  return (
    <div style={{...styles, width: '100%', height: '100%'}}>
      {children}
    </div>
  );
};

export const DluluDemoV2: React.FC<DluluDemoV2Props> = ({voSrc, musicSrc, captionsSrc}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  return (
    <AbsoluteFill className="dlulu-video-root dark" data-theme="dark">
      <Background />

      {musicSrc ? (
        <Audio src={staticFile(musicSrc)} volume={0.14} />
      ) : null}

      {voSrc ? (
        <Audio src={staticFile(voSrc)} volume={1} />
      ) : null}

      <Sequence from={SCENES[0].from} durationInFrames={SCENES[0].durationInFrames}>
        <SceneWrapper from={SCENES[0].from} durationInFrames={SCENES[0].durationInFrames}>
          <SceneHook startFrame={SCENES[0].from} />
        </SceneWrapper>
      </Sequence>

      <Sequence from={SCENES[1].from} durationInFrames={SCENES[1].durationInFrames}>
        <SceneWrapper from={SCENES[1].from} durationInFrames={SCENES[1].durationInFrames}>
          <SceneProblem startFrame={SCENES[1].from} />
        </SceneWrapper>
      </Sequence>

      <Sequence from={SCENES[2].from} durationInFrames={SCENES[2].durationInFrames}>
        <SceneWrapper from={SCENES[2].from} durationInFrames={SCENES[2].durationInFrames}>
          <SceneIntro startFrame={SCENES[2].from} />
        </SceneWrapper>
      </Sequence>

      <Sequence from={SCENES[3].from} durationInFrames={SCENES[3].durationInFrames}>
        <SceneWrapper from={SCENES[3].from} durationInFrames={SCENES[3].durationInFrames}>
          <SceneRoadmapCompile startFrame={SCENES[3].from} durationInFrames={SCENES[3].durationInFrames} />
        </SceneWrapper>
      </Sequence>

      <Sequence from={SCENES[4].from} durationInFrames={SCENES[4].durationInFrames}>
        <SceneWrapper from={SCENES[4].from} durationInFrames={SCENES[4].durationInFrames}>
          <SceneGapCheck startFrame={SCENES[4].from} durationInFrames={SCENES[4].durationInFrames} />
        </SceneWrapper>
      </Sequence>

      <Sequence from={SCENES[5].from} durationInFrames={SCENES[5].durationInFrames}>
        <SceneWrapper from={SCENES[5].from} durationInFrames={SCENES[5].durationInFrames}>
          <SceneScheduling startFrame={SCENES[5].from} durationInFrames={SCENES[5].durationInFrames} />
        </SceneWrapper>
      </Sequence>

      <Sequence from={SCENES[6].from} durationInFrames={SCENES[6].durationInFrames}>
        <SceneWrapper from={SCENES[6].from} durationInFrames={SCENES[6].durationInFrames}>
          <SceneChatbot startFrame={SCENES[6].from} durationInFrames={SCENES[6].durationInFrames} />
        </SceneWrapper>
      </Sequence>

      <Sequence from={SCENES[7].from} durationInFrames={SCENES[7].durationInFrames}>
        <SceneWrapper from={SCENES[7].from} durationInFrames={SCENES[7].durationInFrames}>
          <SceneCalendarUpdate startFrame={SCENES[7].from} durationInFrames={SCENES[7].durationInFrames} />
        </SceneWrapper>
      </Sequence>

      <Sequence from={SCENES[8].from} durationInFrames={SCENES[8].durationInFrames}>
        <SceneWrapper from={SCENES[8].from} durationInFrames={SCENES[8].durationInFrames}>
          <SceneGovernance startFrame={SCENES[8].from} durationInFrames={SCENES[8].durationInFrames} />
        </SceneWrapper>
      </Sequence>

      <Sequence from={SCENES[9].from} durationInFrames={SCENES[9].durationInFrames}>
        <SceneWrapper from={SCENES[9].from} durationInFrames={SCENES[9].durationInFrames}>
          <SceneClose startFrame={SCENES[9].from} />
        </SceneWrapper>
      </Sequence>

      {captionsSrc ? <Captions captionsSrc={captionsSrc} /> : null}

      {/* Small debug watermark (hidden in final render by setting opacity to 0) */}
      <AbsoluteFill className="pointer-events-none items-end justify-end p-6">
        <div
          style={{
            fontSize: 14,
            opacity: 0,
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          {Math.round((frame / fps) * 10) / 10}s
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
