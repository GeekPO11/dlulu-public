import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {PortalSurface} from '../portal/PortalSurface';
import {ChatPanel} from '../portal/ChatPanel';
import {RoadmapPanel} from '../portal/RoadmapPanel';
import {CHAT_SEQUENCE} from '../data/demoChat';
import {withInsertedLaunchTask} from '../data/demoRoadmap';
import {enterUp} from '../motion/primitives';

export const SceneChatbot: React.FC<{startFrame: number; durationInFrames: number}> = ({
  startFrame,
  durationInFrames,
}) => {
  const frameAbs = useCurrentFrame();
  const frame = frameAbs - startFrame;
  const {fps} = useVideoConfig();

  const insertAt = 210;
  const insertedTitle = 'Post on Product Hunt';
  const roadmap = frame >= insertAt ? withInsertedLaunchTask(insertedTitle) : withInsertedLaunchTask(null);

  // For roadmap reveal, show everything in this scene.
  const revealCount = 999;

  const hlOpacity = interpolate(frame, [insertAt, insertAt + 16, insertAt + 120], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const header = enterUp({frame, fps, delay: 20, duration: 18});

  return (
    <AbsoluteFill className="items-center justify-center px-20">
      <PortalSurface className="w-[1660px] h-[900px] overflow-hidden relative">
        <div className="absolute inset-0 p-8">
          <div style={header as any} className="flex items-center justify-between mb-6">
            <div className="text-3xl font-black tracking-tight text-foreground">Ask the chatbot</div>
            <div className="px-4 py-2 rounded-full bg-card/60 border border-border text-muted-foreground text-xs font-black uppercase tracking-widest">
              deterministic UI
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 h-[780px]">
            <div className="glass-surface rounded-3xl border border-border overflow-hidden">
              <ChatPanel messages={CHAT_SEQUENCE} showTypingFrom={120} showTypingTo={150} />
            </div>

            <div className="glass-surface rounded-3xl border border-border overflow-hidden relative">
              <RoadmapPanel
                roadmap={roadmap}
                revealCount={revealCount}
                highlightNewTaskTitle={frame >= insertAt ? insertedTitle : null}
              />

              {/* insertion highlight sweep */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  opacity: hlOpacity,
                  background:
                    'radial-gradient(700px 260px at 70% 70%, rgba(249,115,22,0.18), transparent 60%)',
                }}
              />
            </div>
          </div>
        </div>
      </PortalSurface>
    </AbsoluteFill>
  );
};
