# 🎬 CINESCOPE

A sleek, dark-themed movie & TV search app powered by the [OMDb API](https://www.omdbapi.com/). Browse curated films sorted by score, search by title, and drill down with flexible filters — all in a single-page vanilla JS app with no build step required.

---

## Features

- **Browse feed** — infinite scroll through a curated grid of films, sorted by a composite score (IMDb rating + Metascore + recency)
- **Search** — instant title search with smart, rating, relevance, newest, and oldest sort modes
- **Flexible filters** — filter by Type, Genre, Director, Actor, and minimum IMDb rating
- **Year picker** — decade-based calendar picker to narrow results by release year
- **Detail modal** — full plot, cast, director, box office, awards, and all ratings (IMDb, Rotten Tomatoes, Metacritic)
- **Skeleton loading** — shimmer placeholders while content loads
- **Enrichment cache** — full movie details are fetched once and cached for instant modal opens

---

## Project Structure

```
cinescope/
├── index.html   # App shell, header, filter bar, grid, modal
└── script.js    # All app logic — state, fetching, filtering, rendering
```

No frameworks, no bundler, no dependencies beyond Tailwind CDN and Google Fonts.

---

## Getting Started

### 1. Get an OMDb API key

Register for a free key at [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx).  
The free tier allows **1,000 requests/day**.

### 2. Add your key

Open `script.js` and replace the key on line 4:

```js
const API_KEY = 'YOUR_KEY_HERE';
```

### 3. Run locally

No build step needed. Just serve the folder with any static server:

```bash
# Python
python -m http.server 5500

# Node (npx)
npx serve .

# VS Code
# Install the "Live Server" extension, then click "Go Live"
```

Then open [http://localhost:5500](http://localhost:5500) in your browser.

---

## Filters

Because OMDb's search endpoint only supports filtering by **title + year + type**, all other filters work client-side on enriched results:

| Filter | How it works |
|---|---|
| **Type** | Passed to the OMDb API (`&type=movie/series/episode`) |
| **Year** | Passed to the OMDb API (`&y=YYYY`) |
| **Genre** | Client-side match against the enriched `Genre` field |
| **Director** | Partial, case-insensitive match on `Director` |
| **Actor** | Partial, case-insensitive match on `Actors` |
| **Min Rating** | Filters out movies below the chosen IMDb floor |

> **Tip:** Director and Actor inputs are debounced (600ms) so the grid only reloads once you stop typing.

---

## Scoring Algorithm

The browse feed sorts results using a weighted composite score:

```
score = (imdbRating × 0.55) + ((Metascore / 10) × 0.25) + (recencyBonus × 0.20)
```

Where `recencyBonus = (year − 1900) / (currentYear − 1900)`, clamped between 0 and 1.

---

## Sort Modes (Search)

| Mode | Description |
|---|---|
| ★ Smart Sort | Blends relevance (title match) and composite score 50/50 |
| Top Rated | Sorted by IMDb rating descending |
| Newest First | Sorted by release year descending |
| Oldest First | Sorted by release year ascending |
| Most Relevant | Prioritises exact and prefix title matches |

---

## API Usage Notes

- Each page of search results triggers up to **10 parallel enrichment requests** (one per result) to fetch full details
- Enriched results are cached in memory (`detailCache`) — clicking a card a second time opens the modal instantly with no extra request
- The modal upgrades to a **full plot** fetch if the cached version has a short plot summary

---

## Customisation

**Change the browse seed terms** — edit the `BROWSE_TERMS` array in `script.js` to control what content surfaces in the browse feed:

```js
const BROWSE_TERMS = ['the', 'man', 'love', 'war', ...];
```

**Adjust the buffer flush size** — `BUFFER_FLUSH = 20` controls how many enriched, filtered, and sorted results are rendered per batch. Lower = faster first paint, higher = fewer layout reflows.

---

## Browser Support

Works in all modern browsers (Chrome, Firefox, Safari, Edge). No polyfills required.

---

## License

MIT — free to use, modify, and distribute.
