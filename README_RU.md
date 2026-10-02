# Velvet Veil Vortex

## Автозагрузка треков

Положите MP3 в папку альбома и сделайте **push** — каталог обновится сам:

```
music/
  Киберпанк/
    новая-песня.mp3
  Город света/
  Рекурсия миров/
```

При деплое GitHub Actions / Cloudflare запускает:

```bash
node generate-songs.mjs
```

Он сканирует подпапки `music/` и пересобирает `albums.json` + `songs.json`.

### Вручную локально

```bash
node generate-songs.mjs
```

### Новый альбом

1. Создайте `music/Название/`
2. Положите MP3
3. Обложку — в `assets/covers/` (имя файла ≈ название альбома)
4. Push (или `node generate-songs.mjs`)

## Cloudflare Pages

- Build command: `node generate-songs.mjs`
- Output directory: `/`

## Управление

- Кнопка ▶ перед названием трека: **play / pause**
- Регулятор громкости — справа в строке трека
- Нижний плеер на сайте **скрыт**; управление на экране блокировки смартфона (Media Session: play/pause, ← →, обложка в стиле сайта)
- Скролл списка треков без видимого тулбара
- Колёсико между обложками: плавный переход
- Слоган: «Громче чем музыка!»

## Сборка

```bash
node build.mjs
# или
npm run build
```

Результат — папка `dist/` (весь сайт для деплоя).

Сборка проверяет:
- CSP: `connect-src` должен включать `blob:` (иначе текстуры GLB не грузятся)
- наличие файлы: `dancer3d.js`, Three.js, модель, иконки

## CSP и 3D-текстуры

В `_headers` обязательно:

`connect-src 'self' blob: data:`

Three.js читает текстуры из GLB через `blob:` URL. Без этого модель белая.
Если CSP задаётся ещё в Cloudflare Worker — добавьте `blob:` и там.
