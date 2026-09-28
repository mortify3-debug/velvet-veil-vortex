import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const musicDir = path.join(root, 'music');
const entries = await readdir(musicDir, { withFileTypes: true }).catch(() => []);
const tracks = [];

for (const entry of entries) {
  if (!entry.isFile() || !/\.mp3$/i.test(entry.name)) continue;
  const full = path.join(musicDir, entry.name);
  const info = await stat(full);
  tracks.push({
    file: entry.name,
    url: './music/' + encodeURIComponent(entry.name),
    title: entry.name.replace(/\.mp3$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(),
    size: (info.size / 1048576).toFixed(1) + ' MB'
  });
}

tracks.sort((a,b) => b.file.localeCompare(a.file, undefined, {numeric:true, sensitivity:'base'}));
await writeFile(path.join(root, 'songs.json'), JSON.stringify(tracks, null, 2) + '\n');
console.log(`Generated songs.json with ${tracks.length} MP3 file(s).`);
