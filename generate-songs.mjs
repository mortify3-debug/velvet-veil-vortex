import { readdir, writeFile, mkdir } from 'node:fs/promises';

const musicDir = './music';
const assetsDir = './assets';

await mkdir(musicDir, { recursive: true });
await mkdir(assetsDir, { recursive: true });

const audioExt = /\.(mp3|m4a|ogg|wav)$/i;
const imageExt = /\.(png|jpe?g|webp)$/i;

const files = (await readdir(musicDir, { withFileTypes: true }))
  .filter(x => x.isFile() && audioExt.test(x.name))
  .map(x => x.name)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

const images = (await readdir(assetsDir, { withFileTypes: true }))
  .filter(x => x.isFile() && imageExt.test(x.name))
  .map(x => x.name);

const imageByBase = new Map(
  images.map(name => [name.replace(/\.[^.]+$/, '').toLowerCase(), name])
);

// Названия, которые должны отображаться по-русски.
// Если имя MP3 уже написано по-русски, оно сохраняется.
const russianTitles = {
  'dvorets': 'Дворец',
  'rekursiya mirov': 'Рекурсия миров',
  'simulyacia': 'Симуляция',
  'vo sne ya': 'Во сне я...',
  'vo sne ya..': 'Во сне я...'
};

const cleanBase = name =>
  name.replace(/\.[^.]+$/, '')
      .replace(/^\s*\d+\s*[-_.]\s*/, '')
      .trim();

const makeTitle = name => {
  const base = cleanBase(name);
  return russianTitles[base.toLowerCase()] || base;
};

const tracks = files.map(name => {
  const base = cleanBase(name).toLowerCase();
  const matchingImage = imageByBase.get(base);

  return {
    title: makeTitle(name),
    src: `./music/${encodeURIComponent(name).replace(/%2F/g, '/')}`,
    cover: matchingImage
      ? `./assets/${encodeURIComponent(matchingImage).replace(/%2F/g, '/')}`
      : './assets/cover.png'
  };
});

await writeFile('./songs.json', JSON.stringify(tracks, null, 2) + '\n');
console.log(`Generated songs.json with ${tracks.length} track(s)`);
