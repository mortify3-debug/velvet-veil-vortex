import { mkdir, rm, readdir, copyFile, writeFile, stat, cp } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const copyIfExists = async (rel) => {
  const src = path.join(root, rel);
  try {
    const s = await stat(src);
    if (s.isDirectory()) {
      await cp(src, path.join(dist, rel), { recursive: true });
    } else if (s.isFile()) {
      await mkdir(path.dirname(path.join(dist, rel)), { recursive: true });
      await copyFile(src, path.join(dist, rel));
    }
  } catch {
    // skip missing
  }
};

for (const f of [
  'index.html',
  'style.css',
  'app.js',
  'albums.json',
  'songs.json',
  '_headers',
  'site.webmanifest'
]) {
  await copyIfExists(f);
}

await copyIfExists('assets');
await copyIfExists('music');

await writeFile(path.join(dist, '.nojekyll'), '');
console.log('Build completed → dist/');
