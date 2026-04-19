// ─────────────────────────────────────────────────────────────
//  CINESCOPE — script.js
//  OMDb API key: http://www.omdbapi.com/apikey.aspx
// ─────────────────────────────────────────────────────────────

const API_KEY  = '7c03c13';  // ← your key
const BASE_URL = 'https://www.omdbapi.com/';
const NOW_YEAR = new Date().getFullYear();

// Seed terms for the browse feed — varied enough to surface diverse content
const BROWSE_TERMS = [
  'the','man','love','war','night','dark','world','lost',
  'black','blood','city','fire','king','star','wild','last',
  'hero','time','zero','gold','blue','red','iron','dead',
  'great','new','secret','life','rise','fall','beyond','silent',
];

// ── App state ──────────────────────────────────────────────
let mode          = 'browse';   // 'browse' | 'search'
let currentQuery  = '';
let currentYear   = null;
let currentPage   = 1;
let totalResults  = 0;
let isFetching    = false;
let exhausted     = false;
let sortMode      = 'smart';    // smart | rating | year_desc | year_asc | relevance

// Browse-specific pagination
let browseTermIdx = 0;
let browsePage    = 1;
// Buffer of enriched movies waiting to be flushed to the grid
let browseBuffer  = [];
const BUFFER_FLUSH = 20; // render once we have this many good results

// Year picker
let pickerOpen  = false;
let decadeStart = Math.floor(NOW_YEAR / 10) * 10;

// Enrichment cache — imdbID → full detail object (avoids re-fetching for modal)
const detailCache = new Map();

// ── DOM refs ───────────────────────────────────────────────
const grid         = document.getElementById('grid');
const statusEl     = document.getElementById('status');
const spinner      = document.getElementById('spinner');
const sentinel     = document.getElementById('sentinel');
const searchInput  = document.getElementById('searchInput');
const clearBtn     = document.getElementById('clearBtn');
const hero         = document.getElementById('hero');
const sortWrap     = document.getElementById('sortWrap');
const sortSelect   = document.getElementById('sortSelect');
const yearDropdown = document.getElementById('yearDropdown');
const yearLabel    = document.getElementById('yearLabel');
const yearGrid_el  = document.getElementById('yearGrid');
const decadeLabel  = document.getElementById('decadeLabel');
const yearChevron  = document.getElementById('yearChevron');
const modalBd      = document.getElementById('modalBackdrop');
const modalPoster  = document.getElementById('modalPoster');
const modalBody    = document.getElementById('modalBody');

// ── Events ─────────────────────────────────────────────────
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') triggerSearch(); });
searchInput.addEventListener('input',   () => { clearBtn.classList.toggle('hidden', !searchInput.value); });
document.addEventListener('keydown',    e => { if (e.key === 'Escape') { closeModal(); closeYearPicker(); } });
document.addEventListener('click', e => {
  if (pickerOpen && !document.getElementById('yearPickerWrap').contains(e.target)) closeYearPicker();
});

// ── Infinite scroll ────────────────────────────────────────
const observer = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && !isFetching && !exhausted) loadNextPage();
}, { rootMargin: '400px' });
observer.observe(sentinel);

// ── Bootstrap ──────────────────────────────────────────────
buildYearGrid();
renderSkeletons(12);
loadNextPage();

// ──────────────────────────────────────────────────────────
//  ROUTING
// ──────────────────────────────────────────────────────────
function loadNextPage() {
  mode === 'browse' ? loadBrowse() : loadSearch();
}

// ──────────────────────────────────────────────────────────
//  BROWSE FEED  (infinite, enriched, sorted by score)
// ──────────────────────────────────────────────────────────
async function loadBrowse() {
  if (isFetching || exhausted) return;
  isFetching = true;
  showSpinner(true);

  // Keep fetching seed terms until we fill the buffer
  while (browseBuffer.length < BUFFER_FLUSH && browseTermIdx < BROWSE_TERMS.length * 2) {
    const term = BROWSE_TERMS[browseTermIdx % BROWSE_TERMS.length];
    let url = `${BASE_URL}?apikey=${API_KEY}&s=${encodeURIComponent(term)}&page=${browsePage}&type=movie`;
    if (currentYear) url += `&y=${currentYear}`;

    try {
      const res  = await fetch(url);
      const data = await res.json();

      if (data.Response === 'True') {
        const total = parseInt(data.totalResults, 10);
        // Enrich this page's results
        const enriched = await enrichBatch(data.Search);
        browseBuffer.push(...enriched);

        if (browsePage * 10 >= total) { browseTermIdx++; browsePage = 1; }
        else                          { browsePage++; }
      } else {
        // No results for this term, move on
        browseTermIdx++; browsePage = 1;
      }
    } catch { browseTermIdx++; browsePage = 1; }

    if (browseTermIdx >= BROWSE_TERMS.length * 2) { exhausted = true; break; }
  }
// Sort buffer by score and flush
browseBuffer.sort((a, b) => scoreMovie(b) - scoreMovie(a));
const toRender = browseBuffer.splice(0, BUFFER_FLUSH);
if (toRender.length) {
  // Clear any skeleton placeholders before rendering real cards
  const skeletons = grid.querySelectorAll('.shimmer-bar');
  skeletons.forEach(s => s.remove());
  renderCards(toRender);
}

  setStatus(exhausted ? "You've seen everything." : '');
  isFetching = false;
  showSpinner(false);

  // If sentinel still visible and not exhausted, keep loading
  if (!exhausted) {
    const rect = sentinel.getBoundingClientRect();
    if (rect.top < window.innerHeight + 400) loadNextPage();
  }
}

// ──────────────────────────────────────────────────────────
//  SEARCH FEED  (paginated, enriched, smart sorted)
// ──────────────────────────────────────────────────────────
async function loadSearch() {
  if (isFetching || exhausted) return;
  isFetching = true;
  showSpinner(true);

  let url = `${BASE_URL}?apikey=${API_KEY}&s=${encodeURIComponent(currentQuery)}&page=${currentPage}`;
  if (currentYear) url += `&y=${currentYear}`;

  try {
    const res  = await fetch(url);
    const data = await res.json();

    if (data.Response === 'True') {
      totalResults = parseInt(data.totalResults, 10);

      // Enrich then sort the page
      const enriched = await enrichBatch(data.Search);
      const sorted   = applySortMode(enriched, currentQuery);

      if (currentPage === 1) grid.innerHTML = '';
      renderCards(sorted);

      const shown = (currentPage - 1) * 10 + data.Search.length;
      setStatus(`${totalResults.toLocaleString()} result${totalResults !== 1 ? 's' : ''} · showing ${shown}`);
      currentPage++;
      if (shown >= totalResults) exhausted = true;
    } else {
      if (currentPage === 1) renderEmpty(data.Error || 'No results found.');
      exhausted = true;
      setStatus('');
    }
  } catch {
    setStatus('Network error — check connection.', true);
  }

  isFetching = false;
  showSpinner(false);
}

// ──────────────────────────────────────────────────────────
//  ENRICHMENT  — fetch full detail for each movie in batch
//  Uses Promise.allSettled so one failure never breaks the batch
// ──────────────────────────────────────────────────────────
async function enrichBatch(movies) {
  const results = await Promise.allSettled(
    movies.map(m => fetchDetail(m.imdbID))
  );

  return results
    .map((r, i) => r.status === 'fulfilled' && r.value ? r.value : movies[i])
    .filter(Boolean);
}

async function fetchDetail(imdbID) {
  if (detailCache.has(imdbID)) return detailCache.get(imdbID);
  try {
    const res  = await fetch(`${BASE_URL}?apikey=${API_KEY}&i=${imdbID}&plot=short`);
    const data = await res.json();
    if (data.Response === 'True') {
      detailCache.set(imdbID, data);
      return data;
    }
  } catch {}
  return null;
}

// ──────────────────────────────────────────────────────────
//  SCORING  — composite weighted score for a movie
//
//  imdbRating  (0–10)  → weight 0.55
//  Metascore   (0–100) → normalised to 0–10, weight 0.25
//  Recency bonus       → newer = slightly higher, weight 0.20
//    formula: (year - 1900) / (nowYear - 1900), clamped 0–1
// ──────────────────────────────────────────────────────────
function scoreMovie(m) {
  const imdb  = parseFloat(m.imdbRating)  || 0;
  const meta  = parseFloat(m.Metascore)   || 0;
  const year  = parseInt(m.Year, 10)      || 1900;
  const recency = Math.min(1, Math.max(0, (year - 1900) / (NOW_YEAR - 1900)));

  return (imdb * 0.55) + ((meta / 10) * 0.25) + (recency * 10 * 0.20);
}

// ──────────────────────────────────────────────────────────
//  SORT MODES  (search only)
// ──────────────────────────────────────────────────────────
function applySortMode(movies, query) {
  const q = (query || '').toLowerCase().trim();

  switch (sortMode) {
    case 'rating':
      return [...movies].sort((a, b) => (parseFloat(b.imdbRating)||0) - (parseFloat(a.imdbRating)||0));

    case 'year_desc':
      return [...movies].sort((a, b) => (parseInt(b.Year)||0) - (parseInt(a.Year)||0));

    case 'year_asc':
      return [...movies].sort((a, b) => (parseInt(a.Year)||0) - (parseInt(b.Year)||0));

    case 'relevance':
      return [...movies].sort((a, b) => relevanceScore(b, q) - relevanceScore(a, q));

    case 'smart':
    default:
      // Blend: relevance (title match) + composite score
      return [...movies].sort((a, b) => {
        const rel = relevanceScore(b, q) - relevanceScore(a, q);
        const scr = scoreMovie(b) - scoreMovie(a);
        return rel * 0.5 + scr * 0.5;
      });
  }
}

function relevanceScore(m, q) {
  if (!q) return 0;
  const title = (m.Title || '').toLowerCase();
  if (title === q)                  return 100;  // exact match
  if (title.startsWith(q))         return  80;  // starts with query
  if (title.includes(q))           return  60;  // contains query
  // Word-level overlap
  const qWords = q.split(/\s+/);
  const tWords = title.split(/\s+/);
  const overlap = qWords.filter(w => tWords.includes(w)).length;
  return overlap * 20;
}

// ──────────────────────────────────────────────────────────
//  TRIGGERS
// ──────────────────────────────────────────────────────────
function triggerSearch() {
  const q = searchInput.value.trim();
  if (!q) { resetToHome(); return; }

  mode         = 'search';
  currentQuery = q;
  currentPage  = 1;
  totalResults = 0;
  exhausted    = false;

  grid.innerHTML = '';
  hero.classList.add('hidden');
  sortWrap.classList.remove('hidden');
  setStatus('Searching…');
  renderSkeletons(8);
  loadSearch();
}

function clearSearch() {
  searchInput.value = '';
  clearBtn.classList.add('hidden');
  resetToHome();
}

function resetToHome() {
  mode          = 'browse';
  currentQuery  = '';
  currentPage   = 1;
  exhausted     = false;
  browseTermIdx = 0;
  browsePage    = 1;
  browseBuffer  = [];

  searchInput.value = '';
  clearBtn.classList.add('hidden');
  grid.innerHTML = '';
  hero.classList.remove('hidden');
  sortWrap.classList.add('hidden');
  setStatus('');
  renderSkeletons(12);
  loadNextPage();
}

function onSortChange() {
  sortMode = sortSelect.value;
  // Re-run search from page 1 with new sort
  currentPage = 1;
  exhausted   = false;
  grid.innerHTML = '';
  renderSkeletons(8);
  loadSearch();
}

// ──────────────────────────────────────────────────────────
//  YEAR FILTER
// ──────────────────────────────────────────────────────────
function selectYear(y) {
  currentYear = y;
  yearLabel.textContent = y ? String(y) : 'All Years';
  buildYearGrid();
  closeYearPicker();

  if (mode === 'search' && currentQuery) {
    currentPage = 1; exhausted = false;
    grid.innerHTML = ''; renderSkeletons(8);
    loadSearch();
  } else {
    exhausted = false; browseTermIdx = 0; browsePage = 1; browseBuffer = [];
    grid.innerHTML = ''; renderSkeletons(12);
    loadBrowse();
  }
}

function toggleYearPicker() { pickerOpen ? closeYearPicker() : openYearPicker(); }
function openYearPicker()  { pickerOpen = true;  yearDropdown.classList.remove('hidden'); yearChevron.style.transform = 'rotate(180deg)'; }
function closeYearPicker() { pickerOpen = false; yearDropdown.classList.add('hidden');    yearChevron.style.transform = 'rotate(0deg)'; }

function shiftDecade(dir) { decadeStart += dir * 10; buildYearGrid(); }

function buildYearGrid() {
  decadeLabel.textContent = `${decadeStart} – ${decadeStart + 9}`;
  yearGrid_el.innerHTML = '';
  for (let y = decadeStart; y <= decadeStart + 9; y++) {
    const btn      = document.createElement('button');
    const isActive = currentYear === y;
    const isFuture = y > NOW_YEAR;
    btn.textContent = y;
    btn.disabled    = isFuture;
    btn.className   = [
      'py-2 text-sm font-body tracking-wide transition-colors rounded-none',
      isActive  ? 'bg-accent text-bg font-medium'
      : isFuture ? 'text-border cursor-not-allowed'
      :            'text-muted hover:text-accent hover:bg-white/5',
    ].join(' ');
    if (!isFuture) btn.onclick = () => selectYear(y);
    yearGrid_el.appendChild(btn);
  }
}

// ──────────────────────────────────────────────────────────
//  RENDER CARDS
// ──────────────────────────────────────────────────────────
function renderCards(movies) {
  movies.forEach((m, i) => {
    const hasPoster = m.Poster && m.Poster !== 'N/A';
    const rating    = m.imdbRating && m.imdbRating !== 'N/A' ? m.imdbRating : null;

    const card = document.createElement('div');
    card.className = 'movie-card relative overflow-hidden cursor-pointer bg-card animate-fadeUp';
    card.style.aspectRatio    = '2/3';
    card.style.animationDelay = `${(i % 10) * 45}ms`;
    card.onclick = () => openModal(m.imdbID);

    card.innerHTML = `
      ${hasPoster
        ? `<img src="${m.Poster}" alt="${escHtml(m.Title)}" loading="lazy"
                class="card-img w-full h-full object-cover block absolute inset-0"/>`
        : `<div class="w-full h-full flex flex-col items-center justify-center gap-2 text-muted select-none">
             <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.2">
               <rect x="2" y="2" width="20" height="20" rx="2"/>
               <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5"/>
             </svg>
             <span class="text-xs tracking-widest uppercase">No Poster</span>
           </div>`
      }
      ${rating ? `<div class="absolute top-2 right-2 bg-black/70 text-accent font-display text-sm px-1.5 py-0.5 leading-none tracking-wide">★${rating}</div>` : ''}
      <div class="card-overlay absolute inset-0 flex flex-col justify-end p-3"
           style="background:linear-gradient(to top,rgba(9,9,15,.97) 0%,rgba(9,9,15,.25) 55%,transparent 100%)">
        <p class="text-accent text-xs tracking-widest uppercase mb-0.5">${escHtml(m.Year || '')}</p>
        <p class="font-display text-lg leading-tight tracking-wide text-light">${escHtml(m.Title || '')}</p>
        <p class="text-muted text-xs tracking-widest uppercase mt-1 capitalize">${escHtml(m.Type || '')}</p>
      </div>`;

    grid.appendChild(card);
  });
}

// ──────────────────────────────────────────────────────────
//  SKELETONS / EMPTY
// ──────────────────────────────────────────────────────────
function renderSkeletons(n) {
  // Don't wipe grid if it already has real cards (infinite scroll top-up)
  const existing = grid.querySelectorAll('.movie-card').length;
  if (existing > 0) return;
  grid.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'shimmer-bar relative overflow-hidden bg-card';
    s.style.aspectRatio = '2/3';
    grid.appendChild(s);
  }
}

function renderEmpty(msg) {
  grid.innerHTML = `
    <div class="col-span-full flex flex-col items-center justify-center py-24 gap-4">
      <span class="text-5xl grayscale select-none">🎬</span>
      <h3 class="font-display text-3xl tracking-widest text-border">No Results</h3>
      <p class="text-muted text-sm tracking-wide">${escHtml(msg)}</p>
    </div>`;
}

// ──────────────────────────────────────────────────────────
//  STATUS / SPINNER
// ──────────────────────────────────────────────────────────
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className   = `px-5 md:px-12 pb-3 text-xs tracking-widest uppercase min-h-5 ${isError ? 'text-danger' : 'text-muted'}`;
}

function showSpinner(show) { spinner.classList.toggle('hidden', !show); }

// ──────────────────────────────────────────────────────────
//  MODAL  (uses cache if available, else fetches full detail)
// ──────────────────────────────────────────────────────────
async function openModal(imdbID) {
  modalBd.classList.add('open');
  document.body.style.overflow = 'hidden';

  modalPoster.innerHTML = `<div class="w-full h-full min-h-64 flex items-center justify-center text-muted text-xs tracking-widest uppercase bg-card">Loading…</div>`;
  modalBody.innerHTML   = `<p class="text-muted text-xs tracking-widest uppercase p-8">Fetching details…</p>`;

  try {
    // Upgrade to full plot if we only have short plot cached
    let m = detailCache.get(imdbID);
    if (!m || m.Plot?.length < 120) {
      const res = await fetch(`${BASE_URL}?apikey=${API_KEY}&i=${imdbID}&plot=full`);
      m = await res.json();
      if (m.Response === 'True') detailCache.set(imdbID, m);
      else throw new Error(m.Error || 'Could not load.');
    }

    const hasPoster = m.Poster && m.Poster !== 'N/A';
    const v = x => (x && x !== 'N/A') ? escHtml(x) : '—';

    modalPoster.innerHTML = `
      ${hasPoster
        ? `<img src="${m.Poster}" alt="${v(m.Title)}" class="w-full h-full object-cover block" style="filter:saturate(.8)">`
        : `<div class="w-full h-full min-h-64 flex items-center justify-center bg-card text-muted text-xs tracking-widest uppercase">No Poster</div>`
      }
      ${m.imdbRating && m.imdbRating !== 'N/A'
        ? `<div class="absolute top-3 left-3 bg-accent text-bg font-display text-xl tracking-wide px-2.5 py-1 leading-none">★ ${m.imdbRating}</div>`
        : ''}`;

    const pills = [
      { t: v(m.Year), accent: true },
      { t: (m.Type||'').toUpperCase() },
      { t: v(m.Runtime) },
      ...(m.Rated && m.Rated !== 'N/A' ? [{ t: m.Rated }] : []),
    ].map(p => `<span class="text-xs tracking-widest uppercase px-2.5 py-1 border ${p.accent ? 'border-accent text-accent' : 'border-border text-muted'}">${p.t}</span>`).join('');

    const details = [
      ['Director', v(m.Director)],
      ['Genre',    v(m.Genre)],
      ['Cast',     v(m.Actors)],
      ['Country',  v(m.Country)],
      ['Language', v(m.Language)],
      ['Box Office', v(m.BoxOffice)],
      ['Awards',   v(m.Awards)],
      ['Metascore', m.Metascore && m.Metascore !== 'N/A' ? `<span class="text-accent">${m.Metascore}</span>/100` : '—'],
    ].map(([lbl, val]) => `
      <div>
        <p class="text-muted text-xs tracking-widest uppercase mb-0.5">${lbl}</p>
        <p class="text-light text-sm leading-snug">${val}</p>
      </div>`).join('');

    const ratingsHTML = (m.Ratings || []).map(r => `
      <div class="flex flex-col gap-1">
        <span class="text-muted text-xs tracking-widest uppercase leading-tight">
          ${escHtml(r.Source.replace('Internet Movie Database','IMDb').replace('Rotten Tomatoes','Rotten T.'))}
        </span>
        <span class="font-display text-2xl text-accent tracking-wide">${escHtml(r.Value)}</span>
      </div>`).join('');

    modalBody.innerHTML = `
      <div class="flex flex-wrap gap-2">${pills}</div>
      <h2 class="font-display text-4xl md:text-5xl tracking-widest leading-none">${v(m.Title)}</h2>
      <p class="text-sm leading-relaxed" style="color:#9090a8">${m.Plot && m.Plot !== 'N/A' ? escHtml(m.Plot) : 'No plot available.'}</p>
      <div class="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4">${details}</div>
      ${ratingsHTML ? `<div class="flex flex-wrap gap-6 border-t border-border pt-4">${ratingsHTML}</div>` : ''}`;

  } catch (err) {
    modalBody.innerHTML = `<p class="text-danger text-xs tracking-widest uppercase p-8">${err.message}</p>`;
  }
}

function backdropClose(e) { if (e.target === modalBd) closeModal(); }
function closeModal() { modalBd.classList.remove('open'); document.body.style.overflow = ''; }

// ──────────────────────────────────────────────────────────
//  UTIL
// ──────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}