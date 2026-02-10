import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const distAssetsDir = path.resolve(__dirname, '../../dist/assets');
const outFile = path.resolve(__dirname, '../src/styles/portal.css');

const pickNewest = async (dir) => {
  const entries = await fs.readdir(dir);
  const candidates = entries
    .filter((f) => /^index-.*\.css$/i.test(f))
    .map((f) => path.join(dir, f));

  if (candidates.length === 0) return null;

  const stats = await Promise.all(
    candidates.map(async (f) => ({file: f, stat: await fs.stat(f)}))
  );

  stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return stats[0].file;
};

const main = async () => {
  const newest = await pickNewest(distAssetsDir);
  if (!newest) {
    console.error(`[sync:css] No compiled CSS found in ${distAssetsDir}`);
    process.exitCode = 1;
    return;
  }

  await fs.copyFile(newest, outFile);
  console.log(`[sync:css] Copied ${path.basename(newest)} → ${path.relative(process.cwd(), outFile)}`);
};

main().catch((err) => {
  console.error('[sync:css] Failed:', err);
  process.exitCode = 1;
});

