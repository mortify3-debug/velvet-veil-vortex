/**
 * Velvet Veil Vortex — генератор каталога музыки.
 *
 * Источник треков: реальные аудиофайлы внутри music/<Альбом>/.
 * На выходе всегда синхронно создаются:
 *   - albums.json — альбомы + треки;
 *   - songs.json  — плоский список тех же треков.
 *
 * MP3/аудиофайлы НЕ загружаются этим скриптом. Они должны уже находиться
 * в репозитории GitHub в папках music/<Альбом>/.
 */
import { readdir, writeFile, mkdir, stat, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const musicDir = './music';
const coversDir = './assets/covers';
const albumsFile = './albums.json';
const songsFile = './songs.json';

const audioExt = /\.(mp3|m4a|ogg|wav)$/i;
const imageExt = /\.(png|jpe?g|webp)$/i;

const albumOrder = ['Рекурсия миров', 'Город света', 'Киберпанк'];

const russianTitles = new Map([
  ['dvorец', 'Дворец'],
  ['dvorets', 'Дворец'],
  ['lift letit', 'Лифт летит'],
  ['simulyacia', 'Симуляция'],
  ['simulyatsiya', 'Симуляция'],
  ['vo sne ya', 'Во сне я...'],
  ['vo sne ya..', 'Во сне я...'],
  ['vo sne ya...', 'Во сне я...'],
  ['rekursiya mirov', 'Рекурсия миров']
]);

const cleanBase = name =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/^\s*\d+\s*[-_.]\s*/, '')
    .trim();

const makeTitle = name => {
  const base = cleanBase(name);
  return russianTitles.get(base.toLowerCase()) || base;
};

const encodePath = (...parts) =>
  parts.map(part => encodeURIComponent(part)).join('/');

const slugify = value =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const normalize = value => String(value || '').trim().toLowerCase();

await mkdir(musicDir, { recursive: true });
await mkdir(coversDir, { recursive: true });

/*
 * Read existing albums.json only for stable album metadata (cover/year/order).
 * The track list itself is ALWAYS rebuilt from files under music/.
 */
let previousAlbums = [];
try {
  const raw = await readFile(albumsFile, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) previousAlbums = parsed;
} catch {
  previousAlbums = [];
}

const previousByFolder = new Map(
  previousAlbums
    .filter(a => a && typeof a.folder === 'string')
    .map(a => [normalize(a.folder), a])
);

const coverFiles = (await readdir(coversDir, { withFileTypes: true }))
  .filter(entry => entry.isFile() && imageExt.test(entry.name))
  .map(entry => entry.name);

const coverByKey = new Map();
for (const name of coverFiles) {
  const base = name.replace(/\.[^.]+$/, '').toLowerCase();
  coverByKey.set(base, name);
  coverByKey.set(base.replace(/[\s_]+/g, '-'), name);
  coverByKey.set(base.replace(/[\s_-]+/g, ''), name);
}

const aliases = {
  'киберпанк': ['cyberpunk'],
  'город света': ['gorodsveta', 'gorod-sveta', 'gorod sveta'],
  'рекурсия миров': [
    'rekursia-mirov',
    'rekursiya-mirov',
    'rekursiya mirov',
    'rekursia mirov'
  ]
};

function findCover(folderName, previous) {
  if (previous?.cover) return previous.cover;

  const lower = normalize(folderName);
  const keys = [
    lower,
    lower.replace(/[\s_]+/g, '-'),
    lower.replace(/[\s_-]+/g, ''),
    ...(aliases[lower] || [])
  ];

  for (const key of keys) {
    if (coverByKey.has(key)) {
      return `./assets/covers/${encodeURIComponent(coverByKey.get(key))}`;
    }
  }

  return './assets/cover2.jpg';
}

/* Recursively collect audio files inside one album directory. */
async function collectAudioFiles(dir, baseDir = dir) {
  const result = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      result.push(...await collectAudioFiles(fullPath, baseDir));
      continue;
    }

    if (!entry.isFile() || !audioExt.test(entry.name)) continue;

    try {
      const info = await stat(fullPath);
      if (info.size <= 0) {
        console.warn(`WARNING: empty audio file skipped: ${fullPath}`);
        continue;
      }
    } catch (error) {
      console.warn(`WARNING: cannot inspect ${fullPath}: ${error.message}`);
      continue;
    }

    result.push({
      name: entry.name,
      relativePath: relative(baseDir, fullPath)
    });
  }

  return result;
}

const entries = await readdir(musicDir, { withFileTypes: true });
let albumDirs = entries.filter(entry => entry.isDirectory());

albumDirs.sort((a, b) => {
  const ia = albumOrder.findIndex(x => normalize(x) === normalize(a.name));
  const ib = albumOrder.findIndex(x => normalize(x) === normalize(b.name));

  if (ia === -1 && ib === -1) return a.name.localeCompare(b.name, 'ru');
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
});

const albums = [];

for (const dir of albumDirs) {
  const folder = dir.name;
  const previous = previousByFolder.get(normalize(folder));
  const collected = await collectAudioFiles(join(musicDir, folder));

  collected.sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  );

  /* A track whose title equals the album title must be first. */
  const albumTitleNormalized = normalize(folder);
  collected.sort((a, b) => {
    const aIsAlbum = normalize(makeTitle(a.name)) === albumTitleNormalized;
    const bIsAlbum = normalize(makeTitle(b.name)) === albumTitleNormalized;
    if (aIsAlbum !== bIsAlbum) return aIsAlbum ? -1 : 1;
    return 0;
  });

  if (!collected.length) {
    console.warn(`WARNING: no audio files found in music/${folder}/`);
  }

  const tracks = collected.map(file => {
    const pathParts = [folder, ...file.relativePath.split(/[\\/]/)];
    return {
      title: makeTitle(file.name),
      src: `./music/${encodePath(...pathParts)}`
    };
  });

  albums.push({
    id: previous?.id || slugify(folder),
    title: folder,
    cover: findCover(folder, previous),
    year: previous?.year || '',
    folder,
    tracks
  });
}

const songs = albums.flatMap(album =>
  album.tracks.map(track => ({
    title: track.title,
    src: track.src,
    cover: album.cover,
    album: album.title
  }))
);

await writeFile(albumsFile, JSON.stringify(albums, null, 2) + '\n', 'utf8');
await writeFile(songsFile, JSON.stringify(songs, null, 2) + '\n', 'utf8');

console.log(`albums.json: ${albums.length} album(s)`);
console.log(`songs.json: ${songs.length} track(s)`);
for (const album of albums) {
  console.log(`  - ${album.title}: ${album.tracks.length} track(s)`);
}
