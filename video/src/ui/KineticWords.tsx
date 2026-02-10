import React from 'react';
import {useVideoConfig} from 'remotion';
import {enterUp, staggerDelay} from '../motion/primitives';

export const KineticWords: React.FC<{
  text: string;
  frame: number;
  start?: number;
  className?: string;
  wordGapClassName?: string;
  framesPerWord?: number;
}> = ({text, frame, start = 0, className, wordGapClassName, framesPerWord = 3}) => {
  const {fps} = useVideoConfig();
  const words = text.split(/\s+/).filter(Boolean);

  return (
    <div className={className}>
      {words.map((w, i) => {
        const style = enterUp({
          frame,
          fps,
          delay: start + staggerDelay(i, framesPerWord),
          duration: 16,
          y: 18,
          blur: 12,
          scaleFrom: 0.98,
        });
        return (
          <span key={`${w}-${i}`} style={style} className={wordGapClassName}>
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </div>
  );
};

