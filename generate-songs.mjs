/**
 * Сканирует music/<Альбом>/*.mp3 и собирает albums.json
 *
 * Как добавить трек:
 *   1. Создайте папку music/НазваниеАльбома (если ещё нет)
 *   2. Положите туда MP3
 *   3. Обложку положите в assets/covers/ (имя файла ≈ имя папки)
 *   4. Запустите: node generate-songs.mjs
 */
import { readdir, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';

const musicDir = './music';
const coversDir = './assets/covers';

await mkdir(musicDir, { recursive: true });
await mkdir(coversDir, { recursive: true });

const audioExt = /\.(mp3|m4a|ogg|wav)$/i;
const imageExt = /\.(png|jpe?g|webp)$/i;

const russianTitles = {
  'dvorets': 'Дворец',
  'lift letit': 'Лифт летит',
  'simulyacia': 'Симуляция',
  'vo sne ya': 'Во сне я...',
  'vo sne ya..': 'Во сне я...',
  'rekursiya mirov': 'Рекурсия миров'
};

const cleanBase = name =>
  name.replace(/\.[^.]+$/, '')
      .replace(/^\s*\d+\s*[-_.]\s*/, '')
      .trim();

const makeTitle = name => {
  const base = cleanBase(name);
  return russianTitles[base.toLowerCase()] || base;
};

const encodePath = (...parts) =>
  parts.map(p => encodeURIComponent(p).replace(/%2F/g, '/')).join('/');

// covers by lowercase base name
const coverFiles = (await readdir(coversDir, { withFileTypes: true }))
  .filter(x => x.isFile() && imageExt.test(x.name))
  .map(x => x.name);

const coverByKey = new Map();
for (const name of coverFiles) {
  const key = name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[\s_]+/g, '-');
  coverByKey.set(key, name);
  coverByKey.set(name.replace(/\.[^.]+$/, '').toLowerCase(), name);
}

function findCover(folderName) {
  const keys = [
    folderName.toLowerCase().replace(/[\s_]+/g, '-'),
    folderName.toLowerCase(),
    folderName.toLowerCase().replace(/\s+/g, '')
  ];
  // aliases
  const aliases = {
    'киберпанк': ['cyberpunk'],
    'город света': ['gorodsveta', 'gorod-sveta'],
    'рекурсия миров': ['rekursia-mirov', 'rekursiya mirov', 'rekursiya-mirov']
  };
  const extra = aliases[folderName.toLowerCase()] || [];
  for (const k of [...keys, ...extra]) {
    if (coverByKey.has(k)) return `./assets/covers/${encodeURIComponent(coverByKey.get(k)).replace(/%2F/g, '/')}`;
  }
  return './assets/cover2.png';
}

const entries = await readdir(musicDir, { withFileTypes: true });
const albumDirs = entries.filter(x => x.isDirectory()).sort((a, b) =>
  a.name.localeCompare(b.name, 'ru')
);

// Preferred order
const order = ['Киберпанк', 'Город света', 'Рекурсия миров'];
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

  if (!files.length) continue;

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

await writeFile('./albums.json', JSON.stringify(albums, null, 2) + '\n');

// Flat list for compatibility
const flat = albums.flatMap(a =>
  a.tracks.map(t => ({
    title: t.title,
    src: t.src,
    cover: a.cover,
    album: a.title
  }))
);
await writeFile('./songs.json', JSON.stringify(flat, null, 2) + '\n');

console.log(`Generated albums.json with ${albums.length} album(s):`);
for (const a of albums) {
  console.log(`  - ${a.title}: ${a.tracks.length} track(s)`);
}
console.log(`songs.json: ${flat.length} track(s)`);

