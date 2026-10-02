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

## Cloudflare (Workers Builds)

**Правильные настройки в Cloudflare Dashboard → Builds:**

- **Build command:** `npm run build`  
  (или `node generate-songs.mjs && node build.mjs`)
- **Deploy command:** `npx wrangler deploy`
- **Root directory:** оставьте пустым

В проекте уже есть всё необходимое:
- `wrangler.jsonc` — assets.directory = `./dist`
- `build.mjs` — копирует только нужные файлы в `dist/` (без node_modules)
- `.assetsignore` и `.gitignore` — защита от случайной загрузки тяжёлых файлов
- `package.json` — скрипты generate / build / deploy

Это полностью решает ошибку:

```
Asset too large. ... node_modules/workerd/bin/workerd ... 128 MiB
```

### Если используете классический Cloudflare Pages

- Build command: `node generate-songs.mjs`
- Build output directory: `/`

## Управление

- Кнопка ▶ перед названием трека: **play / pause**
- Регулятор громкости — справа в строке трека
- Нижний плеер на сайте **скрыт**; управление на экране блокировки смартфона (Media Session: play/pause, ← →, обложка в стиле сайта)
- Скролл списка треков без видимого тулбара
- Колёсико между обложками: плавный переход
- Слоган: «Громче чем музыка!»
