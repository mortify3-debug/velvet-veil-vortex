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


## Обложки песен

Обложка сайта находится в `assets/cover.png`.

Для отдельной обложки песни положите изображение в `assets/` с тем же именем, что и MP3:
- `music/Dvorets.mp3` → `assets/Dvorets.jpg`
- `music/Rekursiya mirov.mp3` → `assets/Rekursiya mirov.jpg`

Поддерживаются PNG, JPG/JPEG и WEBP. Если отдельной обложки нет, используется `assets/cover.png`.

## Русские названия

Для текущих треков генератор автоматически показывает:
- Dvorets → Дворец
- Rekursiya mirov → Рекурсия миров
- Simulyacia → Симуляция
- Vo sne ya... → Во сне я...

Перемотка выполняется ползунком в нижнем плеере: мышью на компьютере или пальцем на телефоне.
