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
let shuffleOn = false;
let repeatMode = 0;
let isSeeking = false;
let seekPercent = 0;
let activeAlbumIndex = -1;

const fmt = s =>
  !Number.isFinite(s)
    ? '0:00'
    : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])
  );

function allTracks() {
  return albums.flatMap(a =>
    (a.tracks || []).map(t => ({
      ...t,
      cover: t.cover || a.cover || './assets/cover2.png',
      albumTitle: a.title
    }))
  );
}

function setSeekUI(percent) {
  const p = Math.max(0, Math.min(100, percent));
  seekPercent = p;
  seekFill.style.width = p + '%';
  seekThumb.style.left = p + '%';
  seekBar.setAttribute('aria-valuenow', String(Math.round(p)));
}

function setVolUI(percent) {
  const p = Math.max(0, Math.min(100, percent));
  volFill.style.width = p + '%';
  volBar.setAttribute('aria-valuenow', String(Math.round(p)));
  audio.volume = p / 100;
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

/** Apply seek while track is playing — pause → set time → resume */
function applySeek(percent) {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return false;
  const t = (audio.duration * Math.max(0, Math.min(100, percent))) / 100;
  const safe = Math.min(t, Math.max(0, audio.duration - 0.15));
  const wasPlaying = !audio.paused;

  currentTimeEl.textContent = fmt(safe);
  setSeekUI((safe / audio.duration) * 100);

  const finish = () => {
    // Verify position stuck; retry once if browser ignored seek
    if (Math.abs(audio.currentTime - safe) > 1.0) {
      try { audio.currentTime = safe; } catch (_) {}
    }
    if (wasPlaying) {
      const p = audio.play();
      if (p && p.catch) p.catch(() => {});
    }
  };

  try {
    if (wasPlaying) audio.pause();

    if (typeof audio.fastSeek === 'function') {
      try { audio.fastSeek(safe); } catch (_) { audio.currentTime = safe; }
    } else {
      audio.currentTime = safe;
    }

    // Prefer seeked event; fallback timeout for stubborn browsers
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      audio.removeEventListener('seeked', once);
      finish();
    };
    audio.addEventListener('seeked', once);
    setTimeout(once, 200);
    return true;
  } catch (err) {
    console.warn('Seek failed:', err);
    if (wasPlaying) audio.play().catch(() => {});
    return false;
  }
}

function renderAlbums() {
  albumGrid.innerHTML = '';
  empty.hidden = albums.length !== 0;
  albumGrid.hidden = false;
  trackPanel.hidden = true;
  backBtn.hidden = true;
  musicHeading.textContent = 'АЛЬБОМЫ';

  albums.forEach((album, ai) => {
    const card = document.createElement('article');
    card.className = 'album-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Альбом ${album.title}`);

    const cover = album.cover || './assets/cover2.png';
    const n = (album.tracks || []).length;

    card.innerHTML = `
      <div class="album-card-cover">
        <img src="${esc(cover)}" alt="${esc(album.title)}"
             onerror="this.onerror=null;this.src='./assets/cover2.png'">
        <button type="button" class="album-card-play" aria-label="Играть ${esc(album.title)}">▶</button>
      </div>
      <div class="album-card-info">
        <h3>${esc(album.title)}</h3>
        <div class="album-card-meta">${album.year ? esc(album.year) + ' · ' : ''}${n} ${n === 1 ? 'трек' : n < 5 ? 'трека' : 'треков'}</div>
      </div>`;

    const open = () => openAlbum(ai);
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    const playBtnAlbum = card.querySelector('.album-card-play');
    playBtnAlbum.dataset.albumIndex = String(ai);
    playBtnAlbum.addEventListener('click', e => {
      e.stopPropagation();
      toggleAlbumPlay(ai);
    });

    albumGrid.appendChild(card);
  });
}

function openAlbum(ai, autoplayFirst = false) {
  const album = albums[ai];
  if (!album) return;

  activeAlbumIndex = ai;
  tracks = (album.tracks || []).map(t => ({
    ...t,
    cover: t.cover || album.cover || './assets/cover2.png',
    albumTitle: album.title
  }));

  albumGrid.hidden = true;
  trackPanel.hidden = false;
  backBtn.hidden = false;
  musicHeading.textContent = album.title;

  document.getElementById('album-banner-cover').src = album.cover || './assets/cover2.png';
  document.getElementById('album-banner-title').textContent = album.title;
  document.getElementById('album-banner-year').textContent = album.year || '';
  document.getElementById('album-banner-count').textContent =
    tracks.length
      ? `${tracks.length} ${tracks.length === 1 ? 'ТРЕК' : tracks.length < 5 ? 'ТРЕКА' : 'ТРЕКОВ'}`
      : '';

  renderTracks();
  if (autoplayFirst && tracks.length) load(0, true);

  const stage = document.querySelector('.music-stage');
  if (stage) stage.scrollTop = 0;
}

function renderTracks() {
  trackList.innerHTML = '';
  tracks.forEach((t, i) => {
    const row = document.createElement('article');
    row.className = 'track' + (i === current ? ' active' : '');
    row.dataset.index = i;

    row.innerHTML = `
      <div class="track-no">${String(i + 1).padStart(2, '0')}</div>
      <div class="track-info">
        <h3>${esc(t.title)}</h3>
        <span class="track-duration" data-duration="${i}">—:—</span>
      </div>
      <div class="track-actions">
        <button type="button" class="card-play">▶</button>
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

    const btn = row.querySelector('.card-play');
    btn.dataset.trackIndex = String(i);
    const toggle = () => toggleTrackPlay(i);
    btn.onclick = e => {
      e.stopPropagation();
      toggle();
    };
    row.onclick = e => {
      if (e.target.closest('a')) return;
      toggle();
    };
  });
}

function sameTrack(i) {
  if (i !== current || !tracks[i]) return false;
  if (!audio.src) return false;
  try {
    const want = new URL(tracks[i].src, location.href).pathname;
    const have = new URL(audio.src, location.href).pathname;
    return decodeURIComponent(want) === decodeURIComponent(have);
  } catch {
    return false;
  }
}

function load(i, autoplay = false) {
  if (!tracks[i]) return;

  // Same track already loaded — don't reset position
  if (sameTrack(i)) {
    if (autoplay && audio.paused) {
      audio.play().catch(err => console.warn('Playback failed:', err));
    }
    document.querySelectorAll('.track').forEach((x, n) =>
      x.classList.toggle('active', n === i)
    );
    return;
  }

  current = i;
  const t = tracks[i];

  // Pause before changing src to avoid glitches
  audio.pause();
  audio.src = t.src;
  // preload=auto helps seeking on many browsers
  audio.load();

  titleEl.textContent = t.title;
  playerCover.src = t.cover || './assets/cover2.png';
  playerCover.onerror = () => {
    playerCover.onerror = null;
    playerCover.src = './assets/cover2.png';
  };

  playerDownload.href = t.src;
  playerDownload.hidden = false;

  setSeekUI(0);
  currentTimeEl.textContent = '0:00';
  durationEl.textContent = '0:00';

  document.querySelectorAll('.track').forEach((x, n) =>
    x.classList.toggle('active', n === i)
  );

  if (autoplay) {
    const tryPlay = () => {
      audio.play().catch(err => console.warn('Playback failed:', err));
    };
    if (audio.readyState >= 2) {
      tryPlay();
    } else {
      audio.addEventListener('canplay', tryPlay, { once: true });
    }
  }
}


function pathOf(src) {
  try {
    return decodeURIComponent(new URL(src, location.href).pathname);
  } catch {
    return src;
  }
}

function isPlayingSrc(src) {
  if (!audio.src || !src) return false;
  return pathOf(audio.src) === pathOf(src);
}

/** Album ▶ button: play first track / pause / resume */
function toggleAlbumPlay(ai) {
  const album = albums[ai];
  if (!album || !(album.tracks || []).length) return;

  const albumSrcs = new Set((album.tracks || []).map(t => pathOf(t.src)));
  const currentIsFromAlbum = audio.src && albumSrcs.has(pathOf(audio.src));

  // Playing a track from this album → pause
  if (!audio.paused && currentIsFromAlbum) {
    audio.pause();
    updatePlayButtons();
    return;
  }

  // Paused on a track from this album → resume
  if (audio.paused && currentIsFromAlbum && audio.readyState >= 1) {
    audio.play().catch(() => {});
    updatePlayButtons();
    return;
  }

  // Otherwise open album and start first track
  openAlbum(ai, true);
}

/** Track ▶ button: play / pause toggle */
function toggleTrackPlay(i) {
  if (!tracks[i]) return;

  if (sameTrack(i)) {
    if (audio.paused) {
      audio.play().catch(err => console.warn('Playback failed:', err));
    } else {
      audio.pause();
    }
    updatePlayButtons();
    return;
  }
  load(i, true);
}

function updatePlayButtons() {
  const playing = !audio.paused && !!audio.src;

  // Main player button handled by play/pause events

  // Album cards
  document.querySelectorAll('.album-card-play').forEach(btn => {
    const ai = Number(btn.dataset.albumIndex);
    const album = albums[ai];
    if (!album) return;
    const fromThis =
      playing &&
      album.tracks &&
      album.tracks.some(t => isPlayingSrc(t.src));
    btn.textContent = fromThis ? '❚❚' : '▶';
    btn.classList.toggle('is-playing', fromThis);
    btn.setAttribute('aria-label', fromThis ? 'Пауза' : `Играть ${album.title}`);
  });

  // Track rows
  document.querySelectorAll('.track .card-play').forEach(btn => {
    const i = Number(btn.dataset.trackIndex);
    const on = playing && sameTrack(i);
    btn.textContent = on ? '❚❚' : '▶';
    btn.classList.toggle('is-playing', on);
  });
}

function nextIndex() {

  if (!tracks.length) return -1;
  if (shuffleOn) {
    if (tracks.length === 1) return 0;
    let n;
    do {
      n = Math.floor(Math.random() * tracks.length);
    } while (n === current);
    return n;
  }
  return (current + 1) % tracks.length;
}

function goToMusic() {
  smoothGoTo(musicSection);
  setNav('music');
}

function setNav(which) {
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === which);
  });
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
}

listenBtn.addEventListener('click', () => {
  goToMusic();
  if (!albums.length) return;
  if (albums[0].tracks && albums[0].tracks.length) {
    openAlbum(0, true);
  } else {
    tracks = allTracks();
    if (tracks.length) load(0, true);
  }
});

backBtn.addEventListener('click', () => {
  renderAlbums();
  const stage = document.querySelector('.music-stage');
  if (stage) stage.scrollTop = 0;
});

playBtn.onclick = () => {
  if (current < 0) {
    if (!tracks.length) tracks = allTracks();
    if (tracks.length) {
      load(0, true);
      return;
    }
    return;
  }
  if (audio.paused) {
    audio.play().catch(err => console.warn('Playback failed:', err));
  } else {
    audio.pause();
  }
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
  repeatBtn.title = repeatMode === 2 ? 'Repeat one' : repeatMode === 1 ? 'Repeat all' : 'Repeat off';
  audio.loop = repeatMode === 2;
};

audio.addEventListener('play', () => {
  playBtn.textContent = '❚❚';
  updatePlayButtons();
});
audio.addEventListener('pause', () => {
  playBtn.textContent = '▶';
  updatePlayButtons();
});

audio.addEventListener('loadedmetadata', () => {
  durationEl.textContent = fmt(audio.duration);
  if (!isSeeking) {
    setSeekUI(audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0);
  }
});

audio.addEventListener('durationchange', () => {
  if (Number.isFinite(audio.duration)) {
    durationEl.textContent = fmt(audio.duration);
  }
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
  }
});

/* ── Custom seek bar (pointer + touch) ── */
function onSeekStart(e) {
  e.preventDefault();
  isSeeking = true;
  seekBar.classList.add('is-seeking');
  const p = percentFromEvent(seekBar, e);
  setSeekUI(p);
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    currentTimeEl.textContent = fmt((audio.duration * p) / 100);
  }
  // Capture so move works outside element
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
  // Use last drag position; also recompute from event when possible
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

// Fallback touch for older mobile browsers
seekBar.addEventListener('touchstart', onSeekStart, { passive: false });
seekBar.addEventListener('touchmove', onSeekMove, { passive: false });
seekBar.addEventListener('touchend', onSeekEnd, { passive: false });

// Keyboard
seekBar.addEventListener('keydown', e => {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
  let p = seekPercent;
  if (e.key === 'ArrowRight') p = Math.min(100, p + 2);
  else if (e.key === 'ArrowLeft') p = Math.max(0, p - 2);
  else if (e.key === 'Home') p = 0;
  else if (e.key === 'End') p = 100;
  else return;
  e.preventDefault();
  applySeek(p);
});

/* ── Volume bar ── */
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

volBar.addEventListener('pointerdown', onVolStart);
volBar.addEventListener('pointermove', onVolMove);
volBar.addEventListener('pointerup', onVolEnd);
volBar.addEventListener('pointercancel', onVolEnd);

// Init volume
setVolUI(90);


/* ── Smooth full-page cover transitions ── */
let scrollLock = false;

function smoothGoTo(section) {
  if (!section || !snapMain) return;
  scrollLock = true;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => { scrollLock = false; }, 700);
}

if (snapMain) {
  let wheelAcc = 0;
  let wheelTimer = null;
  snapMain.addEventListener(
    'wheel',
    e => {
      // Don't hijack when scrolling inside music panel
      const stage = e.target.closest('.music-stage');
      if (stage && stage.scrollHeight > stage.clientHeight + 4) {
        const atTop = stage.scrollTop <= 0 && e.deltaY < 0;
        const atBottom =
          stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2 && e.deltaY > 0;
        if (!atTop && !atBottom) return;
        if (atBottom && e.deltaY > 0) return; // stay in music
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
        if (d < best) {
          best = d;
          idx = i;
        }
      });
      const next = sections[idx + dir];
      if (next) smoothGoTo(next);
    },
    { passive: false }
  );
}


fetch('./albums.json?' + Date.now(), { cache: 'no-store' })
  .then(r => (r.ok ? r.json() : []))
  .then(data => {
    albums = (Array.isArray(data) ? data : []).map(a => ({
      id: a.id || (a.title || '').toLowerCase().replace(/\s+/g, '-'),
      title: a.title || 'Без названия',
      cover: a.cover || './assets/cover2.png',
      year: a.year || '',
      tracks: (a.tracks || []).map(t => ({
        title: t.title || 'Трек',
        src: t.src,
        cover: t.cover
      }))
    }));
    renderAlbums();
  })
  .catch(err => {
    console.error('Ошибка загрузки albums.json:', err);
    renderAlbums();
  });
