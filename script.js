// ─────────────────────────────────────────────────────────────
//  CINESCOPE — script.js
//  OMDb API: get a free key at http://www.omdbapi.com/apikey.aspx
//  Replace API_KEY with your own key for full access.
// ─────────────────────────────────────────────────────────────

const API_KEY  = 'trilogy'; // ← replace with your key
const BASE_URL = 'https://www.omdbapi.com/';

// Popular seed terms rotated for the browse/home feed
const BROWSE_TERMS = [
  'love','war','dark','lost','man','night','world','dead',
  'black','blood','city','fire','king','star','wild','fear',
  'hero','time','zero','last','gold','blue','red','iron',
];

// ── State ──────────────────────────────────────────────────
let mode          = 'browse';   // 'browse' | 'search'
let currentQuery  = '';
let currentYear   = null;       // null = all years
let currentPage   = 1;
let totalResults  = 0;
let isFetching    = false;
let exhausted     = false;      // no more pages to load
let browseTermIdx = 0;
let browsePage    = 1;

// Year picker state
let pickerOpen    = false;
let decadeStart   = Math.floor(new Date().getFullYear() / 10) * 10; // e.g. 2020

// ── DOM refs ───────────────────────────────────────────────
const grid         = document.getElementById('grid');
const statusEl     = document.getElementById('status');
const spinner      = document.getElementById('spinner');
const sentinel     = document.getElementById('sentinel');
const searchInput  = document.getElementById('searchInput');
const clearBtn     = document.getElementById('clearBtn');
const hero         = document.getElementById('hero');
const yearDropdown = document.getElementById('yearDropdown');
const yearLabel    = document.getElementById('yearLabel');
const yearGrid     = document.getElementById('yearGrid');
const decadeLabel  = document.getElementById('decadeLabel');
const yearChevron  = document.getElementById('yearChevron');
const modalBd      = document.getElementById('modalBackdrop');
const modalPoster  = document.getElementById('modalPoster');
const modalBody    = document.getElementById('modalBody');

// ── Keyboard ───────────────────────────────────────────────
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') triggerSearch();
});
searchInput.addEventListener('input', () => {
  clearBtn.classList.toggle('hidden', !searchInput.value);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeYearPicker(); }
});
// Close year picker on outside click
document.addEventListener('click', e => {
  if (pickerOpen && !document.getElementById('yearPickerWrap').contains(e.target)) {
    closeYearPicker();
  }
});

// ── Infinite Scroll (IntersectionObserver) ─────────────────
const observer = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && !isFetching && !exhausted) {
    loadNextPage();
  }
}, { rootMargin: '300px' });

observer.observe(sentinel);

// ── Init ───────────────────────────────────────────────────
buildYearGrid();
loadNextPage(); // start browsing immediately

// ── BROWSE / SEARCH ROUTING ────────────────────────────────
function loadNextPage() {
  if (mode === 'browse') loadBrowse();
  else                   loadSearch();
}

// ── BROWSE FEED ────────────────────────────────────────────
async function loadBrowse() {
  if (isFetching || exhausted) return;
  isFetching = true;
  showSpinner(true);

  const term = BROWSE_TERMS[browseTermIdx % BROWSE_TERMS.length];
  let url = `${BASE_URL}?apikey=${API_KEY}&s=${term}&page=${browsePage}`;
  if (currentYear) url += `&y=${currentYear}`;

  try {
    const res  = await fetch(url);
    const data = await res.json();

    if (data.Response === 'True') {
      renderCards(data.Search);
      const total = parseInt(data.totalResults, 10);

      // Move to next browse term when this one is exhausted
      if (browsePage * 10 >= total) {
        browseTermIdx++;
        browsePage = 1;
      } else {
        browsePage++;
      }

      // Stop browsing after cycling all terms twice
      if (browseTermIdx >= BROWSE_TERMS.length * 2) {
        exhausted = true;
        setStatus('You\'ve seen it all.');
      } else {
        setStatus('');
      }
    } else {
      // term returned nothing, skip it
      browseTermIdx++;
      browsePage = 1;
      if (browseTermIdx >= BROWSE_TERMS.length * 2) {
        exhausted = true;
        setStatus('No more results.');
      }
    }
  } catch {
    setStatus('Network error.', true);
  }

  isFetching = false;
  showSpinner(false);
}

// ── SEARCH FEED ────────────────────────────────────────────
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
      renderCards(data.Search);
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

// ── SEARCH TRIGGER ─────────────────────────────────────────
function triggerSearch() {
  const q = searchInput.value.trim();

  if (!q) {
    // Empty search → back to browse
    resetToHome();
    return;
  }

  mode         = 'search';
  currentQuery = q;
  currentPage  = 1;
  totalResults = 0;
  exhausted    = false;
  grid.innerHTML = '';
  hero.classList.add('hidden');
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
  grid.innerHTML = '';
  searchInput.value = '';
  clearBtn.classList.add('hidden');
  hero.classList.remove('hidden');
  setStatus('');
  loadNextPage();
}

// ── YEAR FILTER (applies to both modes) ────────────────────
function selectYear(y) {
  currentYear = y;
  yearLabel.textContent = y ? String(y) : 'All Years';

  // Highlight active year in grid
  buildYearGrid();
  closeYearPicker();

  // Re-run current mode with new filter
  if (mode === 'search' && currentQuery) {
    currentPage = 1;
    exhausted   = false;
    grid.innerHTML = '';
    renderSkeletons(8);
    loadSearch();
  } else {
    // Reset browse with new filter
    exhausted     = false;
    browseTermIdx = 0;
    browsePage    = 1;
    grid.innerHTML = '';
    loadBrowse();
  }
}

// ── YEAR PICKER ────────────────────────────────────────────
function toggleYearPicker() {
  pickerOpen ? closeYearPicker() : openYearPicker();
}

function openYearPicker() {
  pickerOpen = true;
  yearDropdown.classList.remove('hidden');
  yearChevron.style.transform = 'rotate(180deg)';
}

function closeYearPicker() {
  pickerOpen = false;
  yearDropdown.classList.add('hidden');
  yearChevron.style.transform = 'rotate(0deg)';
}

function shiftDecade(dir) {
  decadeStart += dir * 10;
  buildYearGrid();
}

function buildYearGrid() {
  const thisYear = new Date().getFullYear();
  decadeLabel.textContent = `${decadeStart} – ${decadeStart + 9}`;

  yearGrid.innerHTML = '';
  for (let y = decadeStart; y <= decadeStart + 9; y++) {
    const btn = document.createElement('button');
    const isActive  = currentYear === y;
    const isFuture  = y > thisYear;

    btn.textContent = y;
    btn.disabled    = isFuture;
    btn.className   = [
      'py-2 text-sm font-body tracking-wide transition-colors',
      isActive
        ? 'bg-accent text-bg font-medium'
        : isFuture
          ? 'text-border cursor-not-allowed'
          : 'text-muted hover:text-accent hover:bg-white/5',
    ].join(' ');

    if (!isFuture) btn.onclick = () => selectYear(y);
    yearGrid.appendChild(btn);
  }
}

// ── RENDER CARDS ───────────────────────────────────────────
function renderCards(movies) {
  movies.forEach((m, i) => {
    const hasPoster = m.Poster && m.Poster !== 'N/A';

    const card = document.createElement('div');
    card.className = 'movie-card relative overflow-hidden cursor-pointer bg-card animate-fadeUp';
    card.style.aspectRatio   = '2/3';
    card.style.animationDelay = `${(i % 10) * 45}ms`;
    card.onclick = () => openModal(m.imdbID);

    card.innerHTML = hasPoster
      ? `<img src="${m.Poster}" alt="${escHtml(m.Title)}" loading="lazy"
              class="card-img w-full h-full object-cover block absolute inset-0"/>
         ${overlayHTML(m)}`
      : `<div class="w-full h-full flex flex-col items-center justify-center gap-2 text-muted select-none">
           <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.2">
             <rect x="2" y="2" width="20" height="20" rx="2"/>
             <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5"/>
           </svg>
           <span class="text-xs tracking-widest uppercase">No Poster</span>
         </div>
         ${overlayHTML(m)}`;

    grid.appendChild(card);
  });
}

function overlayHTML(m) {
  return `
    <div class="card-overlay absolute inset-0 flex flex-col justify-end p-3"
         style="background:linear-gradient(to top,rgba(9,9,15,.97) 0%,rgba(9,9,15,.25) 55%,transparent 100%)">
      <p class="text-accent text-xs tracking-widest uppercase mb-0.5">${escHtml(m.Year)}</p>
      <p class="font-display text-lg leading-tight tracking-wide text-light">${escHtml(m.Title)}</p>
      <p class="text-muted text-xs tracking-widest uppercase mt-1 capitalize">${escHtml(m.Type)}</p>
    </div>`;
}

// ── SKELETONS ──────────────────────────────────────────────
function renderSkeletons(n) {
  grid.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'shimmer-bar relative overflow-hidden bg-card';
    s.style.aspectRatio = '2/3';
    grid.appendChild(s);
  }
}

// ── EMPTY STATE ────────────────────────────────────────────
function renderEmpty(msg) {
  grid.innerHTML = `
    <div class="col-span-full flex flex-col items-center justify-center py-24 gap-4">
      <span class="text-5xl grayscale select-none">🎬</span>
      <h3 class="font-display text-3xl tracking-widest text-border">No Results</h3>
      <p class="text-muted text-sm tracking-wide">${escHtml(msg)}</p>
    </div>`;
}

// ── STATUS LINE ────────────────────────────────────────────
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className   = `px-5 md:px-12 pb-3 text-xs tracking-widest uppercase min-h-5 ${isError ? 'text-danger' : 'text-muted'}`;
}

// ── SPINNER ────────────────────────────────────────────────
function showSpinner(show) {
  spinner.classList.toggle('hidden', !show);
}

// ── DETAIL MODAL ───────────────────────────────────────────
async function openModal(imdbID) {
  modalBd.classList.add('open');
  document.body.style.overflow = 'hidden';

  modalPoster.innerHTML = `<div class="w-full h-full min-h-64 flex items-center justify-center text-muted text-xs tracking-widest uppercase bg-card">Loading…</div>`;
  modalBody.innerHTML   = `<p class="text-muted text-xs tracking-widest uppercase p-8">Fetching details…</p>`;

  try {
    const res = await fetch(`${BASE_URL}?apikey=${API_KEY}&i=${imdbID}&plot=full`);
    const m   = await res.json();
    if (m.Response !== 'True') throw new Error(m.Error || 'Could not load.');

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
      { t: v(m.Year),   accent: true },
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
      ['Awards',   v(m.Awards)],
    ].map(([lbl, val]) => `
      <div>
        <p class="text-muted text-xs tracking-widest uppercase mb-0.5">${lbl}</p>
        <p class="text-light text-sm leading-snug">${val}</p>
      </div>`).join('');

    const ratingsHTML = (m.Ratings || []).map(r => `
      <div class="flex flex-col gap-1">
        <span class="text-muted text-xs tracking-widest uppercase">${escHtml(r.Source.replace('Internet Movie Database','IMDb').replace('Rotten Tomatoes','Rotten T.'))}</span>
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
function closeModal() {
  modalBd.classList.remove('open');
  document.body.style.overflow = '';
}

// ── UTIL ───────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}