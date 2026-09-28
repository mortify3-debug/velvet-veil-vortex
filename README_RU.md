# Velvet Veil Vortex — GitHub Pages + Cloudflare Pages

Эта версия исправлена так, чтобы обложка была обычным `<img>` и гарантированно попадала в сборку. Сайт статический, без PHP.

## 1. Загрузка в GitHub
Загрузите **всё содержимое** архива в корень репозитория, а не сам ZIP-файл.

Структура должна быть:

```
index.html
style.css
app.js
assets/cover.png
music/
scripts/build.mjs
.github/workflows/pages.yml
```

## 2. Добавление MP3
Положите песни непосредственно в `music/`, например:

```
music/01 - Neon Blood.mp3
music/02 - New Song.mp3
```

После push GitHub Actions создаст `dist/songs.json`, скопирует MP3 и обложку в `dist/` и опубликует сайт.

## 3. GitHub Pages
GitHub → Settings → Pages → Source: **GitHub Actions**.

После push откройте Actions. В успешном запуске шаг `Verify site files` должен показать `dist/songs.json`, `dist/assets/cover.png` и найденные MP3.

## 4. Cloudflare Pages
Cloudflare → Workers & Pages → Create → Pages → Import existing Git repository.

- Production branch: `main`
- Build command: `node scripts/build.mjs`
- Build output directory: `dist`

Cloudflare автоматически делает новый deployment после каждого push.

## 5. Скачивание
У каждой песни есть кнопка `⇩`. Она скачивает MP3. Такая же кнопка находится в плеере для текущей песни.

## Если обложка не показывается
Убедитесь, что в GitHub действительно существует файл:
`assets/cover.png`

Важно: загружайте содержимое архива в репозиторий. Не нужно загружать ZIP как единственный файл.
