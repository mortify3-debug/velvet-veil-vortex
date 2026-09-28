const audio = document.getElementById('audio');
const list = document.getElementById('track-list');
const empty = document.getElementById('empty');
const count = document.getElementById('track-count');
const playBtn = document.getElementById('play');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const seek = document.getElementById('seek');
const currentTime = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const titleEl = document.getElementById('player-title');
const playerCover = document.getElementById('player-cover');
const playerDownload = document.getElementById('player-download');

let tracks = [];
let current = -1;

const fmt = s => !Number.isFinite(s)
  ? '0:00'
  : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const cleanTitle = n =>
  n.replace(/\.[^.]+$/, '')
   .replace(/^\s*\d+\s*[-_.]\s*/, '')
   .trim() || n;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
}[c]));

function render() {
  list.innerHTML = '';
  count.textContent = tracks.length
    ? `${tracks.length} ${tracks.length === 1 ? 'ТРЕК' : 'ТРЕКОВ'}`
    : '';
  empty.hidden = tracks.length !== 0;

  tracks.forEach((t, i) => {
    const card = document.createElement('article');
    card.className = 'track';
    card.dataset.index = i;

    const cover = t.cover || './assets/cover.png';

    card.innerHTML = `
      <div class="track-cover">
        <img src="${esc(cover)}" alt="${esc(t.title)}" onerror="this.onerror=null;this.src='./assets/cover.png'">
        <button class="mini-play" aria-label="Воспроизвести ${esc(t.title)}">▶</button>
      </div>
      <div class="track-info">
        <div class="track-no">${String(i + 1).padStart(2, '0')}</div>
        <h3>${esc(t.title)}</h3>
        <span class="track-duration" data-duration="${i}">—:—</span>
      </div>
      <div class="track-actions">
        <button class="card-play">▶ СЛУШАТЬ</button>
        <a class="download-card" href="${esc(t.src)}" download>⇩ СКАЧАТЬ</a>
      </div>`;

    list.appendChild(card);

    const probe = new Audio();
    probe.preload = 'metadata';
    probe.src = t.src;
    probe.addEventListener('loadedmetadata', () => {
      t.duration = probe.duration;
      const el = card.querySelector(`[data-duration="${i}"]`);
      if (el) el.textContent = fmt(t.duration);
    });

    card.querySelector('.mini-play').onclick = () => load(i, true);
    card.querySelector('.card-play').onclick = () => load(i, true);
  });
}

function load(i, autoplay = false) {
  if (!tracks[i]) return;

  current = i;
  const t = tracks[i];

  audio.src = t.src;
  audio.load();

  titleEl.textContent = t.title;
  playerCover.src = t.cover || './assets/cover.png';
  playerCover.onerror = () => {
    playerCover.onerror = null;
    playerCover.src = './assets/cover.png';
  };

  playerDownload.href = t.src;
  playerDownload.hidden = false;

  document.querySelectorAll('.track').forEach((x, n) =>
    x.classList.toggle('active', n === i)
  );

  if (autoplay) audio.play().catch(err => console.warn('Не удалось начать воспроизведение:', err));
}

playBtn.onclick = () => {
  if (current < 0 && tracks.length) {
    load(0, true);
    return;
  }
  audio.paused ? audio.play() : audio.pause();
};

prevBtn.onclick = () => {
  if (tracks.length) load((current - 1 + tracks.length) % tracks.length, true);
};

nextBtn.onclick = () => {
  if (tracks.length) load((current + 1) % tracks.length, true);
};

audio.addEventListener('play', () => playBtn.textContent = '❚❚');
audio.addEventListener('pause', () => playBtn.textContent = '▶');

audio.addEventListener('loadedmetadata', () => {
  durationEl.textContent = fmt(audio.duration);
  seek.value = 0;
});

audio.addEventListener('timeupdate', () => {
  currentTime.textContent = fmt(audio.currentTime);
  if (Number.isFinite(audio.duration) && audio.duration > 0 && !seek.matches(':active')) {
    seek.value = (audio.currentTime / audio.duration) * 100;
  }
});

audio.addEventListener('ended', () => {
  if (tracks.length) load((current + 1) % tracks.length, true);
});

// Перемотка мышью и пальцем.
// input срабатывает во время перетаскивания, change — после отпускания.
function seekTo(value) {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const v = Math.max(0, Math.min(100, Number(value)));
  audio.currentTime = audio.duration * v / 100;
}

seek.addEventListener('input', e => seekTo(e.target.value));
seek.addEventListener('change', e => seekTo(e.target.value));
seek.addEventListener('pointerdown', e => {
  seek.setPointerCapture?.(e.pointerId);
});
seek.addEventListener('pointermove', e => {
  if (e.buttons) seekTo(seek.value);
});

fetch('./songs.json?' + Date.now(), { cache: 'no-store' })
  .then(r => r.ok ? r.json() : [])
  .then(data => {
    tracks = (Array.isArray(data) ? data : []).map(x =>
      typeof x === 'string'
        ? { src: x, title: cleanTitle(x.split('/').pop()), cover: './assets/cover.png' }
        : {
            ...x,
            title: x.title || cleanTitle((x.src || '').split('/').pop()),
            cover: x.cover || './assets/cover.png'
          }
    );
    render();
  })
  .catch(err => {
    console.error('Ошибка загрузки songs.json:', err);
    render();
  });
