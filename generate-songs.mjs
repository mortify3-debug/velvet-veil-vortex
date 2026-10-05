/**
 * Velvet Veil Vortex — генератор каталога музыки.
 *
 * Источник треков:
 *   music/<Альбом>/**/*.mp3
 *   music/<Альбом>/**/*.m4a
 *   music/<Альбом>/**/*.ogg
 *   music/<Альбом>/**/*.wav
 *
 * На выходе создаются:
 *   - albums.json — альбомы + треки;
 *   - songs.json  — плоский список тех же треков.
 *
 * MP3/аудиофайлы НЕ загружаются этим скриптом.
 * Они должны уже находиться в репозитории GitHub
 * внутри папок music/<Альбом>/.
 */

import {
  readdir,
  writeFile,
  mkdir,
  stat,
  readFile
} from 'node:fs/promises';

import { join, relative } from 'node:path';

const musicDir = './music';
const coversDir = './assets/covers';

const albumsFile = './albums.json';
const songsFile = './songs.json';

const audioExt = /\.(mp3|m4a|ogg|wav)$/i;
const imageExt = /\.(png|jpe?g|webp)$/i;

/**
 * Порядок альбомов на сайте.
 * Остальные альбомы добавляются после них
 * в алфавитном порядке.
 */
const albumOrder = [
  'Рекурсия миров',
  'Город света',
  'Киберпанк'
];

/**
 * Известные английские имена треков,
 * которые должны отображаться на русском.
 */
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

/**
 * Удаляет расширение файла
 * и возможный числовой префикс.
 *
 * Например:
 *   01-Мой хит.mp3 -> Мой хит
 *   02_My Song.mp3 -> My Song
 */
const cleanBase = name =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/^\s*\d+\s*[-_.]\s*/, '')
    .trim();

/**
 * Делает отображаемое название трека.
 */
const makeTitle = name => {
  const base = cleanBase(name);
  return russianTitles.get(base.toLowerCase()) || base;
};

/**
 * Кодирует каждый сегмент пути отдельно.
 *
 * Например:
 *   music/Город света/Мой хит.mp3
 *
 * превращается в:
 *   ./music/%D0%93%D0%BE%D1%80%D0%BE%D0%B4%20%D1%81%D0%B2%D0%B5%D1%82%D0%B0/%D0%9C%D0%BE%D0%B9%20%D1%85%D0%B8%D1%82.mp3
 */
const encodePath = (...parts) =>
  parts
    .map(part => encodeURIComponent(part))
    .join('/');

/**
 * Нормализация строк для сравнений.
 */
const normalize = value =>
  String(value || '')
    .trim()
    .toLowerCase();

/**
 * Безопасный slug для id альбома.
 */
const slugify = value =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Убеждаемся, что каталоги существуют.
 */
await mkdir(musicDir, { recursive: true });
await mkdir(coversDir, { recursive: true });

/**
 * Загружаем старый albums.json только для сохранения
 * метаданных альбомов:
 *
 *   id
 *   cover
 *   year
 *
 * СПИСОК ТРЕКОВ ИЗ СТАРОГО albums.json НЕ ИСПОЛЬЗУЕТСЯ.
 *
 * Список треков всегда строится заново из music/.
 */
let previousAlbums = [];

try {
  const raw = await readFile(albumsFile, 'utf8');
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    previousAlbums = parsed;
  }
} catch {
  previousAlbums = [];
}

const previousByFolder = new Map(
  previousAlbums
    .filter(
      album =>
        album &&
        typeof album.folder === 'string'
    )
    .map(album => [
      normalize(album.folder),
      album
    ])
);

/**
 * Считаем, сколько треков было в предыдущем каталоге.
 *
 * Это используется ТОЛЬКО для защиты от случайного
 * уничтожения рабочего каталога при проблеме со сканером.
 */
const previousTrackCount = previousAlbums.reduce(
  (total, album) =>
    total +
    (
      Array.isArray(album?.tracks)
        ? album.tracks.length
        : 0
    ),
  0
);

/**
 * Читаем доступные обложки.
 */
const coverFiles = (
  await readdir(coversDir, {
    withFileTypes: true
  })
)
  .filter(
    entry =>
      entry.isFile() &&
      imageExt.test(entry.name)
  )
  .map(entry => entry.name);

/**
 * Индекс обложек.
 */
const coverByKey = new Map();

for (const name of coverFiles) {
  const base = name
    .replace(/\.[^.]+$/, '')
    .toLowerCase();

  coverByKey.set(base, name);

  coverByKey.set(
    base.replace(/[\s_]+/g, '-'),
    name
  );

  coverByKey.set(
    base.replace(/[\s_-]+/g, ''),
    name
  );
}

/**
 * Дополнительные имена обложек.
 */
const aliases = {
  'киберпанк': [
    'cyberpunk'
  ],

  'город света': [
    'gorodsveta',
    'gorod-sveta',
    'gorod sveta'
  ],

  'рекурсия миров': [
    'rekursia-mirov',
    'rekursiya-mirov',
    'rekursiya mirov',
    'rekursia mirov'
  ]
};

/**
 * Определяем обложку альбома.
 */
function findCover(folderName, previous) {
  /**
   * Если в старом albums.json уже была обложка,
   * сохраняем её.
   */
  if (
    previous &&
    typeof previous.cover === 'string' &&
    previous.cover.trim()
  ) {
    return previous.cover;
  }

  const lower = normalize(folderName);

  const keys = [
    lower,
    lower.replace(/[\s_]+/g, '-'),
    lower.replace(/[\s_-]+/g, ''),
    ...(aliases[lower] || [])
  ];

  for (const key of keys) {
    if (coverByKey.has(key)) {
      return `./assets/covers/${encodeURIComponent(
        coverByKey.get(key)
      )}`;
    }
  }

  /**
   * Общая запасная обложка.
   */
  return './assets/cover2.jpg';
}

/**
 * Рекурсивно собирает аудиофайлы внутри альбома.
 *
 * Это позволяет работать не только с:
 *
 *   music/Город света/Мой хит.mp3
 *
 * но и, например:
 *
 *   music/Город света/bonus/Мой хит.mp3
 */
async function collectAudioFiles(
  dir,
  baseDir = dir
) {
  const result = [];

  let entries;

  try {
    entries = await readdir(dir, {
      withFileTypes: true
    });
  } catch (error) {
    throw new Error(
      `Cannot read music directory "${dir}": ${error.message}`
    );
  }

  for (const entry of entries) {
    const fullPath = join(
      dir,
      entry.name
    );

    /**
     * Вложенная папка.
     */
    if (entry.isDirectory()) {
      const nested =
        await collectAudioFiles(
          fullPath,
          baseDir
        );

      result.push(...nested);
      continue;
    }

    /**
     * Не аудиофайл.
     */
    if (
      !entry.isFile() ||
      !audioExt.test(entry.name)
    ) {
      continue;
    }

    /**
     * Проверяем размер файла.
     */
    let info;

    try {
      info = await stat(fullPath);
    } catch (error) {
      throw new Error(
        `Cannot inspect audio file "${fullPath}": ${error.message}`
      );
    }

    /**
     * Пустой аудиофайл нельзя добавлять
     * в каталог.
     */
    if (info.size <= 0) {
      console.warn(
        `WARNING: empty audio file skipped: ${fullPath}`
      );

      continue;
    }

    result.push({
      name: entry.name,
      relativePath: relative(
        baseDir,
        fullPath
      )
    });
  }

  return result;
}

/**
 * Получаем папки верхнего уровня внутри music/.
 *
 * Каждая такая папка = отдельный альбом.
 */
let entries;

try {
  entries = await readdir(
    musicDir,
    {
      withFileTypes: true
    }
  );
} catch (error) {
  throw new Error(
    `Cannot read music directory "${musicDir}": ${error.message}`
  );
}

let albumDirs = entries.filter(
  entry => entry.isDirectory()
);

/**
 * Сортировка альбомов.
 */
albumDirs.sort((a, b) => {
  const ia = albumOrder.findIndex(
    x =>
      normalize(x) ===
      normalize(a.name)
  );

  const ib = albumOrder.findIndex(
    x =>
      normalize(x) ===
      normalize(b.name)
  );

  if (
    ia === -1 &&
    ib === -1
  ) {
    return a.name.localeCompare(
      b.name,
      'ru',
      {
        sensitivity: 'base'
      }
    );
  }

  if (ia === -1) return 1;
  if (ib === -1) return -1;

  return ia - ib;
});

/**
 * Здесь будут новые данные каталога.
 */
const albums = [];

let totalDiscoveredTracks = 0;

/**
 * Обрабатываем каждый альбом.
 */
for (const dir of albumDirs) {
  const folder = dir.name;

  const previous =
    previousByFolder.get(
      normalize(folder)
    );

  /**
   * Сканируем реальные файлы.
   */
  let collected =
    await collectAudioFiles(
      join(musicDir, folder)
    );

  /**
   * Сначала сортировка по имени/пути.
   */
  collected.sort((a, b) =>
    a.relativePath.localeCompare(
      b.relativePath,
      undefined,
      {
        numeric: true,
        sensitivity: 'base'
      }
    )
  );

  /**
   * Трек, название которого совпадает
   * с названием альбома, ставим первым.
   */
  const albumTitleNormalized =
    normalize(folder);

  collected.sort((a, b) => {
    const aIsAlbum =
      normalize(
        makeTitle(a.name)
      ) ===
      albumTitleNormalized;

    const bIsAlbum =
      normalize(
        makeTitle(b.name)
      ) ===
      albumTitleNormalized;

    if (
      aIsAlbum !== bIsAlbum
    ) {
      return aIsAlbum ? -1 : 1;
    }

    return 0;
  });

  /**
   * Отладочная информация.
   *
   * При добавлении:
   *
   * music/Город света/Мой хит.mp3
   *
   * в GitHub Actions будет видно:
   *
   *   Album: Город света
   *   audio files found: 1
   */
  console.log(
    `Album: ${folder}`
  );

  console.log(
    `  audio files found: ${collected.length}`
  );

  for (const file of collected) {
    console.log(
      `  + ${file.relativePath}`
    );
  }

  if (!collected.length) {
    console.warn(
      `WARNING: no audio files found in music/${folder}/`
    );
  }

  totalDiscoveredTracks +=
    collected.length;

  /**
   * Формируем tracks.
   */
  const tracks = collected.map(
    file => {
      const pathParts = [
        folder,
        ...file.relativePath
          .split(/[\\/]/)
          .filter(Boolean)
      ];

      return {
        title: makeTitle(
          file.name
        ),

        src:
          `./music/${encodePath(
            ...pathParts
          )}`
      };
    }
  );

  /**
   * Добавляем альбом.
   */
  albums.push({
    id:
      previous?.id ||
      slugify(folder),

    title: folder,

    cover:
      findCover(
        folder,
        previous
      ),

    year:
      previous?.year || '',

    folder,

    tracks
  });
}

/**
 * ВАЖНАЯ ЗАЩИТА.
 *
 * Если раньше каталог содержал треки,
 * а новый сканер внезапно обнаружил 0,
 * НЕ перезаписываем albums.json и songs.json
 * пустыми массивами.
 *
 * Это не скрывает проблему:
 * deployment будет завершён ошибкой,
 * и в GitHub Actions будет понятно,
 * что сканер не увидел аудиофайлы.
 *
 * При этом если это первый запуск
 * и старого каталога нет — разрешаем
 * создать пустые JSON.
 */
if (
  previousTrackCount > 0 &&
  totalDiscoveredTracks === 0
) {
  throw new Error(
    `SAFETY ERROR: scanner found 0 audio files, ` +
    `but existing albums.json contains ` +
    `${previousTrackCount} track(s). ` +
    `Refusing to overwrite the existing music catalog. ` +
    `Check that the music/ directory and audio files ` +
    `are present in the deployment.`
  );
}

/**
 * songs.json — плоский список тех же треков.
 */
const songs = albums.flatMap(
  album =>
    album.tracks.map(
      track => ({
        title: track.title,
        src: track.src,
        cover: album.cover,
        album: album.title
      })
    )
);

/**
 * Записываем albums.json.
 */
await writeFile(
  albumsFile,
  JSON.stringify(
    albums,
    null,
    2
  ) + '\n',
  'utf8'
);

/**
 * Записываем songs.json.
 */
await writeFile(
  songsFile,
  JSON.stringify(
    songs,
    null,
    2
  ) + '\n',
  'utf8'
);

/**
 * Итоговый отчёт.
 */
console.log('');
console.log(
  `albums.json: ${albums.length} album(s)`
);

console.log(
  `songs.json: ${songs.length} track(s)`
);

for (const album of albums) {
  console.log(
    `  - ${album.title}: ${album.tracks.length} track(s)`
  );
}

console.log('');
console.log(
  'Music catalog generated successfully.'
);
