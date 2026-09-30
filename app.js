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

function renderAlbums() {
  albumGrid.innerHTML = '';
  const hasAlbums = albums.length > 0;
  empty.hidden = hasAlbums;
  albumGrid.hidden = false;
  trackPanel.hidden = true;
  backBtn.hidden = true;
  musicHeading.textContent = 'АЛЬБОМЫ';

  if (!hasAlbums) {
    empty.hidden = false;
    empty.innerHTML = 'Добавьте папки альбомов в <b>music/</b> и обложки в <b>assets/covers/</b>';
    return;
  }

  albums.forEach((album, ai) => {
    const card = document.createElement('article');
    card.className = 'album-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Альбом ${album.title}`);

    const cover = album.cover || './assets/cover2.jpg';
    const n = (album.tracks || []).length;
    const meta = [
      album.year || null,
      n ? `${n} ${n === 1 ? 'трек' : n < 5 ? 'трека' : 'треков'}` : 'нет треков'
    ].filter(Boolean).join(' · ');

    card.innerHTML = `
      <div class="album-card-cover">
        <img src="${esc(cover)}" alt="${esc(album.title)}"
             loading="lazy"
             onerror="this.onerror=null;this.src='./assets/cover2.jpg'">
        <button type="button" class="album-card-play" data-album-index="${ai}"
                aria-label="Играть ${esc(album.title)}" ${n ? '' : 'disabled'}>▶</button>
      </div>
      <div class="album-card-info">
        <h3>${esc(album.title)}</h3>
        <div class="album-card-meta">${esc(meta)}</div>
      </div>`;

    const open = () => openAlbum(ai);
    card.addEventListener('click', open);
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

  albumGrid.hidden = true;
  trackPanel.hidden = false;
  backBtn.hidden = false;
  musicHeading.textContent = album.title;

  document.getElementById('album-banner-cover').src = album.cover || './assets/cover2.jpg';
  document.getElementById('album-banner-title').textContent = album.title;
  document.getElementById('album-banner-year').textContent = album.year || '';
  document.getElementById('album-banner-count').textContent = tracks.length
    ? `${tracks.length} ${tracks.length === 1 ? 'ТРЕК' : tracks.length < 5 ? 'ТРЕКА' : 'ТРЕКОВ'}`
    : 'НЕТ ТРЕКОВ';

  renderTracks();
  if (autoplayFirst && tracks.length) load(0, true);

  /* Scroll album view to top of the screen */
  if (musicSection) smoothGoTo(musicSection);
  const stage = document.querySelector('.music-stage');
  if (stage) {
    stage.scrollTop = 0;
    requestAnimationFrame(() => { stage.scrollTop = 0; });
  }
}

function renderTracks() {
  trackList.innerHTML = '';

  if (!tracks.length) {
    trackList.innerHTML =
      '<div class="empty" style="padding:24px 8px">В этом альбоме пока нет MP3.<br>Положите файлы в <b>music/' +
      esc(albums[activeAlbumIndex]?.folder || '') +
      '/</b></div>';
    return;
  }

  tracks.forEach((t, i) => {
    const row = document.createElement('article');
    row.className = 'track' + (sameTrack(i) && !audio.paused ? ' active' : '');
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
            <div class="vol-fill" style="width:${volPct}%"></div>
          </div>
        </div>
        <a class="download-card" href="${esc(t.src)}" download>⇩</a>
      </div>`;

    trackList.appendChild(row);

    const probe = new Audio();
    probe.preload = 'metadata';
    probe.src = t.src;
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
  try {
    return new URL(path, location.href).href;
  } catch {
    return path;
  }
}

function updateMediaSession(t) {
  if (!('mediaSession' in navigator) || !t) return;
  const cover = absoluteUrl(t.cover || './assets/cover2.jpg');
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title || 'Velvet Veil Vortex',
      artist: 'Velvet Veil Vortex',
      album: t.albumTitle || 'Velvet Veil Vortex',
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

  audio.pause();
  audio.src = t.src;
  audio.load();

  if (titleEl) titleEl.textContent = t.title;
  if (playerCover) {
    playerCover.src = t.cover || './assets/cover2.jpg';
    playerCover.onerror = () => {
      playerCover.onerror = null;
      playerCover.src = './assets/cover2.jpg';
    };
  }

  if (playerDownload) {
    playerDownload.href = t.src;
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

  if (!audio.paused && currentIsFromAlbum) {
    audio.pause();
    updatePlayButtons();
    return;
  }
  if (audio.paused && currentIsFromAlbum && audio.readyState >= 1) {
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

function smoothGoTo(section) {
  if (!section || !snapMain) return;
  scrollLock = true;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => { scrollLock = false; }, 700);
}

function goToMusic() {
  smoothGoTo(musicSection);
  setNav('music');
}

if (snapMain) {
  const io = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        if (e.isIntersecting) setNav(e.target.id === 'music' ? 'music' : 'home');
      });
    },
    { root: snapMain, threshold: 0.5 }
  );
  document.querySelectorAll('.cover').forEach(s => io.observe(s));

  let wheelAcc = 0;
  let wheelTimer = null;
  snapMain.addEventListener(
    'wheel',
    e => {
      const stage = e.target.closest('.music-stage');
      if (stage && stage.scrollHeight > stage.clientHeight + 4) {
        const atTop = stage.scrollTop <= 0 && e.deltaY < 0;
        const atBottom =
          stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2 && e.deltaY > 0;
        if (!atTop && !atBottom) return;
        if (atBottom && e.deltaY > 0) return;
      }
      if (scrollLock) {
        e.preventDefault();
        return;
      }
      wheelAcc += e.deltaY;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelAcc = 0; }, 200);
      if (Math.abs(wheelAcc) < 40) return;
      e.preventDefault();
      const dir = wheelAcc > 0 ? 1 : -1;
      wheelAcc = 0;
      const sections = [...document.querySelectorAll('.cover')];
      const y = snapMain.scrollTop;
      let idx = 0;
      let best = Infinity;
      sections.forEach((s, i) => {
        const d = Math.abs(s.offsetTop - y);
        if (d < best) { best = d; idx = i; }
      });
      const next = sections[idx + dir];
      if (next) smoothGoTo(next);
    },
    { passive: false }
  );
}

listenBtn.addEventListener('click', () => {
  goToMusic();
  if (!albums.length) return;
  const withTracks = albums.findIndex(a => a.tracks && a.tracks.length);
  if (withTracks >= 0) openAlbum(withTracks, true);
});

backBtn.addEventListener('click', () => {
  renderAlbums();
  const stage = document.querySelector('.music-stage');
  if (stage) stage.scrollTop = 0;
});

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
  repeatMode = (repeatMode + 1) % 3;
  repeatBtn.classList.toggle('on', repeatMode > 0);
  audio.loop = repeatMode === 2;
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
  if (repeatMode === 2) return;
  if (repeatMode === 1 || shuffleOn || current < tracks.length - 1) {
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
    return r.json();
  })
  .then(data => {
    albums = (Array.isArray(data) ? data : []).map(a => ({
      id: a.id || (a.title || '').toLowerCase().replace(/\s+/g, '-'),
      title: a.title || 'Без названия',
      cover: a.cover || './assets/cover2.jpg',
      year: a.year || '',
      folder: a.folder || a.title || '',
      tracks: Array.isArray(a.tracks) ? a.tracks : []
    }));
    renderAlbums();
  })
  .catch(err => {
    console.error('Ошибка загрузки albums.json:', err);
    empty.hidden = false;
    empty.textContent = 'Не удалось загрузить albums.json';
    renderAlbums();
  });
