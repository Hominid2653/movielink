// ─────────────────────────────────────────────────────────────
//  CINESCOPE — script.js
// ─────────────────────────────────────────────────────────────

const API_KEY  = '7c03c13';
const BASE_URL = 'https://www.omdbapi.com/';
const NOW_YEAR = new Date().getFullYear();

const BROWSE_TERMS = [
  'the','man','love','war','night','dark','world','lost',
  'black','blood','city','fire','king','star','wild','last',
  'hero','time','zero','gold','blue','red','iron','dead',
  'great','new','secret','life','rise','fall','beyond','silent',
];

// ── App state ──────────────────────────────────────────────
let mode          = 'browse';
let currentQuery  = '';
let currentYear   = null;
let currentPage   = 1;
let totalResults  = 0;
let isFetching    = false;
let exhausted     = false;
let sortMode      = 'smart';

// Browse-specific
let browseTermIdx = 0;
let browsePage    = 1;
let browseBuffer  = [];
const BUFFER_FLUSH = 20;

// Year picker
let pickerOpen  = false;
let decadeStart = Math.floor(NOW_YEAR / 10) * 10;

// Detail cache
const detailCache = new Map();

// ── Filter state ───────────────────────────────────────────
let filters = {
  type:      '',   // '' | 'movie' | 'series' | 'episode'
  genre:     '',   // e.g. 'Action'
  director:  '',   // partial match
  actor:     '',   // partial match
  minRating: '',   // numeric string e.g. '7'
};
let filterBarOpen = false;

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
const filterBar    = document.getElementById('filterBar');
const filterCount  = document.getElementById('filterCount');

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
//  FILTER BAR
// ──────────────────────────────────────────────────────────
function toggleFilterBar() {
  filterBarOpen = !filterBarOpen;
  filterBar.classList.toggle('open', filterBarOpen);
}

function setTypeFilter(val) {
  filters.type = val;
  // Update chip styles
  ['typeAll','typeMovie','typeSeries','typeEpisode'].forEach(id => {
    document.getElementById(id).classList.remove('active','text-bg');
    document.getElementById(id).classList.add('text-muted');
  });
  const activeId = val === '' ? 'typeAll' : val === 'movie' ? 'typeMovie' : val === 'series' ? 'typeSeries' : 'typeEpisode';
  const activeBtn = document.getElementById(activeId);
  activeBtn.classList.add('active','text-bg');
  activeBtn.classList.remove('text-muted');
  updateFilterCount();
  reloadWithFilters();
}

function setGenreFilter(val) {
  filters.genre = val;
  updateFilterCount();
  reloadWithFilters();
}

function setTextFilter(field, val) {
  filters[field] = val.trim();
  updateFilterCount();
  // Debounce text inputs — reload after 600ms pause
  clearTimeout(window._filterDebounce);
  window._filterDebounce = setTimeout(reloadWithFilters, 600);
}

function setRatingFilter(val) {
  filters.minRating = val;
  updateFilterCount();
  reloadWithFilters();
}

function clearAllFilters() {
  filters = { type: '', genre: '', director: '', actor: '', minRating: '' };
  // Reset UI
  document.getElementById('genreSelect').value  = '';
  document.getElementById('ratingSelect').value = '';
  document.getElementById('directorInput').value = '';
  document.getElementById('actorInput').value    = '';
  setTypeFilter(''); // resets chips and reloads
}

function updateFilterCount() {
  const active = [filters.type, filters.genre, filters.director, filters.actor, filters.minRating]
    .filter(Boolean).length;
  if (active > 0) {
    filterCount.textContent = active;
    filterCount.classList.remove('hidden');
  } else {
    filterCount.classList.add('hidden');
  }
}

// ── Apply client-side filters to an array of enriched movies ─
function applyFilters(movies) {
  return movies.filter(m => {
    // Type
    if (filters.type && (m.Type || '').toLowerCase() !== filters.type) return false;

    // Genre (partial, case-insensitive)
    if (filters.genre) {
      const genres = (m.Genre || '').toLowerCase();
      if (!genres.includes(filters.genre.toLowerCase())) return false;
    }

    // Director (partial, case-insensitive)
    if (filters.director) {
      const dir = (m.Director || '').toLowerCase();
      if (!dir.includes(filters.director.toLowerCase())) return false;
    }

    // Actor (partial, case-insensitive)
    if (filters.actor) {
      const cast = (m.Actors || '').toLowerCase();
      if (!cast.includes(filters.actor.toLowerCase())) return false;
    }

    // Min rating
    if (filters.minRating) {
      const rating = parseFloat(m.imdbRating);
      if (isNaN(rating) || rating < parseFloat(filters.minRating)) return false;
    }

    return true;
  });
}

function reloadWithFilters() {
  exhausted = false;
  grid.innerHTML = '';

  if (mode === 'search' && currentQuery) {
    currentPage = 1;
    renderSkeletons(8);
    loadSearch();
  } else {
    browseTermIdx = 0;
    browsePage    = 1;
    browseBuffer  = [];
    renderSkeletons(12);
    loadBrowse();
  }
}

// ──────────────────────────────────────────────────────────
//  ROUTING
// ──────────────────────────────────────────────────────────
function loadNextPage() {
  mode === 'browse' ? loadBrowse() : loadSearch();
}

// ──────────────────────────────────────────────────────────
//  BROWSE FEED
// ──────────────────────────────────────────────────────────
async function loadBrowse() {
  if (isFetching || exhausted) return;
  isFetching = true;
  showSpinner(true);

  while (browseBuffer.length < BUFFER_FLUSH && browseTermIdx < BROWSE_TERMS.length * 2) {
    const term = BROWSE_TERMS[browseTermIdx % BROWSE_TERMS.length];
    // Pass type to API if set (saves enrichment work)
    const typeParam = filters.type ? `&type=${filters.type}` : '';
    let url = `${BASE_URL}?apikey=${API_KEY}&s=${encodeURIComponent(term)}&page=${browsePage}${typeParam}`;
    if (currentYear) url += `&y=${currentYear}`;

    try {
      const res  = await fetch(url);
      const data = await res.json();

      if (data.Response === 'True') {
        const total    = parseInt(data.totalResults, 10);
        const enriched = await enrichBatch(data.Search);
        const filtered = applyFilters(enriched);
        browseBuffer.push(...filtered);

        if (browsePage * 10 >= total) { browseTermIdx++; browsePage = 1; }
        else                          { browsePage++; }
      } else {
        browseTermIdx++; browsePage = 1;
      }
    } catch { browseTermIdx++; browsePage = 1; }

    if (browseTermIdx >= BROWSE_TERMS.length * 2) { exhausted = true; break; }
  }

  browseBuffer.sort((a, b) => scoreMovie(b) - scoreMovie(a));
  const toRender = browseBuffer.splice(0, BUFFER_FLUSH);

  if (toRender.length) {
    const skeletons = grid.querySelectorAll('.shimmer-bar');
    skeletons.forEach(s => s.remove());
    renderCards(toRender);
  } else if (exhausted) {
    const skeletons = grid.querySelectorAll('.shimmer-bar');
    skeletons.forEach(s => s.remove());
    const activeFilters = [filters.genre, filters.director, filters.actor, filters.minRating].filter(Boolean);
    if (activeFilters.length) renderEmpty('No results match your filters. Try loosening them.');
  }

  setStatus(exhausted ? "You've seen everything." : '');
  isFetching = false;
  showSpinner(false);

  if (!exhausted) {
    const rect = sentinel.getBoundingClientRect();
    if (rect.top < window.innerHeight + 400) loadNextPage();
  }
}

// ──────────────────────────────────────────────────────────
//  SEARCH FEED
// ──────────────────────────────────────────────────────────
async function loadSearch() {
  if (isFetching || exhausted) return;
  isFetching = true;
  showSpinner(true);

  // Pass type to API if set
  const typeParam = filters.type ? `&type=${filters.type}` : '';
  let url = `${BASE_URL}?apikey=${API_KEY}&s=${encodeURIComponent(currentQuery)}&page=${currentPage}${typeParam}`;
  if (currentYear) url += `&y=${currentYear}`;

  try {
    const res  = await fetch(url);
    const data = await res.json();

    if (data.Response === 'True') {
      totalResults = parseInt(data.totalResults, 10);

      const enriched = await enrichBatch(data.Search);
      const filtered = applyFilters(enriched);
      const sorted   = applySortMode(filtered, currentQuery);

      if (currentPage === 1) grid.innerHTML = '';
      if (sorted.length) renderCards(sorted);
      else if (currentPage === 1) renderEmpty('No results match your filters.');

      const shown = (currentPage - 1) * 10 + data.Search.length;
      const filteredNote = filtered.length < enriched.length
        ? ` · ${filtered.length} match filters`
        : '';
      setStatus(`${totalResults.toLocaleString()} result${totalResults !== 1 ? 's' : ''} · showing ${shown}${filteredNote}`);

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
//  ENRICHMENT
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
//  SCORING
// ──────────────────────────────────────────────────────────
function scoreMovie(m) {
  const imdb    = parseFloat(m.imdbRating) || 0;
  const meta    = parseFloat(m.Metascore)  || 0;
  const year    = parseInt(m.Year, 10)     || 1900;
  const recency = Math.min(1, Math.max(0, (year - 1900) / (NOW_YEAR - 1900)));
  return (imdb * 0.55) + ((meta / 10) * 0.25) + (recency * 10 * 0.20);
}

// ──────────────────────────────────────────────────────────
//  SORT MODES
// ──────────────────────────────────────────────────────────
function applySortMode(movies, query) {
  const q = (query || '').toLowerCase().trim();
  switch (sortMode) {
    case 'rating':    return [...movies].sort((a, b) => (parseFloat(b.imdbRating)||0) - (parseFloat(a.imdbRating)||0));
    case 'year_desc': return [...movies].sort((a, b) => (parseInt(b.Year)||0) - (parseInt(a.Year)||0));
    case 'year_asc':  return [...movies].sort((a, b) => (parseInt(a.Year)||0) - (parseInt(b.Year)||0));
    case 'relevance': return [...movies].sort((a, b) => relevanceScore(b, q) - relevanceScore(a, q));
    case 'smart':
    default:
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
  if (title === q)          return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q))   return 60;
  const qWords = q.split(/\s+/);
  const tWords = title.split(/\s+/);
  return qWords.filter(w => tWords.includes(w)).length * 20;
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
function shiftDecade(dir)  { decadeStart += dir * 10; buildYearGrid(); }

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
//  MODAL
// ──────────────────────────────────────────────────────────
async function openModal(imdbID) {
  modalBd.classList.add('open');
  document.body.style.overflow = 'hidden';

  modalPoster.innerHTML = `<div class="w-full h-full min-h-64 flex items-center justify-center text-muted text-xs tracking-widest uppercase bg-card">Loading…</div>`;
  modalBody.innerHTML   = `<p class="text-muted text-xs tracking-widest uppercase p-8">Fetching details…</p>`;

  try {
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