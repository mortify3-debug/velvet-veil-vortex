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
import { readdir, writeFile, mkdir, stat, readFile, open } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const musicDir = './music';
const coversDir = './assets/covers';
const albumsFile = './albums.json';
const songsFile = './songs.json';

const audioExt = /\.(mp3|m4a|ogg|wav)$/i;
const imageExt = /\.(png|jpe?g|webp)$/i;

let probeToolLogged = false;

function parseDurationSeconds(text) {
  const plain = parseFloat(String(text).trim());
  if (Number.isFinite(plain) && plain > 0) return Math.round(plain * 10) / 10;

  const m = String(text).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (m) {
    const sec = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
    if (Number.isFinite(sec) && sec > 0) return Math.round(sec * 10) / 10;
  }
  return null;
}

/** Pure-JS MP3 duration from Xing/Info header (works without ffmpeg). */
async function probeMp3DurationJs(filePath) {
  let fh;
  try {
    fh = await open(filePath, 'r');
    const stat = await fh.stat();
    const size = stat.size;
    if (size < 128) return null;

    const headSize = Math.min(size, 256 * 1024);
    const buf = Buffer.alloc(headSize);
    await fh.read(buf, 0, headSize, 0);

    let offset = 0;
    // Skip ID3v2
    if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
      const synch = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9];
      offset = 10 + synch + ((buf[5] & 0x10) ? 10 : 0);
      if (offset >= headSize) return null;
    }

    // Find first MPEG frame sync
    let frameOffset = -1;
    for (let i = offset; i < headSize - 4; i++) {
      if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
        frameOffset = i;
        break;
      }
    }
    if (frameOffset < 0) return null;

    const b1 = buf[frameOffset + 1];
    const b2 = buf[frameOffset + 2];
    const mpegVerBits = (b1 >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    const layerBits = (b1 >> 1) & 0x03;   // 1=Layer III
    const brIdx = (b2 >> 4) & 0x0f;
    const srIdx = (b2 >> 2) & 0x03;
    if (brIdx === 0 || brIdx === 15 || srIdx === 3) return null;

    const mpeg = mpegVerBits === 3 ? 1 : mpegVerBits === 2 ? 2 : 25;
    const layer = layerBits === 1 ? 3 : layerBits === 2 ? 2 : layerBits === 3 ? 1 : 0;
    if (layer !== 3) return null;

    const srTable = {
      1: [44100, 48000, 32000],
      2: [22050, 24000, 16000],
      25: [11025, 12000, 8000]
    };
    const sampleRate = srTable[mpeg]?.[srIdx];
    if (!sampleRate) return null;

    // Side info size for Xing offset
    const channelMode = (buf[frameOffset + 3] >> 6) & 0x03;
    const mono = channelMode === 3;
    let xingOff;
    if (mpeg === 1) xingOff = mono ? 17 : 32;
    else xingOff = mono ? 9 : 17;

    const tagPos = frameOffset + 4 + xingOff;
    if (tagPos + 12 >= headSize) return null;

    const tag = buf.toString('ascii', tagPos, tagPos + 4);
    if (tag !== 'Xing' && tag !== 'Info') {
      // CBR fallback: estimate from bitrate + file size
      const brTables = {
        1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
        2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
      };
      const br = (mpeg === 1 ? brTables[1] : brTables[2])[brIdx];
      if (!br) return null;
      const audioBytes = size - frameOffset;
      const sec = (audioBytes * 8) / (br * 1000);
      return sec > 0.5 ? Math.round(sec * 10) / 10 : null;
    }

    const flags = buf.readUInt32BE(tagPos + 4);
    if (!(flags & 0x01)) return null; // frames flag
    const frames = buf.readUInt32BE(tagPos + 8);
    const samplesPerFrame = mpeg === 1 ? 1152 : 576;
    const sec = (frames * samplesPerFrame) / sampleRate;
    return sec > 0.5 ? Math.round(sec * 10) / 10 : null;
  } catch {
    return null;
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

/** Duration: pure JS MP3 first, then ffprobe/ffmpeg if available. */
async function probeDuration(filePath) {
  // 1) Pure JS — works on Cloudflare Pages / any Node without ffmpeg
  if (/\.mp3$/i.test(filePath)) {
    const jsSec = await probeMp3DurationJs(filePath);
    if (jsSec != null) return jsSec;
  }

  // 2) ffprobe
  try {
    const { stdout, stderr } = await execFileAsync(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ],
      { timeout: 60000, maxBuffer: 2 * 1024 * 1024 }
    );
    const sec = parseDurationSeconds(stdout || stderr);
    if (sec != null) return sec;
  } catch (err) {
    if (!probeToolLogged) {
      probeToolLogged = true;
      console.warn('ffprobe failed:', err && (err.stderr || err.message || err));
    }
  }

  // 3) ffmpeg -i
  try {
    await execFileAsync(
      'ffmpeg',
      ['-i', filePath, '-f', 'null', '-'],
      { timeout: 60000, maxBuffer: 4 * 1024 * 1024 }
    );
  } catch (err) {
    const text = String((err && err.stderr) || (err && err.message) || '');
    const sec = parseDurationSeconds(text);
    if (sec != null) return sec;
  }

  return null;
}

/* Newest album first (top of the site list). Prepend new albums here. */
const albumOrder = ['Отражение', 'Рекурсия миров', 'Город света', 'Киберпанк'];

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

// Sanity-check media tools (so CI logs show if ffmpeg is missing)
try {
  const { stdout } = await execFileAsync('ffprobe', ['-version'], { timeout: 10000 });
  console.log('ffprobe:', String(stdout).split('\n')[0]);
} catch (err) {
  console.warn('WARNING: ffprobe not available — durations will be missing.', err && err.message);
}
try {
  const { stdout } = await execFileAsync('ffmpeg', ['-version'], { timeout: 10000 });
  console.log('ffmpeg:', String(stdout).split('\n')[0]);
} catch (err) {
  console.warn('WARNING: ffmpeg not available.', err && err.message);
}

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
  ],
  'отражение': ['otrazhenie', 'otrazheniye', 'reflection']
};

function findCover(folderName, previous) {
  const lower = normalize(folderName);
  const keys = [
    lower,
    lower.replace(/[\s_]+/g, '-'),
    lower.replace(/[\s_-]+/g, ''),
    ...(aliases[lower] || [])
  ];

  // Prefer a real file from assets/covers/ (re-scan every run)
  for (const key of keys) {
    if (coverByKey.has(key)) {
      return `./assets/covers/${encodeURIComponent(coverByKey.get(key))}`;
    }
  }

  // Keep previous only if it is not the generic fallback
  const prev = previous?.cover;
  if (prev && !String(prev).includes('cover2.jpg')) {
    return prev;
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

  const tracks = [];
  for (const file of collected) {
    const pathParts = [folder, ...file.relativePath.split(/[\\/]/)];
    const fullPath = join(musicDir, folder, file.relativePath);
    const duration = await probeDuration(fullPath);
    // Prefer git commit time (real "uploaded to repo") over filesystem mtime (often identical in CI)
    let mtime = null;
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['log', '-1', '--format=%ct', '--', fullPath],
        { timeout: 10000 }
      );
      const sec = parseInt(String(stdout).trim(), 10);
      if (Number.isFinite(sec) && sec > 0) mtime = sec * 1000;
    } catch (_) {}
    if (mtime == null) {
      try {
        const st = await stat(fullPath);
        mtime = st.mtimeMs;
      } catch (_) {}
    }
    const track = {
      title: makeTitle(file.name),
      src: `./music/${encodePath(...pathParts)}`
    };
    if (duration != null) track.duration = duration;
    if (mtime != null) track.mtime = mtime;
    tracks.push(track);
    if (duration != null) {
      console.log(`  duration ${duration}s — ${folder}/${file.name}`);
    } else {
      console.warn(`  WARNING: no duration for ${folder}/${file.name}`);
    }
  }

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
    album: album.title,
    ...(track.duration != null ? { duration: track.duration } : {}),
    ...(track.mtime != null ? { mtime: track.mtime } : {})
  }))
);

await writeFile(albumsFile, JSON.stringify(albums, null, 2) + '\n', 'utf8');
await writeFile(songsFile, JSON.stringify(songs, null, 2) + '\n', 'utf8');

console.log(`albums.json: ${albums.length} album(s)`);
console.log(`songs.json: ${songs.length} track(s)`);
for (const album of albums) {
  console.log(`  - ${album.title}: ${album.tracks.length} track(s)`);
}
