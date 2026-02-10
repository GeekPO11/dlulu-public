import {spawn} from 'node:child_process';

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {stdio: 'inherit'});
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });

const main = async () => {
  const audio = process.argv[2] ?? 'public/assets/audio/vo.wav';
  const transcription = 'public/assets/captions/transcription.json';
  const captionsJson = 'public/assets/captions/captions.json';
  const captionsSrt = 'public/assets/captions/captions.srt';

  await run('node', ['scripts/transcribe-whisper.mjs', '--in', audio, '--out', transcription]);
  await run('node', [
    'scripts/captions-from-whisper.mjs',
    '--in',
    transcription,
    '--out-json',
    captionsJson,
    '--out-srt',
    captionsSrt,
  ]);
};

main().catch((err) => {
  console.error('[make:captions] Failed:', err);
  process.exitCode = 1;
});

