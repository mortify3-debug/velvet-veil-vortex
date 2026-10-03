/**
 * Сканирует music/<Альбом>/ и пишет albums.json
 * Альбомы показываются даже без MP3 (с обложкой).
 *
 * Добавить трек: положить MP3 в music/Киберпанк/ и
 *   node generate-songs.mjs
 * или просто push — CI сделает это сам.
 */
import { readdir, writeFile, mkdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const musicDir = './music';
const coversDir = './assets/covers';

await mkdir(musicDir, { recursive: true });
await mkdir(coversDir, { recursive: true });

const audioExt = /\.(mp3|m4a|ogg|wav)$/i;
const imageExt = /\.(png|jpe?g|webp)$/i;

const russianTitles = {
  dvorets: 'Дворец',
  'lift letit': 'Лифт летит',
  simulyacia: 'Симуляция',
  'vo sne ya': 'Во сне я...',
  'vo sne ya..': 'Во сне я...',
  'rekursiya mirov': 'Рекурсия миров'
};

/* newest first → oldest last */
const order = ['Рекурсия миров', 'Город света', 'Киберпанк'];

const cleanBase = name =>
  name.replace(/\.[^.]+$/, '').replace(/^\s*\d+\s*[-_.]\s*/, '').trim();

const makeTitle = name => {
  const base = cleanBase(name);
  return russianTitles[base.toLowerCase()] || base;
};

const encodePath = (...parts) =>
  parts.map(p => encodeURIComponent(p)).join('/');

const coverFiles = (await readdir(coversDir, { withFileTypes: true }))
  .filter(x => x.isFile() && imageExt.test(x.name))
  .map(x => x.name);

const coverByKey = new Map();
for (const name of coverFiles) {
  const base = name.replace(/\.[^.]+$/, '').toLowerCase();
  coverByKey.set(base, name);
  coverByKey.set(base.replace(/[\s_]+/g, '-'), name);
  coverByKey.set(base.replace(/[\s_-]+/g, ''), name);
}

const aliases = {
  киберпанк: ['cyberpunk'],
  'город света': ['gorodsveta', 'gorod-sveta', 'gorod sveta'],
  'рекурсия миров': ['rekursia-mirov', 'rekursiya-mirov', 'rekursiya mirov', 'rekursia mirov']
};

function findCover(folderName) {
  const lower = folderName.toLowerCase();
  const keys = [
    lower,
    lower.replace(/[\s_]+/g, '-'),
    lower.replace(/[\s_-]+/g, ''),
    ...(aliases[lower] || [])
  ];
  for (const k of keys) {
    if (coverByKey.has(k)) {
      const file = coverByKey.get(k);
      return `./assets/covers/${encodeURIComponent(file)}`;
    }
  }
  return './assets/cover2.jpg';
}

const entries = await readdir(musicDir, { withFileTypes: true });
let albumDirs = entries.filter(x => x.isDirectory());

albumDirs.sort((a, b) => {
  const ia = order.indexOf(a.name);
  const ib = order.indexOf(b.name);
  if (ia === -1 && ib === -1) return a.name.localeCompare(b.name, 'ru');
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
});

const albums = [];

for (const dir of albumDirs) {
  const folder = dir.name;
  const files = (await readdir(join(musicDir, folder), { withFileTypes: true }))
    .filter(x => x.isFile() && audioExt.test(x.name))
    .map(x => x.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  // Fail deployment if a discovered audio file is empty or unreadable.
  for (const name of files) {
    const filePath = join(musicDir, folder, name);
    const info = await stat(filePath);
    if (!info.isFile() || info.size === 0) {
      throw new Error(`Invalid or empty audio file: ${filePath}`);
    }
  }
  if (files.length === 0) {
    console.warn(`WARNING: album folder has no audio files: music/${folder}`);
  }

  albums.push({
    id: folder.toLowerCase().replace(/\s+/g, '-'),
    title: folder,
    cover: findCover(folder),
    year: '',
    folder,
    tracks: files.map(name => ({
      title: makeTitle(name),
      src: `./music/${encodePath(folder, name)}`
    }))
  });
}

const flat = albums.flatMap(a =>
  a.tracks.map(t => ({
    title: t.title,
    src: t.src,
    cover: a.cover,
    album: a.title
  }))
);

/* Do not wipe a working catalog if CI scanned zero audio files
   (missing LFS pull, empty placeholders, wrong paths). */
if (flat.length === 0) {
  try {
    const prev = JSON.parse(await readFile('./albums.json', 'utf8'));
    const prevTracks = Array.isArray(prev)
      ? prev.reduce((n, a) => n + ((a.tracks && a.tracks.length) || 0), 0)
      : 0;
    if (prevTracks > 0) {
      console.warn(
        `WARNING: scanner found 0 audio files, but albums.json already has ${prevTracks} track(s). Keeping existing catalog.`
      );
      console.log('albums.json: kept existing');
      process.exit(0);
    }
  } catch {
    /* no previous catalog — write empty */
  }
}

await writeFile('./albums.json', JSON.stringify(albums, null, 2) + '\n');
await writeFile('./songs.json', JSON.stringify(flat, null, 2) + '\n');

console.log(`albums.json: ${albums.length} album(s)`);
console.log(`songs.json: ${flat.length} track(s)`);
for (const a of albums) {
  console.log(`  - ${a.title}: ${a.tracks.length} track(s), cover=${a.cover}`);
}
