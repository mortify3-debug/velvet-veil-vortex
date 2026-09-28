# Velvet Veil Vortex — GitHub + Cloudflare Pages

## Главное
Эта версия **не использует `dist/` и не требует build-команды в Cloudflare**. Все файлы сайта находятся прямо в корне репозитория. GitHub Actions создаёт `songs.json` из файлов в папке `music/`.

Структура:

```text
index.html
style.css
app.js
songs.json
generate-songs.mjs
assets/cover.png
music/
.github/workflows/update-and-deploy.yml
_headers
```

## Добавление MP3
Загружайте MP3 в папку `music/` в GitHub и делайте Commit.

Пример:

```text
music/01 - Neon Blood.mp3
music/02 - Cyber Dreams.mp3
```

После push GitHub Actions:
1. запускает `generate-songs.mjs`;
2. обновляет `songs.json`;
3. публикует сайт GitHub Pages.

Cloudflare Pages при подключении этого репозитория также автоматически создаёт новый deployment после push.

## Cloudflare Pages — важные настройки
Для этого варианта **не нужен Node build**.

- Production branch: `main`
- Build command: оставить пустым
- Build output directory: `/` или корень проекта

Cloudflare Pages поддерживает статические HTML-сайты без framework/build. См. официальную документацию Cloudflare.

## GitHub Pages
GitHub → Settings → Pages → Source: **GitHub Actions**.

## Обложка
Файл должен находиться строго здесь:

```text
assets/cover.png
```

Сайт подключает его напрямую как `<img>`, поэтому он не зависит от CSS-фона.

## Скачивание
У каждой песни есть кнопка `⇩`. Нижняя кнопка скачивает текущую песню.

## Важно про MP3
Размер и лимиты зависят от платформы. Если отдельные MP3 становятся слишком большими для размещения непосредственно на Pages/GitHub, лучше вынести аудиофайлы в Cloudflare R2.
