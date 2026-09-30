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

Он сканирует подпапки `music/` и пересобирает `albums.json`.

### Вручную локально

```bash
node generate-songs.mjs
```

### Новый альбом

1. Создайте `music/Название/`
2. Положите MP3
3. Обложку — в `assets/covers/`
4. Push (или `node generate-songs.mjs`)

## Cloudflare Pages

- Build command: `node generate-songs.mjs`
- Output directory: `/`

## Управление

- Кнопка ▶ на альбоме / треке: **play / pause**
- Колёсико между обложками: плавный переход
- Слоган: «Громче чем музыка!»
