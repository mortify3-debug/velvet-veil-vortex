import { readdir, mkdir, copyFile, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const musicDir = path.join(root, 'music');
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'assets'), { recursive: true });
await mkdir(path.join(dist, 'music'), { recursive: true });

for (const file of ['index.html', 'style.css', 'app.js']) {
  await copyFile(path.join(root, file), path.join(dist, file));
}
await copyFile(path.join(root, 'assets', 'cover.png'), path.join(dist, 'assets', 'cover.png'));

let files = [];
try { files = await readdir(musicDir, { withFileTypes: true }); } catch {}
const tracks = [];
for (const entry of files) {
  if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.mp3')) continue;
  const src = path.join(musicDir, entry.name);
  const dst = path.join(dist, 'music', entry.name);
  await copyFile(src, dst);
  const info = await stat(src);
  tracks.push({
    file: entry.name,
    url: `music/${encodeURIComponent(entry.name)}`,
    title: entry.name.replace(/\.mp3$/i, '').replace(/[_-]+/g, ' ').trim(),
    size: `${(info.size / 1048576).toFixed(1)} MB`
  });
}
tracks.sort((a, b) => b.file.localeCompare(a.file, undefined, { numeric: true, sensitivity: 'base' }));
await writeFile(path.join(dist, 'songs.json'), JSON.stringify(tracks, null, 2));
await writeFile(path.join(dist, '.nojekyll'), '');
console.log(`Built ${tracks.length} track(s).`);
