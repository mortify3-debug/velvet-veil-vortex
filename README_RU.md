# Velvet Veil Vortex

## Автозагрузка треков

1. Положите **реальные** MP3 в `music/НазваниеАльбома/`
2. `git add` → `git commit` → `git push` в `main`
3. GitHub Actions запускает `node generate-songs.mjs`, обновляет `albums.json` + `songs.json` и деплоит сайт

```
music/
  Киберпанк/
    новая-песня.mp3
  Город света/
  Рекурсия миров/
```

Только `.mp3` / `.m4a` / `.ogg` / `.wav`. Пустой MP3 сорвёт деплой.
Если в CI не нашлось ни одного аудиофайла, **существующий** `albums.json` не затирается.

Деплои идут **по очереди** (`cancel-in-progress: false`) — без отмены текущего publish.

### Вручную локально

```bash
node generate-songs.mjs
```

### Новый альбом

1. Создайте `music/Название/`
2. Положите MP3
3. Обложку — в `assets/covers/` (имя файла ≈ название альбома)
4. Push

## Cloudflare Pages

- Build command: `node generate-songs.mjs`
- Output directory: `/`

## Управление

- ▶ у трека — play / pause
- Громкость — справа в строке трека
- **Десктоп:** колёсико — смена обложки; **Ctrl + колёсико** (или Ctrl +/−/0) — масштаб страницы
- **Мобильный:** свободная прокрутка обложек без snap; масштаб без прыжков экрана
