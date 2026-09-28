const audio = document.getElementById('audio');
const list = document.getElementById('trackList');
const empty = document.getElementById('emptyState');
const now = document.getElementById('nowTitle');
const play = document.getElementById('play');
const prev = document.getElementById('prev');
const next = document.getElementById('next');
const seek = document.getElementById('seek');
const cur = document.getElementById('cur');
const dur = document.getElementById('dur');
const vol = document.getElementById('volume');
const download = document.getElementById('download');

let tracks = [];
let index = -1;

const fmt = s => Number.isFinite(s) ? `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}` : '0:00';
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

async function loadTracks() {
  try {
    const response = await fetch('./songs.json?v=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('songs.json not found');
    const data = await response.json();
    tracks = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(error);
    tracks = [];
  }
  render();
  if (tracks.length) select(0, false);
}

function render() {
  list.innerHTML = '';
  empty.hidden = tracks.length > 0;
  tracks.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'track' + (i === index ? ' selected' : '');
    el.innerHTML = `<div class="num">${String(i+1).padStart(2,'0')}</div>
      <div class="track-info"><div class="title">${esc(t.title)}</div><div class="sub">MP3 • Velvet Veil Vortex</div></div>
      <div class="actions"><span class="size">${esc(t.size || '')}</span><a class="dl" href="${esc(t.url)}" download="${esc(t.file)}" title="Скачать MP3" aria-label="Скачать MP3">⇩</a></div>`;
    el.addEventListener('click', e => { if (!e.target.closest('a')) select(i, true); });
    list.appendChild(el);
  });
}

function select(i, auto) {
  if (!tracks[i]) return;
  index = i;
  const t = tracks[i];
  audio.src = t.url;
  now.textContent = t.title;
  download.href = t.url;
  download.download = t.file;
  seek.value = 0;
  cur.textContent = '0:00';
  dur.textContent = '0:00';
  render();
  if (auto) audio.play().catch(() => {});
  updateIcon();
}

function updateIcon() { play.textContent = audio.paused ? '▶' : 'Ⅱ'; }

play.onclick = () => {
  if (!audio.src && tracks.length) select(0, false);
  if (audio.src) audio.paused ? audio.play() : audio.pause();
};
prev.onclick = () => tracks.length && select((index - 1 + tracks.length) % tracks.length, true);
next.onclick = () => tracks.length && select((index + 1) % tracks.length, true);
audio.onplay = updateIcon;
audio.onpause = updateIcon;
audio.onended = () => tracks.length && select((index + 1) % tracks.length, true);
audio.onloadedmetadata = () => dur.textContent = fmt(audio.duration);
audio.ontimeupdate = () => {
  if (audio.duration) {
    seek.value = audio.currentTime / audio.duration * 100;
    cur.textContent = fmt(audio.currentTime);
  }
};
seek.oninput = () => { if (audio.duration) audio.currentTime = seek.value / 100 * audio.duration; };
vol.oninput = () => audio.volume = Number(vol.value);
audio.volume = 0.8;

document.querySelectorAll('.nav').forEach(n => n.addEventListener('click', () => {
  document.querySelectorAll('.nav').forEach(x => x.classList.remove('active'));
  n.classList.add('active');
}));

loadTracks();
