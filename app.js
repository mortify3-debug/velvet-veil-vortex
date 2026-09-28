const audio = document.getElementById('audio');
const listEl = document.getElementById('trackList');
const emptyEl = document.getElementById('emptyState');
const nowTitle = document.getElementById('nowTitle');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const progress = document.getElementById('progress');
const volume = document.getElementById('volume');
const currentTime = document.getElementById('currentTime');
const duration = document.getElementById('duration');
const downloadCurrent = document.getElementById('downloadCurrent');

let tracks = [];
let current = -1;

const fmt = s => {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

const titleOf = file => file.replace(/\.mp3$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Без названия';
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

async function loadTracks() {
  try {
    const response = await fetch(`songs.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('songs.json not found');
    tracks = await response.json();
  } catch {
    tracks = [];
  }
  render();
  if (tracks.length) selectTrack(0, false);
}

function render() {
  listEl.innerHTML = '';
  emptyEl.hidden = tracks.length > 0;
  tracks.forEach((track, index) => {
    const row = document.createElement('div');
    row.className = `track${index === current ? ' selected' : ''}`;
    row.tabIndex = 0;
    row.innerHTML = `
      <div class="track-number">${String(index + 1).padStart(2, '0')}</div>
      <div>
        <div class="track-title">${escapeHtml(track.title || titleOf(track.file))}</div>
        <div class="track-file">MP3 • Velvet Veil Vortex</div>
      </div>
      <div class="track-actions">
        <div class="track-time">${track.size || ''}</div>
        <a class="download-btn" href="${escapeHtml(track.url)}" download="${escapeHtml(track.file)}" aria-label="Скачать ${escapeHtml(track.title || titleOf(track.file))}" title="Скачать MP3">⇩</a>
      </div>`;
    row.onclick = () => selectTrack(index, true);
    row.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTrack(index, true); }
    };
    listEl.appendChild(row);
  });
}

function selectTrack(index, autoplay) {
  if (!tracks[index]) return;
  current = index;
  const track = tracks[index];
  audio.src = track.url;
  nowTitle.textContent = track.title || titleOf(track.file);
  downloadCurrent.href = track.url;
  downloadCurrent.download = track.file;
  progress.value = 0;
  currentTime.textContent = '0:00';
  duration.textContent = '0:00';
  render();
  if (autoplay) audio.play().catch(() => {});
  updatePlayIcon();
}

function updatePlayIcon() {
  playBtn.textContent = audio.paused ? '▶' : 'Ⅱ';
  playBtn.setAttribute('aria-label', audio.paused ? 'Воспроизвести' : 'Пауза');
}

playBtn.onclick = () => {
  if (!audio.src && tracks.length) selectTrack(0, false);
  if (!audio.src) return;
  audio.paused ? audio.play().catch(() => {}) : audio.pause();
};
prevBtn.onclick = () => tracks.length && selectTrack((current - 1 + tracks.length) % tracks.length, true);
nextBtn.onclick = () => tracks.length && selectTrack((current + 1) % tracks.length, true);

audio.addEventListener('play', updatePlayIcon);
audio.addEventListener('pause', updatePlayIcon);
audio.addEventListener('ended', () => tracks.length && selectTrack((current + 1) % tracks.length, true));
audio.addEventListener('loadedmetadata', () => duration.textContent = fmt(audio.duration));
audio.addEventListener('timeupdate', () => {
  if (audio.duration) {
    progress.value = audio.currentTime / audio.duration * 100;
    currentTime.textContent = fmt(audio.currentTime);
  }
});
progress.oninput = () => { if (audio.duration) audio.currentTime = progress.value / 100 * audio.duration; };
volume.oninput = () => audio.volume = Number(volume.value);
audio.volume = 0.8;

document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', () => {
  document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
  link.classList.add('active');
}));

loadTracks();
