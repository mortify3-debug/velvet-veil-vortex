# Velvet Veil Vortex

Статический музыкальный сайт. Две обложки + альбомы + плеер.

## Альбомы и треки

Структура папки `music/` = альбомы:

```
music/
  Киберпанк/
    Dvorets.mp3
    Lift letit.mp3
  Город света/
    Simulyacia.mp3
    Vo sne ya...mp3
  Рекурсия миров/
    Rekursiya mirov.mp3
```

### Добавить трек

1. Положите MP3 в подпапку альбома: `music/Киберпанк/новая-песня.mp3`
2. (Опционально) обложку альбома в `assets/covers/`
3. Запустите генератор:

```bash
node generate-songs.mjs
```

Он пересоберёт `albums.json` из папок.

Или отредактируйте `albums.json` вручную.

### Добавить новый альбом

1. Создайте папку `music/Название альбома/`
2. Положите туда MP3
3. Положите обложку в `assets/covers/` (имя связано с альбомом)
4. `node generate-songs.mjs`

## Обложки

- Первый экран: `assets/cover.png`
- Второй экран: `assets/cover2.png`
- Альбомы: `assets/covers/`

## Cloudflare Pages

Build command: `node generate-songs.mjs`  
Output directory: `/`

## Перемотка

Плеер использует свой seek-бар. Для корректной перемотки сервер должен отдавать `Accept-Ranges: bytes` для MP3 (в `_headers` уже прописано для Cloudflare Pages).
