export type CaptionCue = {
  startMs: number;
  endMs: number;
  text: string;
};

export type CaptionsFileV1 = {
  version: 1;
  cues: CaptionCue[];
};

