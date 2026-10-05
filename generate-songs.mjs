/**
 * Velvet Veil Vortex — генератор каталога музыки
 *
 * Источник истины: реальные аудиофайлы внутри music/<Альбом>/.
 * Скрипт НЕ придумывает MP3 и НЕ сохраняет устаревший каталог,
 * если в репозитории нет ни одного аудиофайла.
 *
 * Запуск:
 *   node generate-songs.mjs
 *
 * CI должен запускать этот файл перед деплоем.
 */
import { readdir, writeFile, mkdir, stat, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const musicDir = './music';
const coversDir = './assets/covers';

const audioExt = /\.(mp3|m4a|ogg|wav)$/i;
const imageExt = /\.(png|jpe?g|webp)$/i;

/* Порядок альбомов на сайте. Остальные альбомы идут после них. */
const order = ['Рекурсия миров', 'Город света', 'Киберпанк'];

const cleanBase = name =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/^\s*\d+\s*[-_.]\s*/, '')
    .trim();

const russianTitles = {
  'дворец': 'Дворец',
  'лифт летит': 'Лифт летит',
  'симуляция': 'Симуляция',
  'во сне я...': 'Во сне я...',
  'во сне я..': 'Во сне я...',
  'рекурсия миров': 'Рекурсия миров'
};

const makeTitle = name => {
  const base = cleanBase(name);
  return russianTitles[base.toLocaleLowerCase('ru')] || base;
};

const encodePath = (...parts) =>
  parts.map(part => encodeURIComponent(part)).join('/');

async function listAudioFiles(dir) {
  const result = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      result.push(...await listAudioFiles(fullPath));
      continue;
    }

    if (!entry.isFile() || !audioExt.test(entry.name)) continue;

    const info = await stat(fullPath);
    if (info.size <= 0) {
      throw new Error(`Пустой аудиофайл: ${fullPath}`);
    }

    /* Git LFS pointer is a tiny text file, not the real MP3. */
    if (info.size < 1024 * 1024) {
      const head = (await readFile(fullPath, 'utf8').catch(() => '')).slice(0, 200);
      if (head.startsWith('version https://git-lfs.github.com/spec/v1')) {
        throw new Error(
          `Git LFS pointer вместо реального аудиофайла: ${fullPath}. ` +
          `Проверьте Git LFS и наличие объекта MP3 в репозитории.`
        );
      }
    }

    result.push(fullPath);
  }

  return result;
}

/* Обложки ищутся только в assets/covers/. */
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
  'киберпанк': ['cyberpunk'],
  'город света': ['gorodsveta', 'gorod-sveta', 'gorod sveta'],
  'рекурсия миров': [
    'rekursia-mirov',
    'rekursiya-mirov',
    'rekursiya mirov',
    'rekursia mirov'
  ]
};

function findCover(folderName) {
  const lower = folderName.toLocaleLowerCase('ru');
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

const entries = await readdir(musicDir, { withFileTypes: true });
const albumDirs = entries
  .filter(entry => entry.isDirectory())
  .sort((a, b) => {
    const ia = order.indexOf(a.name);
    const ib = order.indexOf(b.name);

    if (ia === -1 && ib === -1) {
      return a.name.localeCompare(b.name, 'ru');
    }
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

if (albumDirs.length === 0) {
  throw new Error('В music/ нет папок альбомов.');
}

const albums = [];

for (const albumDir of albumDirs) {
  const folder = albumDir.name;
  const albumPath = join(musicDir, folder);
  const audioFiles = await listAudioFiles(albumPath);

  audioFiles.sort((a, b) =>
    a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  );

  if (audioFiles.length === 0) {
    console.warn(`WARNING: альбом без аудиофайлов: music/${folder}`);
  }

  const tracks = audioFiles.map(filePath => {
    const relativePath = relative(musicDir, filePath)
      .split(sep)
      .filter(Boolean);

    return {
      title: makeTitle(relativePath.at(-1)),
      src: `./music/${encodePath(...relativePath)}`
    };
  });

  /* Трек с названием альбома всегда первым. */
  const normalizedAlbumTitle = folder.trim().toLocaleLowerCase('ru');

  tracks.sort((a, b) => {
    const aIsAlbum = a.title.trim().toLocaleLowerCase('ru') === normalizedAlbumTitle;
    const bIsAlbum = b.title.trim().toLocaleLowerCase('ru') === normalizedAlbumTitle;
    return Number(bIsAlbum) - Number(aIsAlbum);
  });

  albums.push({
    id: folder
      .toLocaleLowerCase('ru')
      .replace(/\s+/g, '-'),
    title: folder,
    cover: findCover(folder),
    year: '',
    folder,
    tracks
  });
}

const totalTracks = albums.reduce(
  (count, album) => count + album.tracks.length,
  0
);

/*
 * Нулевой каталог — это ошибка, а не нормальный результат.
 * Старый songs.json больше не сохраняем: иначе CI может успешно
 * задеплоить страницу с несуществующими MP3.
 */
if (totalTracks === 0) {
  throw new Error(
    'Не найдено ни одного аудиофайла. ' +
    'Проверьте, что реальные MP3 находятся в music/<Альбом>/. ' +
    'Пустые папки и Git LFS pointer-файлы не считаются треками.'
  );
}

const songs = albums.flatMap(album =>
  album.tracks.map(track => ({
    title: track.title,
    src: track.src,
    cover: album.cover,
    album: album.title
  }))
);

await writeFile(
  './albums.json',
  JSON.stringify(albums, null, 2) + '\n',
  'utf8'
);

await writeFile(
  './songs.json',
  JSON.stringify(songs, null, 2) + '\n',
  'utf8'
);

console.log(`albums.json: ${albums.length} album(s)`);
console.log(`songs.json: ${songs.length} track(s)`);

for (const album of albums) {
  console.log(
    `  - ${album.title}: ${album.tracks.length} track(s), cover=${album.cover}`
  );
}
