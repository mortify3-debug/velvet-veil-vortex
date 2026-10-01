const audio = document.getElementById('audio');
const albumGrid = document.getElementById('album-grid');
const trackPanel = document.getElementById('track-panel');
const trackList = document.getElementById('track-list');
const empty = document.getElementById('empty');
const backBtn = document.getElementById('back-btn');
const musicHeading = document.getElementById('music-heading');
const playBtn = document.getElementById('play');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const shuffleBtn = document.getElementById('shuffle');
const repeatBtn = document.getElementById('repeat');
const seekBar = document.getElementById('seek-bar');
const seekFill = document.getElementById('seek-fill');
const seekThumb = document.getElementById('seek-thumb');
const volBar = document.getElementById('vol-bar');
const volFill = document.getElementById('vol-fill');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const titleEl = document.getElementById('player-title');
const playerCover = document.getElementById('player-cover');
const playerDownload = document.getElementById('player-download');
const listenBtn = document.getElementById('listen-btn');
const musicSection = document.getElementById('music');
const snapMain = document.getElementById('snap-main');

let albums = [];
let tracks = [];
let current = -1;
let activeAlbumIndex = -1;
let shuffleOn = false;
let repeatMode = 0;
let isSeeking = false;
let seekPercent = 0;
let scrollLock = false;

const fmt = s =>
  !Number.isFinite(s)
    ? '0:00'
    : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])
  );

/** Strip control chars / limit length for display text from JSON */
const safeText = (s, max = 200) =>
  String(s ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, max);

/** Security block logger — visible in DevTools console */
const securityLog = {
  enabled: true,
  blocks: [],
  warn(reason, detail = {}) {
    if (!this.enabled) return;
    const entry = {
      time: new Date().toISOString(),
      reason,
      ...detail
    };
    this.blocks.push(entry);
    if (this.blocks.length > 200) this.blocks.shift();
    const preview =
      detail.url != null
        ? String(detail.url).slice(0, 120)
        : detail.title != null
          ? String(detail.title).slice(0, 80)
          : '';
    console.warn('[VVV security] blocked:', reason, preview || '', detail);
  },
  summary() {
    console.info('[VVV security] total blocks:', this.blocks.length, this.blocks);
    return this.blocks;
  }
};

try {
  window.VVVSecurityLog = securityLog;
} catch (_) {}

/** True only for path-segment ".." (not filenames like "Во сне я...mp3") */
function hasPathTraversal(path) {
  return String(path || '')
    .replace(/\\/g, '/')
    .split('/')
    .some(seg => {
      if (!seg || seg === '.') return false;
      try {
        return decodeURIComponent(seg) === '..';
      } catch {
        return seg === '..';
      }
    });
}

/**
 * Same-origin media under music/ or assets/ only.
 * Allows ellipsis in names ("Во сне я...mp3"); blocks real "../" traversal.
 */
function safeMediaUrl(raw, kind = 'any', opts = {}) {
  const silent = !!opts.silent;
  const block = (reason) => {
    if (!silent && raw != null && String(raw).trim() !== '') {
      securityLog.warn(reason, { kind, url: String(raw).slice(0, 300) });
    }
    return '';
  };

  if (raw == null) return '';
  let s = String(raw).trim().replace(/\\/g, '/');
  if (!s) return '';
  if (/[\u0000-\u001F\u007F]/.test(s)) return block('control-chars');

  // Absolute / protocol-relative → must stay on this origin, then treat as path
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) || s.startsWith('//')) {
    let abs;
    try {
      abs = new URL(s, location.href);
    } catch {
      return block('invalid-absolute-url');
    }
    if (abs.origin !== location.origin) return block('external-origin');
    if (abs.username || abs.password) return block('url-credentials');
    s = abs.pathname;
  }

  // Normalize to relative
  s = s.replace(/^\/+/, '');
  if (s.startsWith('./')) s = s.slice(2);
  if (hasPathTraversal(s)) return block('path-traversal');

  let decoded;
  try {
    decoded = decodeURIComponent(s);
  } catch {
    return block('bad-encoding');
  }
  if (hasPathTraversal(decoded)) return block('path-traversal-decoded');

  // Accept music/… or assets/… (also after optional site base segments)
  const relMatch = decoded.match(/(?:^|\/)(music|assets)\/(.+)$/i);
  if (!relMatch) return block('outside-music-assets');
  const root = relMatch[1].toLowerCase();
  const rest = relMatch[2];
  if (hasPathTraversal(rest)) return block('path-traversal-rest');

  const lower = (root + '/' + rest).toLowerCase();
  const audioOk = /\.(mp3|m4a|ogg|wav)$/.test(lower);
  const imageOk = /\.(png|jpe?g|webp|gif)$/.test(lower);
  if (kind === 'audio' && !audioOk) return block('bad-audio-extension');
  if (kind === 'image' && !imageOk) return block('bad-image-extension');
  if (kind === 'any' && !audioOk && !imageOk) return block('bad-extension');

  // Rebuild relative URL; keep original percent-encoding for the matched suffix
  const encIdx = s.toLowerCase().search(/(?:^|\/)(music|assets)\//i);
  const suffix = encIdx >= 0 ? s.slice(encIdx).replace(/^\//, '') : root + '/' + rest;
  return './' + suffix.replace(/^\.\//, '');
}

function sanitizeAlbums(data) {
  if (!Array.isArray(data)) {
    securityLog.warn('albums-not-array', { type: typeof data });
    return [];
  }
  if (data.length > 100) {
    securityLog.warn('albums-truncated', { count: data.length, kept: 100 });
  }
  return data.slice(0, 100).map(a => {
    const tracks = Array.isArray(a?.tracks) ? a.tracks : [];
    if (tracks.length > 200) {
      securityLog.warn('tracks-truncated', {
        album: a?.title,
        count: tracks.length,
        kept: 200
      });
    }
    const safeTracks = tracks.slice(0, 200).map(t => {
      const src = safeMediaUrl(t?.src, 'audio');
      if (t?.src && !src) {
        securityLog.warn('track-src-blocked', {
          album: a?.title,
          title: t?.title,
          url: String(t.src).slice(0, 300)
        });
      }
      const cover = t?.cover
        ? safeMediaUrl(t.cover, 'image', { silent: false }) || undefined
        : undefined;
      return {
        title: safeText(t?.title || 'Трек', 120),
        src,
        cover
      };
    }).filter(t => !!t.src);
    // A track whose title matches its album is the album's opening track.
    const normalizedAlbumTitle = safeText(a?.title || '', 120).trim().toLocaleLowerCase('ru');
    safeTracks.sort((left, right) => {
      const leftMatch = left.title.trim().toLocaleLowerCase('ru') === normalizedAlbumTitle;
      const rightMatch = right.title.trim().toLocaleLowerCase('ru') === normalizedAlbumTitle;
      return Number(rightMatch) - Number(leftMatch);
    });

    const cover = safeMediaUrl(a?.cover, 'image') || './assets/cover2.jpg';
    if (a?.cover && cover === './assets/cover2.jpg' && safeMediaUrl(a.cover, 'image', { silent: true }) === '') {
      securityLog.warn('album-cover-fallback', {
        album: a?.title,
        url: String(a.cover).slice(0, 300)
      });
    }

    return {
      id: safeText(a?.id || a?.title || 'album', 80)
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9а-яё_\-]/gi, '')
        .slice(0, 80) || 'album',
      title: safeText(a?.title || 'Без названия', 120),
      cover,
      year: safeText(a?.year || '', 12),
      folder: safeText(a?.folder || a?.title || '', 120),
      tracks: safeTracks
    };
  });
}

function pathOf(src) {
  try {
    return decodeURIComponent(new URL(src, location.href).pathname);
  } catch {
    return String(src || '');
  }
}

function isPlayingSrc(src) {
  return !!(audio.src && src && pathOf(audio.src) === pathOf(src));
}

function sameTrack(i) {
  return i === current && tracks[i] && isPlayingSrc(tracks[i].src);
}

function setSeekUI(percent) {
  const p = Math.max(0, Math.min(100, percent));
  seekPercent = p;
  if (seekFill) seekFill.style.width = p + '%';
  if (seekThumb) seekThumb.style.left = p + '%';
  if (seekBar) seekBar.setAttribute('aria-valuenow', String(Math.round(p)));
}

function setVolUI(percent) {
  const p = Math.max(0, Math.min(100, percent));
  if (volFill) volFill.style.width = p + '%';
  if (volBar) volBar.setAttribute('aria-valuenow', String(Math.round(p)));
  audio.volume = p / 100;
  document.querySelectorAll('.track-vol-bar').forEach(bar => {
    const fill = bar.querySelector('.vol-fill');
    if (fill) fill.style.width = p + '%';
    bar.setAttribute('aria-valuenow', String(Math.round(p)));
  });
}

function percentFromEvent(el, e) {
  const rect = el.getBoundingClientRect();
  let clientX;
  if (e.touches && e.touches.length) clientX = e.touches[0].clientX;
  else if (e.changedTouches && e.changedTouches.length) clientX = e.changedTouches[0].clientX;
  else clientX = e.clientX;
  if (!rect.width || clientX == null) return 0;
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 100;
}

function applySeek(percent) {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return false;
  const t = (audio.duration * Math.max(0, Math.min(100, percent))) / 100;
  const safe = Math.min(t, Math.max(0, audio.duration - 0.15));
  const wasPlaying = !audio.paused;

  currentTimeEl.textContent = fmt(safe);
  setSeekUI((safe / audio.duration) * 100);

  try {
    if (wasPlaying) audio.pause();
    if (typeof audio.fastSeek === 'function') {
      try { audio.fastSeek(safe); } catch (_) { audio.currentTime = safe; }
    } else {
      audio.currentTime = safe;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      audio.removeEventListener('seeked', finish);
      if (wasPlaying) audio.play().catch(() => {});
    };
    audio.addEventListener('seeked', finish);
    setTimeout(finish, 200);
    return true;
  } catch (err) {
    console.warn('Seek failed:', err);
    if (wasPlaying) audio.play().catch(() => {});
    return false;
  }
}

function trackCountLabel(n) {
  if (!n) return 'нет треков';
  if (n === 1) return '1 трек';
  if (n < 5) return `${n} трека`;
  return `${n} треков`;
}

function renderAlbums(expandIndex = -1) {
  albumGrid.innerHTML = '';
  const hasAlbums = albums.length > 0;
  empty.hidden = hasAlbums;
  albumGrid.hidden = false;
  if (trackPanel) trackPanel.hidden = true;
  if (backBtn) backBtn.hidden = true;
  const backOverlay = document.getElementById('back-btn-overlay');
  if (backOverlay) backOverlay.hidden = true;
  musicHeading.textContent = 'АЛЬБОМЫ';
  activeAlbumIndex = expandIndex;

  if (!hasAlbums) {
    empty.hidden = false;
    empty.innerHTML = 'Добавьте папки альбомов в <b>music/</b> и обложки в <b>assets/covers/</b>';
    return;
  }

  const anyExpanded = expandIndex >= 0;

  /* Collapsed albums always first (above tracks); expanded album last */
  const order = albums.map((_, ai) => ai);
  if (anyExpanded) {
    order.sort((a, b) => {
      if (a === expandIndex) return 1;
      if (b === expandIndex) return -1;
      return a - b;
    });
  }

  order.forEach(ai => {
    const album = albums[ai];
    const expanded = ai === expandIndex;
    const cover = album.cover || './assets/cover2.jpg';
    const n = (album.tracks || []).length;
    const meta = [album.year || null, trackCountLabel(n)].filter(Boolean).join(' · ');

    const card = document.createElement('article');
    card.className =
      'album-card' +
      (expanded ? ' is-expanded' : '') +
      (anyExpanded && !expanded ? ' is-collapsed' : '');
    card.dataset.albumIndex = String(ai);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    card.setAttribute('aria-label', `Альбом ${album.title}`);

    card.innerHTML = `
      <div class="album-card-row">
        <div class="album-card-cover">
          <img alt="${esc(album.title)}" loading="lazy">
          <button type="button" class="album-card-play" data-album-index="${ai}"
                  aria-label="Играть ${esc(album.title)}" ${n ? '' : 'disabled'}>▶</button>
        </div>
        <div class="album-card-info">
          <h3>${esc(album.title)}</h3>
          <div class="album-card-meta">${esc(meta)}</div>
        </div>
        <span class="album-card-chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
      </div>
      <div class="album-card-tracks" ${expanded ? '' : 'hidden'}></div>`;

    const coverImg = card.querySelector('.album-card-cover img');
    if (coverImg) {
      const safeCover = safeMediaUrl(cover, 'image') || './assets/cover2.jpg';
      coverImg.src = safeCover;
      coverImg.addEventListener('error', () => {
        coverImg.src = './assets/cover2.jpg';
      }, { once: true });
    }

    const header = card.querySelector('.album-card-row');
    const tracksBox = card.querySelector('.album-card-tracks');

    const open = () => {
      if (expanded) {
        renderAlbums(-1);
      } else {
        openAlbum(ai, false);
      }
    };

    header.addEventListener('click', e => {
      if (e.target.closest('.album-card-play')) return;
      open();
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    card.querySelector('.album-card-play').addEventListener('click', e => {
      e.stopPropagation();
      if (n) toggleAlbumPlay(ai);
    });

    if (expanded) {
      tracks = (album.tracks || []).map(t => ({
        ...t,
        cover: t.cover || album.cover || './assets/cover2.jpg',
        albumTitle: album.title
      }));
      renderTracksInto(tracksBox);
    }

    albumGrid.appendChild(card);
  });

  updatePlayButtons();
}

function openAlbum(ai, autoplayFirst = false) {
  const album = albums[ai];
  if (!album) return;

  activeAlbumIndex = ai;
  tracks = (album.tracks || []).map(t => ({
    ...t,
    cover: t.cover || album.cover || './assets/cover2.jpg',
    albumTitle: album.title
  }));

  renderAlbums(ai);

  if (autoplayFirst && tracks.length) load(0, true);

  /* Keep expanded album near the top of the list area */
  requestAnimationFrame(() => {
    const card = albumGrid.querySelector(`.album-card[data-album-index="${ai}"]`);
    const stage = document.querySelector('.music-stage');
    if (card && stage) {
      const top = card.offsetTop - 12;
      stage.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  });
}

function renderTracksInto(container) {
  if (!container) return;
  container.innerHTML = '';
  container.hidden = false;

  if (!tracks.length) {
    container.innerHTML =
      '<div class="empty empty-album">В этом альбоме пока нет MP3.<br>Положите файлы в <b>music/' +
      esc(albums[activeAlbumIndex]?.folder || '') +
      '/</b></div>';
    return;
  }

  tracks.forEach((t, i) => {
    const row = document.createElement('article');
    row.className = 'track' + (sameTrack(i) ? ' active' : '');
    row.dataset.index = i;

    const volPct = Math.round((audio.volume || 0.9) * 100);

    row.innerHTML = `
      <div class="track-play-wrap">
        <button type="button" class="card-play" data-track-index="${i}" aria-label="Воспроизвести">▶</button>
        <div class="track-no">${String(i + 1).padStart(2, '0')}</div>
      </div>
      <div class="track-info">
        <h3>${esc(t.title)}</h3>
        <span class="track-duration" data-duration="${i}">—:—</span>
      </div>
      <div class="track-actions">
        <div class="track-vol" data-vol-row="${i}">
          <span class="vol-icon" aria-hidden="true">🔊</span>
          <div class="vol-bar track-vol-bar" role="slider" aria-label="Громкость" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${volPct}" tabindex="0">
            <div class="vol-fill"></div>
          </div>
        </div>
        <a class="download-card" download>⇩</a>
      </div>`;

    const fill = row.querySelector('.vol-fill');
    if (fill) fill.style.width = volPct + '%';

    const dl = row.querySelector('.download-card');
    const safeSrc = safeMediaUrl(t.src, 'audio');
    if (dl) {
      if (safeSrc) {
        dl.href = safeSrc;
        dl.setAttribute('download', '');
      } else {
        dl.removeAttribute('href');
        dl.hidden = true;
      }
    }

    container.appendChild(row);

    const probe = new Audio();
    probe.preload = 'metadata';
    if (safeSrc) probe.src = safeSrc;
    probe.addEventListener('loadedmetadata', () => {
      t.duration = probe.duration;
      const el = row.querySelector(`[data-duration="${i}"]`);
      if (el) el.textContent = fmt(t.duration);
    });

    const toggle = () => toggleTrackPlay(i);
    row.querySelector('.card-play').onclick = e => {
      e.stopPropagation();
      toggle();
    };
    row.onclick = e => {
      if (e.target.closest('a') || e.target.closest('.track-vol')) return;
      toggle();
    };

    const volBarEl = row.querySelector('.track-vol-bar');
    if (volBarEl) bindTrackVolume(volBarEl);
  });

  updatePlayButtons();
}

function renderTracks() {
  const box = albumGrid.querySelector('.album-card.is-expanded .album-card-tracks');
  if (box) renderTracksInto(box);
  else if (trackList) {
    trackList.innerHTML = '';
  }
}

function syncAllVolumeBars() {
  const p = Math.round((audio.volume || 0) * 100);
  document.querySelectorAll('.track-vol-bar').forEach(bar => {
    const fill = bar.querySelector('.vol-fill');
    if (fill) fill.style.width = p + '%';
    bar.setAttribute('aria-valuenow', String(p));
  });
  if (volFill) volFill.style.width = p + '%';
  if (volBar) volBar.setAttribute('aria-valuenow', String(p));
}

function bindTrackVolume(bar) {
  let dragging = false;
  const apply = e => {
    const p = percentFromEvent(bar, e);
    setVolUI(p);
    syncAllVolumeBars();
  };
  bar.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    apply(e);
    try { bar.setPointerCapture(e.pointerId); } catch (_) {}
  });
  bar.addEventListener('pointermove', e => {
    if (!dragging) return;
    e.preventDefault();
    apply(e);
  });
  const end = e => {
    if (!dragging) return;
    dragging = false;
    apply(e);
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
}

function absoluteUrl(path) {
  const safe = safeMediaUrl(path, 'image') || safeMediaUrl(path, 'audio') || '';
  if (!safe) {
    try {
      return new URL('./assets/cover2.jpg', location.href).href;
    } catch {
      return '';
    }
  }
  try {
    return new URL(safe, location.href).href;
  } catch {
    return '';
  }
}

function updateMediaSession(t) {
  if (!('mediaSession' in navigator) || !t) return;
  const cover = absoluteUrl(t.cover || './assets/cover2.jpg');
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: safeText(t.title || 'Velvet Veil Vortex', 120),
      artist: 'Velvet Veil Vortex',
      album: safeText(t.albumTitle || 'Velvet Veil Vortex', 120),
      artwork: [
        { src: cover, sizes: '512x512', type: 'image/jpeg' },
        { src: cover, sizes: '256x256', type: 'image/jpeg' },
        { src: absoluteUrl('./assets/cover.jpg'), sizes: '512x512', type: 'image/jpeg' }
      ]
    });
    navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
  } catch (err) {
    console.warn('MediaSession metadata failed:', err);
  }
}

function setupMediaSessionHandlers() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler('play', () => {
      audio.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      audio.pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      if (!tracks.length) return;
      if (audio.currentTime > 3) {
        applySeek(0);
        return;
      }
      load((current - 1 + tracks.length) % tracks.length, true);
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      const n = nextIndex();
      if (n >= 0) load(n, true);
    });
    navigator.mediaSession.setActionHandler('seekto', details => {
      if (details.seekTime != null && Number.isFinite(audio.duration)) {
        const pct = (details.seekTime / audio.duration) * 100;
        applySeek(pct);
      }
    });
    navigator.mediaSession.setActionHandler('seekbackward', details => {
      const skip = details.seekOffset || 10;
      if (Number.isFinite(audio.duration)) {
        const t = Math.max(0, audio.currentTime - skip);
        applySeek((t / audio.duration) * 100);
      }
    });
    navigator.mediaSession.setActionHandler('seekforward', details => {
      const skip = details.seekOffset || 10;
      if (Number.isFinite(audio.duration)) {
        const t = Math.min(audio.duration, audio.currentTime + skip);
        applySeek((t / audio.duration) * 100);
      }
    });
  } catch (err) {
    console.warn('MediaSession handlers failed:', err);
  }
}

function load(i, autoplay = false) {
  if (!tracks[i]) return;

  if (sameTrack(i)) {
    if (autoplay && audio.paused) audio.play().catch(err => console.warn(err));
    updatePlayButtons();
    updateMediaSession(tracks[i]);
    return;
  }

  current = i;
  const t = tracks[i];
  const mediaSrc = safeMediaUrl(t.src, 'audio');
  if (!mediaSrc) {
    securityLog.warn('play-blocked', {
      index: i,
      title: t.title,
      url: String(t.src || '').slice(0, 300)
    });
    return;
  }

  audio.pause();
  audio.src = mediaSrc;
  audio.load();

  if (titleEl) titleEl.textContent = safeText(t.title, 120);
  if (playerCover) {
    playerCover.src = safeMediaUrl(t.cover, 'image') || './assets/cover2.jpg';
    playerCover.onerror = () => {
      playerCover.onerror = null;
      playerCover.src = './assets/cover2.jpg';
    };
  }

  if (playerDownload) {
    playerDownload.href = mediaSrc;
    playerDownload.hidden = false;
  }

  setSeekUI(0);
  if (currentTimeEl) currentTimeEl.textContent = '0:00';
  if (durationEl) durationEl.textContent = '0:00';

  document.querySelectorAll('.track').forEach((x, n) =>
    x.classList.toggle('active', n === i)
  );

  updateMediaSession(t);

  if (autoplay) {
    const tryPlay = () => audio.play().catch(err => console.warn(err));
    if (audio.readyState >= 2) tryPlay();
    else audio.addEventListener('canplay', tryPlay, { once: true });
  }
  updatePlayButtons();
}

function toggleAlbumPlay(ai) {
  const album = albums[ai];
  if (!album || !(album.tracks || []).length) return;

  const albumSrcs = new Set(album.tracks.map(t => pathOf(t.src)));
  const currentIsFromAlbum = audio.src && albumSrcs.has(pathOf(audio.src));

  /* Always show this album's tracks + cover on screen */
  if (!audio.paused && currentIsFromAlbum) {
    audio.pause();
    openAlbum(ai, false);
    updatePlayButtons();
    return;
  }
  if (audio.paused && currentIsFromAlbum && audio.readyState >= 1) {
    openAlbum(ai, false);
    audio.play().catch(() => {});
    updatePlayButtons();
    return;
  }
  openAlbum(ai, true);
}

function toggleTrackPlay(i) {
  if (!tracks[i]) return;
  if (sameTrack(i)) {
    if (audio.paused) audio.play().catch(err => console.warn(err));
    else audio.pause();
    updatePlayButtons();
    return;
  }
  load(i, true);
}

function updatePlayButtons() {
  const playing = !audio.paused && !!audio.src;

  document.querySelectorAll('.album-card-play').forEach(btn => {
    const ai = Number(btn.dataset.albumIndex);
    const album = albums[ai];
    if (!album) return;
    const fromThis = playing && (album.tracks || []).some(t => isPlayingSrc(t.src));
    btn.textContent = fromThis ? '❚❚' : '▶';
    btn.classList.toggle('is-playing', fromThis);
  });

  document.querySelectorAll('.track').forEach((row, n) => {
    const isCurrent = sameTrack(n);
    row.classList.toggle('active', isCurrent);
    row.classList.toggle('is-playing', isCurrent && playing);
    const btn = row.querySelector('.card-play');
    if (btn) {
      btn.textContent = isCurrent && playing ? '❚❚' : '▶';
      btn.classList.toggle('is-playing', isCurrent && playing);
    }
  });
}

function nextIndex() {
  if (!tracks.length) return -1;
  if (shuffleOn) {
    if (tracks.length === 1) return 0;
    let n;
    do { n = Math.floor(Math.random() * tracks.length); } while (n === current);
    return n;
  }
  return (current + 1) % tracks.length;
}

function setNav(which) {
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === which);
  });
}

let scrollAnimId = 0;

/** Smooth scroll to absolute Y inside snapMain */
function smoothScrollToY(endY, durationMs = 520) {
  if (!snapMain) return;
  const start = snapMain.scrollTop;
  const end = Math.max(0, endY);
  const dist = end - start;
  if (Math.abs(dist) < 1) {
    snapMain.scrollTop = end;
    return;
  }

  scrollLock = true;
  if (scrollAnimId) cancelAnimationFrame(scrollAnimId);

  const duration = Math.max(260, Math.min(900, durationMs));
  const t0 = performance.now();
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const step = now => {
    const p = Math.min(1, (now - t0) / duration);
    snapMain.scrollTop = start + dist * ease(p);
    if (p < 1) {
      scrollAnimId = requestAnimationFrame(step);
    } else {
      snapMain.scrollTop = end;
      scrollLock = false;
      scrollAnimId = 0;
    }
  };
  scrollAnimId = requestAnimationFrame(step);
}

function smoothGoTo(section, durationMs = 700) {
  if (!section || !snapMain) return;
  smoothScrollToY(section.offsetTop, durationMs);
}

function goToMusic() {
  coverStep = 0;
  coverStepDir = 0;
  smoothGoTo(musicSection, 800);
  setNav('music');
}

/* Smooth cover-to-cover scrolling */
if (snapMain) {
  const io = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        if (e.isIntersecting) setNav(e.target.id === 'music' ? 'music' : 'home');
      });
    },
    { root: snapMain, threshold: 0.55 }
  );
  document.querySelectorAll('.cover').forEach(s => io.observe(s));

  let wheelGate = false;
  const getSections = () => [...document.querySelectorAll('.cover')];
  const nearestSectionIndex = () => {
    const sections = getSections();
    const y = snapMain.scrollTop;
    return sections.reduce((bestIdx, section, i) =>
      Math.abs(section.offsetTop - y) < Math.abs(sections[bestIdx].offsetTop - y) ? i : bestIdx, 0);
  };

  /* One deliberate, eased scroll between covers; no intermediate wheel steps. */
  snapMain.addEventListener('wheel', e => {
    const stage = e.target.closest('.music-stage');
    if (stage && stage.scrollHeight > stage.clientHeight + 4) {
      const atTop = stage.scrollTop <= 0 && e.deltaY < 0;
      const atBottom = stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2 && e.deltaY > 0;
      if (!atTop && !atBottom) return;
      if (atBottom && e.deltaY > 0) return;
    }
    e.preventDefault();
    if (scrollLock || wheelGate || !e.deltaY) return;
    const sections = getSections();
    const targetIdx = nearestSectionIndex() + (e.deltaY > 0 ? 1 : -1);
    if (targetIdx < 0 || targetIdx >= sections.length) return;
    wheelGate = true;
    smoothScrollToY(sections[targetIdx].offsetTop, 950);
    setTimeout(() => { wheelGate = false; }, 980);
  }, { passive: false });
}

function getNewestTrackInfo() {
  /* albums[0] = newest album; FIRST track = lead single for Listen button */
  if (!albums.length) return null;
  for (let i = 0; i < albums.length; i++) {
    const a = albums[i];
    const list = a.tracks || [];
    if (!list.length) continue;
    const t = list[0];
    return {
      albumIndex: i,
      trackIndex: 0,
      title: t.title || 'NEW TRACK',
      albumTitle: a.title || '',
      label: list.length === 1 ? 'NEW SINGLE' : 'NEW TRACK'
    };
  }
  return {
    albumIndex: 0,
    trackIndex: -1,
    title: albums[0].title || 'LISTEN',
    albumTitle: albums[0].title || '',
    label: 'NEW ALBUM'
  };
}

function updateListenButton() {
  const info = getNewestTrackInfo();
  const titleEl = document.getElementById('listen-title');
  const labelEl = document.getElementById('listen-label');
  if (!info) {
    if (titleEl) titleEl.textContent = 'LISTEN';
    if (labelEl) labelEl.textContent = 'MUSIC';
    return;
  }
  if (titleEl) titleEl.textContent = String(info.title).toUpperCase();
  if (labelEl) labelEl.textContent = info.label;
  if (listenBtn) {
    listenBtn.setAttribute(
      'aria-label',
      `Слушать ${info.title}`
    );
  }
}

if (listenBtn) {
  listenBtn.addEventListener('click', () => {
    listenBtn.classList.remove('smoke-active');
    void listenBtn.offsetWidth;
    listenBtn.classList.add('smoke-active');
    const heroSmoke = document.getElementById('hero-smoke');
    if (heroSmoke) {
      heroSmoke.classList.remove('active');
      void heroSmoke.offsetWidth;
      heroSmoke.classList.add('active');
      window.setTimeout(() => heroSmoke.classList.remove('active'), 2600);
    }
    window.setTimeout(() => listenBtn.classList.remove('smoke-active'), 1800);
    goToMusic();
    if (!albums.length) return;
    const info = getNewestTrackInfo();
    if (!info) return;
    if (info.trackIndex >= 0) {
      openAlbum(info.albumIndex, false);
      load(info.trackIndex, true);
    } else {
      openAlbum(info.albumIndex, true);
    }
  });
}

function goBackToAlbums() {
  renderAlbums(-1);
  const stage = document.querySelector('.music-stage');
  if (stage) stage.scrollTop = 0;
}

if (backBtn) backBtn.addEventListener('click', goBackToAlbums);
const backOverlayBtn = document.getElementById('back-btn-overlay');
if (backOverlayBtn) backOverlayBtn.addEventListener('click', goBackToAlbums);

playBtn.onclick = () => {
  if (current < 0) {
    const all = albums.flatMap(a =>
      (a.tracks || []).map(t => ({
        ...t,
        cover: t.cover || a.cover || './assets/cover2.jpg',
        albumTitle: a.title
      }))
    );
    if (all.length) {
      tracks = all;
      load(0, true);
    }
    return;
  }
  if (audio.paused) audio.play().catch(err => console.warn(err));
  else audio.pause();
};

prevBtn.onclick = () => {
  if (!tracks.length) return;
  if (audio.currentTime > 3) {
    applySeek(0);
    return;
  }
  load((current - 1 + tracks.length) % tracks.length, true);
};

nextBtn.onclick = () => {
  const n = nextIndex();
  if (n >= 0) load(n, true);
};

shuffleBtn.onclick = () => {
  shuffleOn = !shuffleOn;
  shuffleBtn.classList.toggle('on', shuffleOn);
};

repeatBtn.onclick = () => {
  // Только два состояния: ВЫКЛ / ВКЛ. При ВКЛ повторяется текущий трек.
  repeatMode = repeatMode === 1 ? 0 : 1;
  repeatBtn.classList.toggle('on', repeatMode === 1);
  repeatBtn.setAttribute('aria-pressed', String(repeatMode === 1));
  repeatBtn.title = repeatMode === 1 ? 'Повтор: ВКЛ' : 'Повтор: ВЫКЛ';
  audio.loop = repeatMode === 1;
};

audio.addEventListener('play', () => {
  if (playBtn) playBtn.textContent = '❚❚';
  updatePlayButtons();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'playing';
  }
  if (tracks[current]) updateMediaSession(tracks[current]);
});
audio.addEventListener('pause', () => {
  if (playBtn) playBtn.textContent = '▶';
  updatePlayButtons();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'paused';
  }
});
audio.addEventListener('loadedmetadata', () => {
  if (durationEl) durationEl.textContent = fmt(audio.duration);
  if (!isSeeking && Number.isFinite(audio.duration) && audio.duration > 0) {
    setSeekUI((audio.currentTime / audio.duration) * 100);
  }
  if (tracks[current]) updateMediaSession(tracks[current]);
});
audio.addEventListener('timeupdate', () => {
  if (isSeeking) return;
  currentTimeEl.textContent = fmt(audio.currentTime);
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    setSeekUI((audio.currentTime / audio.duration) * 100);
  }
});
audio.addEventListener('ended', () => {
  if (repeatMode === 1) return;
  if (shuffleOn || current < tracks.length - 1) {
    const n = nextIndex();
    if (n >= 0) load(n, true);
  } else {
    setSeekUI(0);
    currentTimeEl.textContent = '0:00';
    updatePlayButtons();
  }
});

/* Seek bar */
function onSeekStart(e) {
  e.preventDefault();
  isSeeking = true;
  seekBar.classList.add('is-seeking');
  const p = percentFromEvent(seekBar, e);
  setSeekUI(p);
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    currentTimeEl.textContent = fmt((audio.duration * p) / 100);
  }
  if (e.pointerId != null) {
    try { seekBar.setPointerCapture(e.pointerId); } catch (_) {}
  }
}
function onSeekMove(e) {
  if (!isSeeking) return;
  e.preventDefault();
  const p = percentFromEvent(seekBar, e);
  setSeekUI(p);
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    currentTimeEl.textContent = fmt((audio.duration * p) / 100);
  }
}
function onSeekEnd(e) {
  if (!isSeeking) return;
  if (e.cancelable) e.preventDefault();
  let finalP = seekPercent;
  try {
    const p = percentFromEvent(seekBar, e);
    if (Number.isFinite(p)) finalP = p;
  } catch (_) {}
  setSeekUI(finalP);
  applySeek(finalP);
  isSeeking = false;
  seekBar.classList.remove('is-seeking');
}
seekBar.addEventListener('pointerdown', onSeekStart);
seekBar.addEventListener('pointermove', onSeekMove);
seekBar.addEventListener('pointerup', onSeekEnd);
seekBar.addEventListener('pointercancel', onSeekEnd);
seekBar.addEventListener('touchstart', onSeekStart, { passive: false });
seekBar.addEventListener('touchmove', onSeekMove, { passive: false });
seekBar.addEventListener('touchend', onSeekEnd, { passive: false });

/* Volume */
let isVolSeeking = false;
function onVolStart(e) {
  e.preventDefault();
  isVolSeeking = true;
  setVolUI(percentFromEvent(volBar, e));
  if (e.pointerId != null) {
    try { volBar.setPointerCapture(e.pointerId); } catch (_) {}
  }
}
function onVolMove(e) {
  if (!isVolSeeking) return;
  e.preventDefault();
  setVolUI(percentFromEvent(volBar, e));
}
function onVolEnd(e) {
  if (!isVolSeeking) return;
  isVolSeeking = false;
  const p = percentFromEvent(volBar, e);
  if (Number.isFinite(p)) setVolUI(p);
}
if (volBar) {
  volBar.addEventListener('pointerdown', onVolStart);
  volBar.addEventListener('pointermove', onVolMove);
  volBar.addEventListener('pointerup', onVolEnd);
  volBar.addEventListener('pointercancel', onVolEnd);
  setVolUI(90);
}

setupMediaSessionHandlers();

/* Always start on the first cover (HOME), especially on mobile */
if (snapMain) {
  snapMain.scrollTop = 0;
  requestAnimationFrame(() => {
    snapMain.scrollTop = 0;
  });
}
if (location.hash && location.hash !== '#home') {
  /* allow deep-link only after first paint of hero */
  const hash = location.hash;
  history.replaceState(null, '', location.pathname + location.search);
  setTimeout(() => {
    if (hash === '#music' && musicSection) smoothGoTo(musicSection);
  }, 400);
}

fetch('./albums.json?' + Date.now(), { cache: 'no-store' })
  .then(r => {
    if (!r.ok) throw new Error('albums.json HTTP ' + r.status);
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct && !ct.includes('json') && !ct.includes('text') && !ct.includes('javascript')) {
      /* some static hosts omit content-type; allow empty */
    }
    return r.json();
  })
  .then(data => {
    albums = sanitizeAlbums(data);
    renderAlbums();
    updateListenButton();
  })
  .catch(err => {
    console.error('Ошибка загрузки albums.json:', err);
    empty.hidden = false;
    empty.textContent = 'Не удалось загрузить albums.json';
    albums = [];
    renderAlbums();
    updateListenButton();
  });

// Real-time audio waveform: Web Audio analyser is connected only once.
(() => {
  const canvas = document.getElementById('audio-wave');
  if (!canvas || !audio) return;
  const ctx = canvas.getContext('2d');
  let audioContext = null, analyser = null, sourceNode = null, rafId = 0;
  let freq = null, timeData = null, lastWidth = 0, lastHeight = 0;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (w !== canvas.width || h !== canvas.height) {
      canvas.width = w; canvas.height = h;
      lastWidth = rect.width; lastHeight = rect.height;
    }
  };
  const setup = async () => {
    try {
      if (!audioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        audioContext = new AudioCtx();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.68;
        sourceNode = audioContext.createMediaElementSource(audio);
        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination);
        freq = new Uint8Array(analyser.frequencyBinCount);
        timeData = new Uint8Array(analyser.fftSize);
      }
      if (audioContext.state === 'suspended') await audioContext.resume();
        resize();
      if (!rafId) draw();
    } catch (err) { console.warn('Audio visualizer unavailable:', err); }
  };
  const draw = () => {
    rafId = requestAnimationFrame(draw);
    if (!analyser || audio.paused) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    resize();
    analyser.getByteFrequencyData(freq);
    analyser.getByteTimeDomainData(timeData);
    const w = canvas.width, h = canvas.height, mid = h * .50;
    ctx.clearRect(0, 0, w, h);
    // Frequency energy adds punch on kick/snare transients; clamp to 20% cover height.
    let low = 0, lowN = Math.max(3, Math.floor(freq.length * .055));
    for (let i = 0; i < lowN; i++) low += freq[i];
    const bass = low / lowN / 255;
    const cap = Math.min(h * 0.20, h * 0.48);
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, 'rgba(46,240,255,.78)');
    gradient.addColorStop(.48, 'rgba(182,151,255,.72)');
    gradient.addColorStop(1, 'rgba(255,45,145,.8)');
    ctx.beginPath();
    const points = Math.max(40, Math.floor(w / 3));
    for (let x = 0; x <= points; x++) {
      const bin = Math.min(freq.length - 1, Math.floor((x / points) * freq.length * .72));
      const amp = freq[bin] / 255;
      const sample = timeData[Math.floor((x / points) * (timeData.length - 1))] / 128 - 1;
      const kick = bass * (x % 2 ? 1 : .78);
      const displacement = Math.min(cap, cap * (.12 + amp * .62 + Math.abs(sample) * .18 + kick * .55));
      const y = mid + Math.sin((x / points) * Math.PI * 2) * displacement;
      if (x === 0) ctx.moveTo(0, y); else ctx.lineTo((x / points) * w, y);
    }
    ctx.lineWidth = Math.max(1.4, h * .085);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = gradient;
    ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(46,240,255,.7)';
    ctx.stroke(); ctx.shadowBlur = 0;
    ctx.globalAlpha = .15;
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fillStyle = gradient; ctx.fill(); ctx.globalAlpha = 1;
  };
  audio.addEventListener('play', setup);
  audio.addEventListener('pause', () => { if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); });
  window.addEventListener('resize', resize, { passive: true });
})();

