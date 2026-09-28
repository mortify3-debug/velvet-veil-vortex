import { mkdir, rm, readdir, copyFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const music = path.join(root, 'music');
const assets = path.join(root, 'assets');

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'assets'), { recursive: true });
await mkdir(path.join(dist, 'music'), { recursive: true });

for (const f of ['index.html', 'style.css', 'app.js']) {
  await copyFile(path.join(root, f), path.join(dist, f));
}

for (const f of await readdir(assets).catch(() => [])) {
  const src = path.join(assets, f);
  const s = await stat(src).catch(() => null);
  if (s?.isFile()) await copyFile(src, path.join(dist, 'assets', f));
}

const names = await readdir(music, { withFileTypes: true }).catch(() => []);
const tracks = [];

for (const e of names) {
  if (!e.isFile() || !e.name.toLowerCase().endsWith('.mp3')) continue;
  await copyFile(path.join(music, e.name), path.join(dist, 'music', e.name));
}

await copyFile(path.join(root, 'songs.json'), path.join(dist, 'songs.json'));
await writeFile(path.join(dist, '.nojekyll'), '');
console.log('Build completed');
