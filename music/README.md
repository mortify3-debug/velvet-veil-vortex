# Как добавить треки

Структура папок = альбомы:

```
music/
  Киберпанк/
    track1.mp3
    track2.mp3
  Город света/
    song.mp3
  Рекурсия миров/
    rekursiya.mp3
```

1. Создайте подпапку с названием альбома (как на сайте)
2. Положите MP3 внутрь
3. Обложку — в `assets/covers/` (например `cyberpunk.jpg`, `gorodsveta.jpg`)
4. Запустите `node generate-songs.mjs` — обновится `albums.json`
5. Commit + Push

Или правьте `albums.json` вручную.
