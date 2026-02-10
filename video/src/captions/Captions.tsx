import React, {useEffect, useMemo, useState} from 'react';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {CaptionsFileV1, CaptionCue} from './types';

const findCue = (cues: CaptionCue[], tMs: number): CaptionCue | null => {
  // Cues are expected to be time-sorted.
  for (let i = cues.length - 1; i >= 0; i--) {
    const c = cues[i];
    if (tMs >= c.startMs && tMs < c.endMs) return c;
  }
  return null;
};

const wrapTwoLines = (text: string, maxCharsPerLine = 44): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length <= maxCharsPerLine || current.length === 0) {
      current = next;
      continue;
    }
    lines.push(current);
    current = w;
    if (lines.length === 2) break;
  }
  if (lines.length < 2 && current) lines.push(current);
  return lines.slice(0, 2);
};

export const Captions: React.FC<{captionsSrc: string}> = ({captionsSrc}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const [file, setFile] = useState<CaptionsFileV1 | null>(null);

  const handle = useMemo(() => delayRender('loading captions'), []);

  useEffect(() => {
    let mounted = true;
    const url = staticFile(captionsSrc);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load captions: ${r.status}`);
        return r.json();
      })
      .then((json: CaptionsFileV1) => {
        if (!mounted) return;
        setFile(json);
        continueRender(handle);
      })
      .catch(() => {
        // Fail open: no captions.
        if (!mounted) return;
        setFile(null);
        continueRender(handle);
      });

    return () => {
      mounted = false;
    };
  }, [captionsSrc, handle]);

  if (!file?.cues?.length) return null;

  const tMs = (frame / fps) * 1000;
  const cue = findCue(file.cues, tMs);
  if (!cue) return null;
  const lines = wrapTwoLines(cue.text);

  return (
    <AbsoluteFill className="pointer-events-none items-center justify-end pb-16">
      <div className="dlulu-caption px-8">
        <div className="text-center text-[44px] font-extrabold leading-[1.12] text-foreground">
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

