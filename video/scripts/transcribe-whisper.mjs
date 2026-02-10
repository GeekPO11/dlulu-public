import fs from 'node:fs/promises';
import path from 'node:path';

const arg = (name) => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
};

const input = arg('--in') ?? arg('-i');
const out = arg('--out') ?? 'public/assets/captions/transcription.json';
const model = arg('--model') ?? 'whisper-1';
const language = arg('--language') ?? 'en';

if (!input) {
  console.error('Usage: node scripts/transcribe-whisper.mjs --in <audio-file> [--out <json-file>]');
  process.exit(1);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Missing OPENAI_API_KEY env var.');
  process.exit(1);
}

const guessMime = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.mp4') return 'video/mp4';
  return 'application/octet-stream';
};

const main = async () => {
  const inPath = path.resolve(process.cwd(), input);
  const outPath = path.resolve(process.cwd(), out);
  await fs.mkdir(path.dirname(outPath), {recursive: true});

  const buf = await fs.readFile(inPath);
  const mime = guessMime(inPath);
  const filename = path.basename(inPath);

  // Node 18+ provides File/Blob/FormData globally.
  const file = new File([buf], filename, {type: mime});
  const form = new FormData();
  form.set('model', model);
  form.set('language', language);
  form.set('response_format', 'verbose_json');
  form.set('file', file);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Transcription failed: ${res.status} ${res.statusText}\n${body}`);
  }

  const json = await res.json();
  await fs.writeFile(outPath, JSON.stringify(json, null, 2), 'utf8');
  console.log(`[whisper] Wrote ${path.relative(process.cwd(), outPath)}`);
};

main().catch((err) => {
  console.error('[whisper] Error:', err);
  process.exitCode = 1;
});

