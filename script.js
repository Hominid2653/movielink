// ─────────────────────────────────────────────
//  CINESCOPE — script.js
//  Get your free OMDb key: http://www.omdbapi.com/apikey.aspx
//  Replace API_KEY below with your own key.
// ─────────────────────────────────────────────

const API_KEY = 'trilogy'; // ← replace with your key
const BASE_URL = 'https://www.omdbapi.com/';

// State
let currentQuery = '';
let currentYear  = '';
let currentPage  = 1;
let totalResults = 0;

// DOM refs
const grid         = document.getElementById('grid');
const statusEl     = document.getElementById('status');
const loadMoreWrap = document.getElementById('loadMoreWrap');
const searchInput  = document.getElementById('searchInput');
const yearInput    = document.getElementById('yearInput');
const modalBd      = document.getElementById('modalBackdrop');
const modal        = document.getElementById('modal');
const modalPoster  = document.getElementById('modalPoster');
const modalBody    = document.getElementById('modalBody');

// ── Keyboard shortcuts ──────────────────────
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') startSearch(); });
yearInput.addEventListener('keydown',   e => { if (e.key === 'Enter') startSearch(); });
document.addEventListener('keydown',    e => { if (e.key === 'Escape') closeModal(); });

// ── SEARCH ──────────────────────────────────
function startSearch() {
  const q = searchInput.value.trim();
  if (!q) return;

  currentQuery = q;
  currentYear  = yearInput.value.trim();
  currentPage  = 1;
  totalResults = 0;

  grid.innerHTML = '';
  loadMoreWrap.classList.add('hidden');
  setStatus('Searching…');
  renderSkeletons(8);
  fetchMovies(true);
}

function loadMore() {
  currentPage++;
  fetchMovies(false);
}

async function fetchMovies(fresh) {
  try {
    let url = `${BASE_URL}?apikey=${API_KEY}&s=${encodeURIComponent(currentQuery)}&page=${currentPage}`;
    if (currentYear) url += `&y=${currentYear}`;

    const res  = await fetch(url);
    const data = await res.json();

    if (fresh) grid.innerHTML = '';

    if (data.Response === 'True') {
      totalResults = parseInt(data.totalResults, 10);
      renderCards(data.Search);

      const shown = (currentPage - 1) * 10 + data.Search.length;
      setStatus(`${totalResults.toLocaleString()} result${totalResults !== 1 ? 's' : ''} — showing ${shown}`);

      if (shown < totalResults) {
        loadMoreWrap.classList.remove('hidden');
      } else {
        loadMoreWrap.classList.add('hidden');
      }
    } else {
      if (fresh) renderEmpty(data.Error || 'No results found.');
      setStatus('');
    }
  } catch (err) {
    if (fresh) grid.innerHTML = '';
    setStatus('Network error — check your connection.', true);
  }
}

// ── RENDER CARDS ────────────────────────────
function renderCards(movies) {
  movies.forEach((m, i) => {
    const hasPoster = m.Poster && m.Poster !== 'N/A';

    const card = document.createElement('div');
    card.className = 'movie-card relative overflow-hidden cursor-pointer bg-card animate-fadeUp';
    card.style.aspectRatio = '2/3';
    card.style.animationDelay = `${i * 45}ms`;
    card.onclick = () => openModal(m.imdbID);

    card.innerHTML = `
      ${hasPoster
        ? `<img
             src="${m.Poster}"
             alt="${escHtml(m.Title)}"
             loading="lazy"
             class="card-img w-full h-full object-cover block absolute inset-0"
           />`
        : `<div class="w-full h-full flex flex-col items-center justify-center gap-2 bg-card text-muted">
             <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.25">
               <rect x="2" y="2" width="20" height="20" rx="2"/>
               <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5"/>
             </svg>
             <span class="text-xs tracking-widest uppercase">No Poster</span>
           </div>`
      }
      <div class="card-overlay absolute inset-0 flex flex-col justify-end p-4"
           style="background: linear-gradient(to top, rgba(10,10,15,.97) 0%, rgba(10,10,15,.3) 55%, transparent 100%)">
        <p class="text-accent text-xs tracking-widest uppercase mb-1">${m.Year}</p>
        <p class="font-display text-xl leading-tight tracking-wide text-light">${escHtml(m.Title)}</p>
        <p class="text-muted text-xs tracking-widest uppercase mt-1">${m.Type}</p>
      </div>`;

    grid.appendChild(card);
  });
}

// ── SKELETONS ───────────────────────────────
function renderSkeletons(n) {
  grid.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'shimmer-bar relative overflow-hidden bg-card';
    s.style.aspectRatio = '2/3';
    grid.appendChild(s);
  }
}

// ── EMPTY STATE ─────────────────────────────
function renderEmpty(msg) {
  grid.innerHTML = `
    <div class="col-span-full flex flex-col items-center justify-center py-24 gap-4 text-center">
      <span class="text-6xl grayscale">🎬</span>
      <h2 class="font-display text-4xl tracking-widest text-border">No Results</h2>
      <p class="text-muted text-sm tracking-wide">${escHtml(msg)}</p>
    </div>`;
  loadMoreWrap.classList.add('hidden');
}

// ── STATUS ──────────────────────────────────
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError
    ? 'px-8 md:px-16 text-xs tracking-widest uppercase text-danger min-h-5'
    : 'px-8 md:px-16 text-xs tracking-widest uppercase text-muted min-h-5';
}

// ── MODAL ───────────────────────────────────
async function openModal(imdbID) {
  modalBd.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Loading state
  modalPoster.innerHTML = `
    <div class="w-full h-full min-h-64 flex items-center justify-center text-muted text-xs tracking-widest uppercase bg-card">
      Loading…
    </div>`;
  modalBody.innerHTML = `
    <p class="text-muted text-xs tracking-widest uppercase p-10">Fetching details…</p>`;

  try {
    const res  = await fetch(`${BASE_URL}?apikey=${API_KEY}&i=${imdbID}&plot=full`);
    const m    = await res.json();
    if (m.Response !== 'True') throw new Error(m.Error || 'Failed to load.');

    const hasPoster = m.Poster && m.Poster !== 'N/A';

    // Poster column
    modalPoster.innerHTML = `
      ${hasPoster
        ? `<img src="${m.Poster}" alt="${escHtml(m.Title)}" class="w-full h-full object-cover block" style="filter:saturate(.8)">`
        : `<div class="w-full h-full min-h-72 flex items-center justify-center bg-card text-muted text-xs tracking-widest uppercase">No Poster</div>`
      }
      ${m.imdbRating && m.imdbRating !== 'N/A'
        ? `<div class="absolute top-4 left-4 bg-accent text-bg font-display text-2xl tracking-wide px-3 py-1 leading-none">★ ${m.imdbRating}</div>`
        : ''
      }`;

    // Helper for N/A
    const val = v => (v && v !== 'N/A') ? escHtml(v) : '—';

    // Ratings bubbles
    const ratingsHTML = (m.Ratings || []).map(r => `
      <div class="flex flex-col gap-1">
        <span class="text-muted text-xs tracking-widest uppercase">${escHtml(r.Source.replace('Internet Movie Database','IMDb').replace('Rotten Tomatoes','Rotten T.'))}</span>
        <span class="font-display text-2xl text-accent tracking-wide">${escHtml(r.Value)}</span>
      </div>`).join('');

    // Details grid rows
    const details = [
      ['Director', val(m.Director)],
      ['Genre',    val(m.Genre)],
      ['Cast',     val(m.Actors)],
      ['Country',  val(m.Country)],
      ['Language', val(m.Language)],
      ['Awards',   val(m.Awards)],
    ];

    const detailsHTML = details.map(([label, value]) => `
      <div>
        <p class="text-muted text-xs tracking-widest uppercase mb-1">${label}</p>
        <p class="text-light text-sm">${value}</p>
      </div>`).join('');

    // Pills
    const pills = [
      { text: val(m.Year),    accent: true },
      { text: m.Type?.toUpperCase() },
      { text: val(m.Runtime) },
      ...(m.Rated && m.Rated !== 'N/A' ? [{ text: m.Rated }] : []),
    ];

    const pillsHTML = pills.map(p => `
      <span class="text-xs tracking-widest uppercase px-3 py-1 border ${p.accent ? 'border-accent text-accent' : 'border-border text-muted'}">
        ${p.text}
      </span>`).join('');

    modalBody.innerHTML = `
      <div class="flex flex-wrap gap-2">${pillsHTML}</div>

      <h2 class="font-display text-4xl md:text-5xl tracking-widest leading-none text-light">
        ${escHtml(m.Title)}
      </h2>

      <p class="text-sm leading-relaxed" style="color:#a0a0b8">
        ${val(m.Plot) !== '—' ? escHtml(m.Plot) : 'No plot available.'}
      </p>

      <div class="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-5">
        ${detailsHTML}
      </div>

      ${ratingsHTML
        ? `<div class="flex flex-wrap gap-6 border-t border-border pt-5">${ratingsHTML}</div>`
        : ''
      }`;

  } catch (err) {
    modalBody.innerHTML = `
      <p class="text-danger text-xs tracking-widest uppercase p-10">${err.message}</p>`;
  }
}

function backdropClose(e) {
  if (e.target === modalBd) closeModal();
}

function closeModal() {
  modalBd.classList.remove('open');
  document.body.style.overflow = '';
}

// ── HELPERS ─────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── SEED SEARCH ─────────────────────────────
searchInput.value = 'Inception';
startSearch();