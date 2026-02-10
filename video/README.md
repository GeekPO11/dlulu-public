# Dlulu Remotion Video

This folder contains the Remotion project for the **Dlulu Demo Video v2** (2:30, 1080p, 30fps).

## Quick Start

1. Install deps:

```bash
cd video
npm install
```

2. Open Remotion Studio:

```bash
npm run studio
```

3. Render (requires `ffmpeg` on your machine):

```bash
cd video
npm run render
```

Output: `../dlulu-demo-2m30s-1080p.mp4`

## Assets

Put your audio in:
- `video/public/assets/audio/vo.wav` (or `.mp3`)
- `video/public/assets/audio/music.wav` (or `.mp3`)

Then pass input props when rendering (example):

```bash
remotion render src/index.ts DluluDemoV2 out.mp4 --props='{"voSrc":"assets/audio/vo.wav","musicSrc":"assets/audio/music.wav","captionsSrc":"assets/captions/captions.json"}'
```

## Captions (Whisper STT)

1. Transcribe:

```bash
cd video
OPENAI_API_KEY=... node scripts/transcribe-whisper.mjs --in public/assets/audio/vo.wav --out public/assets/captions/transcription.json
```

2. Generate captions:

```bash
cd video
node scripts/captions-from-whisper.mjs --in public/assets/captions/transcription.json --out-json public/assets/captions/captions.json --out-srt public/assets/captions/captions.srt
```

## Keeping Portal CSS In Sync

`src/styles/portal.css` is a snapshot of the **compiled** app CSS from `../dist/assets/index-*.css`.

After changing app styles, rebuild the app CSS and sync:

```bash
cd ..
npm run build
cd video
npm run sync:css
```

