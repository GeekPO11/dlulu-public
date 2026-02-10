import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const driftX = interpolate(Math.sin(frame / fps / 5), [-1, 1], [-18, 18]);
  const driftY = interpolate(Math.cos(frame / fps / 6), [-1, 1], [-12, 12]);

  return (
    <AbsoluteFill className="dlulu-bg">
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${driftX}px, ${driftY}px)`,
          background:
            'radial-gradient(800px 600px at 40% 40%, rgba(255,255,255,0.06), transparent 60%)',
          opacity: 0.9,
        }}
      />
      <div className="dlulu-grain" />
    </AbsoluteFill>
  );
};

