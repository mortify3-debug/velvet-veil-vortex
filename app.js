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
const seek = document.getElementById('seek');
const volume = document.getElementById('volume');
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
let repeatMode = 0; // 0 off, 1 all, 2 one
let isSeeking = false;
let wasPlayingBeforeSeek = false;

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
    card.querySelector('.album-card-play').addEventListener('click', e => {
      e.stopPropagation();
      openAlbum(ai, true);
    });

    albumGrid.appendChild(card);
  });
}

function openAlbum(ai, autoplayFirst = false) {
  const album = albums[ai];
  if (!album) return;

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

    const play = () => load(i, true);
    row.querySelector('.card-play').onclick = e => {
      e.stopPropagation();
      play();
    };
    row.onclick = e => {
      if (e.target.closest('a')) return;
      play();
    };
  });
}

function load(i, autoplay = false) {
  if (!tracks[i]) return;

  // Same track: just play/pause, don't reload (preserves seek position)
  if (i === current && audio.src && audio.src.includes(tracks[i].src.replace(/^\.\//, ''))) {
    if (autoplay && audio.paused) {
      audio.play().catch(err => console.warn('Playback failed:', err));
    }
    return;
  }

  current = i;
  const t = tracks[i];

  const nextSrc = t.src;
  // Only reset src if different file
  const abs = new URL(nextSrc, location.href).href;
  if (audio.src !== abs) {
    audio.src = nextSrc;
    audio.load();
  }

  titleEl.textContent = t.title;
  playerCover.src = t.cover || './assets/cover2.png';
  playerCover.onerror = () => {
    playerCover.onerror = null;
    playerCover.src = './assets/cover2.png';
  };

  playerDownload.href = t.src;
  playerDownload.hidden = false;

  document.querySelectorAll('.track').forEach((x, n) =>
    x.classList.toggle('active', n === i)
  );

  if (autoplay) {
    const tryPlay = () => {
      audio.play().catch(err => console.warn('Playback failed:', err));
    };
    if (audio.readyState >= 1) {
      tryPlay();
    } else {
      audio.addEventListener('loadedmetadata', tryPlay, { once: true });
    }
  }
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
  musicSection.scrollIntoView({ behavior: 'smooth' });
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
    audio.currentTime = 0;
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
});
audio.addEventListener('pause', () => {
  playBtn.textContent = '▶';
});

audio.addEventListener('loadedmetadata', () => {
  durationEl.textContent = fmt(audio.duration);
  if (!isSeeking && audio.currentTime < 0.05) {
    seek.value = 0;
  } else if (Number.isFinite(audio.duration) && audio.duration > 0) {
    seek.value = (audio.currentTime / audio.duration) * 100;
  }
});

audio.addEventListener('timeupdate', () => {
  if (isSeeking) return;
  currentTimeEl.textContent = fmt(audio.currentTime);
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    seek.value = (audio.currentTime / audio.duration) * 100;
  }
});

audio.addEventListener('ended', () => {
  if (repeatMode === 2) return;
  if (repeatMode === 1 || shuffleOn || current < tracks.length - 1) {
    const n = nextIndex();
    if (n >= 0) load(n, true);
  }
});

/* ── Seek (scrubbing) ── */
function seekTo(percent) {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return false;
  const v = Math.max(0, Math.min(100, Number(percent)));
  const t = (audio.duration * v) / 100;
  try {
    audio.currentTime = t;
    currentTimeEl.textContent = fmt(t);
    seek.value = String(v);
    return true;
  } catch (err) {
    console.warn('Seek failed:', err);
    return false;
  }
}

function beginSeek(e) {
  isSeeking = true;
  wasPlayingBeforeSeek = !audio.paused;
  // Don't pause — keep playing while scrubbing when possible
  if (e && e.pointerId != null) {
    try { seek.setPointerCapture(e.pointerId); } catch (_) {}
  }
}

function endSeek() {
  if (!isSeeking) return;
  seekTo(seek.value);
  isSeeking = false;
  // Ensure playback continues if it was playing
  if (wasPlayingBeforeSeek && audio.paused) {
    audio.play().catch(() => {});
  }
}

seek.addEventListener('pointerdown', e => {
  beginSeek(e);
  // Immediate seek on click position
  seekTo(seek.value);
});

seek.addEventListener('input', e => {
  isSeeking = true;
  const v = Number(e.target.value);
  // Live preview of time while dragging (don't force currentTime every frame on slow devices —
  // but do set it so audio actually scrubs)
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    const t = (audio.duration * v) / 100;
    currentTimeEl.textContent = fmt(t);
    // Apply seek during drag for responsive scrubbing
    if (Math.abs(audio.currentTime - t) > 0.25) {
      try { audio.currentTime = t; } catch (_) {}
    }
  }
});

seek.addEventListener('change', () => {
  seekTo(seek.value);
  isSeeking = false;
  if (wasPlayingBeforeSeek && audio.paused) {
    audio.play().catch(() => {});
  }
});

seek.addEventListener('pointerup', endSeek);
seek.addEventListener('pointercancel', endSeek);
seek.addEventListener('touchend', endSeek);
seek.addEventListener('mouseup', endSeek);

// Keyboard support
seek.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    isSeeking = true;
  }
});
seek.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    seekTo(seek.value);
    isSeeking = false;
  }
});

if (volume) {
  audio.volume = volume.value / 100;
  volume.addEventListener('input', () => {
    audio.volume = volume.value / 100;
  });
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
