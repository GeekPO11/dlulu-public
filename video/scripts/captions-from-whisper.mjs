import fs from 'node:fs/promises';
import path from 'node:path';

const arg = (name) => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
};

const input = arg('--in') ?? arg('-i');
const outJson = arg('--out-json') ?? 'public/assets/captions/captions.json';
const outSrt = arg('--out-srt') ?? 'public/assets/captions/captions.srt';

if (!input) {
  console.error(
    'Usage: node scripts/captions-from-whisper.mjs --in <transcription.json> [--out-json <captions.json>] [--out-srt <captions.srt>]'
  );
  process.exit(1);
}

const normalize = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const toMs = (seconds) => Math.max(0, Math.round(Number(seconds) * 1000));

const pad2 = (n) => String(n).padStart(2, '0');
const pad3 = (n) => String(n).padStart(3, '0');
const toSrtTime = (ms) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mm = Math.floor(ms % 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(mm)}`;
};

const main = async () => {
  const inPath = path.resolve(process.cwd(), input);
  const jsonPath = path.resolve(process.cwd(), outJson);
  const srtPath = path.resolve(process.cwd(), outSrt);
  await fs.mkdir(path.dirname(jsonPath), {recursive: true});
  await fs.mkdir(path.dirname(srtPath), {recursive: true});

  const raw = JSON.parse(await fs.readFile(inPath, 'utf8'));
  const segments = Array.isArray(raw?.segments) ? raw.segments : [];

  // Cue constraints: ~2 lines, readable and stable.
  const MAX_CUE_MS = 3200;
  const MAX_CHARS = 86; // roughly 2 lines * ~43 chars

  const cues = [];
  let cueStart = null;
  let cueEnd = null;
  let cueText = '';

  const flush = () => {
    if (cueStart === null) return;
    const startMs = toMs(cueStart);
    const endMs = Math.max(startMs + 200, toMs(cueEnd ?? cueStart));
    const text = normalize(cueText);
    if (text) cues.push({startMs, endMs, text});
    cueStart = null;
    cueEnd = null;
    cueText = '';
  };

  for (const seg of segments) {
    const text = normalize(seg?.text);
    if (!text) continue;
    const s = Number(seg?.start ?? 0);
    const e = Number(seg?.end ?? s);

    if (cueStart === null) {
      cueStart = s;
      cueEnd = e;
      cueText = text;
      continue;
    }

    const nextText = `${cueText} ${text}`.trim();
    const nextMs = toMs(e - cueStart);
    if (nextText.length > MAX_CHARS || nextMs > MAX_CUE_MS) {
      flush();
      cueStart = s;
      cueEnd = e;
      cueText = text;
      continue;
    }

    cueEnd = e;
    cueText = nextText;
  }
  flush();

  const captionsJson = {version: 1, cues};
  await fs.writeFile(jsonPath, JSON.stringify(captionsJson, null, 2), 'utf8');
  console.log(`[captions] Wrote ${path.relative(process.cwd(), jsonPath)}`);

  const srt = cues
    .map((c, idx) => {
      return [
        String(idx + 1),
        `${toSrtTime(c.startMs)} --> ${toSrtTime(c.endMs)}`,
        c.text,
        '',
      ].join('\n');
    })
    .join('\n');

  await fs.writeFile(srtPath, srt, 'utf8');
  console.log(`[captions] Wrote ${path.relative(process.cwd(), srtPath)}`);
};

main().catch((err) => {
  console.error('[captions] Error:', err);
  process.exitCode = 1;
});

