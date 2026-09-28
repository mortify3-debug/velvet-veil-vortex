# Velvet Veil Vortex — GitHub + Cloudflare

Статический музыкальный сайт без PHP и базы данных.

## Добавить MP3
Положите MP3 в папку `music/` и сделайте Commit. GitHub Actions создаст `songs.json` автоматически. На сайте у каждого трека будут обложка, название, длительность, PLAY и DOWNLOAD. Длительность определяется браузером из метаданных MP3.

## Индивидуальные обложки
По умолчанию используется `assets/cover.png`. Если позже захотите отдельную обложку для песни, добавьте файл изображения в `assets/` и измените поле `cover` в `songs.json` после генерации, либо расширьте генератор по имени файла.

## Cloudflare Pages
Build command: `node generate-songs.mjs`
Output directory: `/`
Если Cloudflare подключён к GitHub, каждый push запускает новый deployment.

## GitHub Pages
Можно использовать workflow из `.github/workflows/update-and-deploy.yml`.
