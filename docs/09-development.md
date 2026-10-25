# 9 · Development, data pipeline and testing

## Run locally

```bash
python tools/serve.py            # http://localhost:8000  (port: python tools/serve.py 8080)
```

| URL | Page |
| --- | --- |
| `/` | website home |
| `/twin.html` | operations room (Nagpur) |
| `/twin.html?city=raleigh` | operations room (Raleigh) |
| `/graph.html`, `/lab.html`, `/scenarios.html`, `/live.html`, `/citizen.html`, `/method.html` | website pages |

`tools/serve.py` is Python's `http.server` with two development conveniences:

- **`Cache-Control: no-cache`** on every response: the browser revalidates each file (cheap 304s)
  instead of mixing fresh and heuristically cached scripts.
- **A self-removing `/sw.js`:** a service worker left on `localhost:8000` by another project would
  intercept requests and serve its own cached copies. Browsers re-fetch `/sw.js` to update such a
  worker; this one deletes its caches, unregisters itself and reloads the pages it controlled. The
  pages also unregister any worker on load and reload once.

Any static server works (`python -m http.server`, `npx serve`, nginx). Opening files from disk
(`file://`) works for the operations room, which falls back to live OpenFreeMap tiles. The website
then runs the engine on the main thread, because browsers block workers on `file://`.

Requirements: a browser with WebGL (Chrome, Edge, Firefox, Safari), and Python 3.8+ for the server
and the data pipeline. Node 18+ is needed only for the tests and doc generation. No `npm install`
is needed to run the product.

## Configuration (`config.js`)

| Key | Default | Meaning |
| --- | --- | --- |
| `mapboxToken` | `''` | a Mapbox public token renders with Mapbox GL JS v3 on Mapbox Streets (`dark-v11`, restyled); otherwise MapLibre on the shipped tiles. A rejected token falls back to MapLibre. |
| `tiles` | `'auto'` | `auto` (shipped tiles, falling back to live OpenFreeMap tiles when they cannot be fetched), `local` or `remote` |
| `dataBase` | `''` | base URL for `data/` if hosted elsewhere |
| `tileBundles` | unset | set by `build_dist.py` for single-file builds (base64 tile bundles) |

## Data pipeline

```
tools/spec_<city>.py ──┐
data/tiles/{z}/{x}/{y}.pbf ──┤──► tools/build_data.py ──► src/js/data/geodata_<city>.js
tools/osm/<city>_facilities_raw.json ──┘
```

### 1. Tiles

```bash
python tools/fetch_tiles.py data/tiles --extent 78.985 21.050 79.195 21.240     # Nagpur, 158 tiles, ~3.8 MB
python tools/fetch_tiles.py data/tiles                                           # Raleigh (default extent)
```

Tiles come from OpenFreeMap (OpenMapTiles schema), z10–z14, stored by global tile coordinates, so
cities share the folder. `tools/mvt.py` is a dependency-free Mapbox Vector Tile decoder used by
the builder.

### 2. The city spec

`tools/spec_<city>.py` (Raleigh is `tools/spec.py`) is the authored knowledge base:

```python
CITY, REGION, TZ, TZ_LABEL = "Nagpur", "Maharashtra", "Asia/Kolkata", "IST"
EXTENT = [W, S, E, N]; CENTER = [lng, lat]; T0_ISO = "2026-10-24T00:00:00+05:30"
OVERVIEW = dict(center=[...], zoom=12.75, pitch=58, bearing=-18)
RIVER_ALIASES = {"Naag River": "Nag River", ...}       # name variants in the tiles
OSM_FILE = "nagpur_facilities_raw.json"

FACILITIES = [
  dict(id="DRN-NAR", type="drainage", subtype="River gauge", name="Nag River at Ambazari Rd",
       district="Ambazari / Hingna Rd",
       at=("cross", "Nag River", "Ambazari Road", 21.12534, 79.04425),   # river x road crossing, with a hint
       sensor="HYD-2101", tier=1, stem=40, creek="Nag River",
       p=dict(base=0.12, cap=56, scale=12, tau=10, wx="WX-ABZ")),
  # at=("pt", lat, lng) for a fixed point; ("osm", ...) to snap to an OSM feature
  ...
]
EDGES = [ ("LAK-ABZ", "DRN-NAR", 0.55, 0.5, "Spillway discharge enters the Nag River", "creek"), ... ]
#        from       to        w     lag  mechanism                                  kind (routing)
DISTRICTS = [ ("SITABULDI", 79.0855, 21.144), ... ]
CORRIDOR_CLASSES = {"motorway", "trunk", "primary", "secondary"}
FAULTS = [ dict(id="DRN-NWH", kind="stuck", **{"from": 18}, to=40, note="Gauge reading frozen"), ... ]
FALSE_REPORTS = [ dict(t=12.5, near="PWR-MNK", text="Explosion at ..."), ... ]
```

- `w` is the link's weight in the hidden world; **0 marks a planted fake** the learner should prune.
  The forecaster never sees `w`.
- `kind` picks the router for the link geometry: `creek` (down the waterway graph) or a road kind
  (Dijkstra on the street graph); other kinds draw an arc.

### 3. Build

```bash
python tools/build_data.py --city nagpur      # → src/js/data/geodata_nagpur.js
python tools/build_data.py                    # Raleigh → src/js/data/geodata.js
```

The builder:
1. Decodes the tiles inside the extent: streets, waterways, buildings and land use.
2. Places gauges at the exact crossing of a named river and road (with aliases), junctions at OSM
   squares, and substations, hospitals and EMS stations at their OSM features.
3. Routes every link: Dijkstra on the street graph, or downstream along the waterway graph.
4. Chunks corridors (by class) and drainage channels, linking each segment to the facilities that
   drive it.
5. Collects every OSM substation and computes Voronoi service areas.
6. Builds the **population grid**: 450 m cells weighted by street, building and water density,
   scaled to the city total (Nagpur 2,950,000; Raleigh 480,000), and sets each facility's `people`
   within 1.2 km.
7. Writes `(window.TWIN_GEOS ||= {})["<id>"] = {…}`.

Results: Nagpur has 57 facilities, 102 links (64 routed on real networks), 1,039 corridor
segments, 311 drainage segments and 1,790 population cells. Raleigh has 44 facilities, 71 links and
1,412 cells.

## Adding a city

1. **Spec:** copy `tools/spec_nagpur.py` to `tools/spec_<city>.py`. Set the identity, extent and
   time zone, and list the facilities (real locations), candidate links (with mechanisms, lags and
   a few planted fakes), districts, faults and false reports.
2. **OSM facilities:** export hospitals, substations, fire stations and junction names for the
   extent into `tools/osm/<city>_facilities_raw.json` (Overpass, `out center`).
3. **Tiles:** `python tools/fetch_tiles.py data/tiles --extent W S E N`.
4. **Build:** `python tools/build_data.py --city <city>`. Add the city's total to `POPULATION` in
   `build_data.py` first.
5. **Register it in the UI:**
   - add `{ id, label }` to `CITIES` in `src/js/ui/app.js`;
   - add `<script src="src/js/data/geodata_<city>.js">` to `twin.html`, and to
     `src/js/site/twin-worker.js` if the website should use it.
6. **Languages:** add the city to `CITY` in `src/js/engine/comms.js` with its languages, locales,
   helpline, ambulance number and desk name, plus templates for any new language.
7. **Check:**
   - `node tools/test/ops_probe.js <city> tropical`
   - `node tools/test/qc_regress.js`
   - open `twin.html?city=<city>`

Nothing else is city-specific. The engine, the action catalogue (generated from the graph), the
crisis registry, Cascade-R, the red team (targets from the graph) and validation all work as they
are.

## Single-file build

```bash
python tools/build_dist.py
```

Writes `dist/` (git-ignored):
- `dist/index.html`: the operations room with all CSS and JavaScript inlined, both cities'
  geodata included, and MapLibre from cdnjs;
- `dist/artifact.html`: the same without the document wrapper;
- `dist/data/bundles/`: tiles and glyphs packed as base64 JSON for hosts that only serve text and
  web media types.

It runs under a strict Content-Security-Policy (`connect-src 'self'`; scripts only from cdnjs):

```bash
python tools/test/csp_server.py 8766          # serves dist/ with that CSP
```

## Tests and probes

| Command | What it checks |
| --- | --- |
| `node tools/test/qc_regress.js` | every city × scenario: median lead, detection, false alarms, Brier, skill, and which sensors were flagged (false flags called out) |
| `node tools/test/ops_probe.js nagpur monsoon2023 47` | Cascade-R over time, crises and links, SMS in every language, CAP size and polygon, planner and deadline timings, ghost trajectory, SITREP excerpt, red team with every attack |
| `node tools/test/engine_probe.js tropical` | Raleigh engine timeline (truth/analysis), city state, ESS, a forecast, drivers, link statuses, discovery, cascade, alerts, validation, faulty-sensor trust |
| `node tools/test/interventions_probe.js` | Raleigh planner |
| `node tools/test/trust_probe.js` | sensor flags and low-trust sensors per scenario (Raleigh) |
| `node tools/test/far_debug.js tropical` | per-facility truth peak, critical time, first warning, prior crossing rate |
| `node tools/test/rls_debug.js` | dependency-learner internals |
| `node tools/test/smoke.js http://127.0.0.1:8000/twin.html out/` | headless browser run of the operations room (needs the `playwright` package) |
| `node tools/test/interactions.js …`, `node tools/test/phone.js …` | streaming replay, scenario switch, phone viewport (Playwright) |
| `node tools/gen_docs.js` | regenerates `docs/reference/*.md` (about 3–4 minutes) |

The website was verified headlessly with `playwright-core` driving the installed Edge
(`executablePath`). Checks covered every page at 1440 × 900, 1600 × 900 and 390 × 844, console
errors, horizontal overflow, the command palette, all six capability tabs, the poke interaction,
the red-team swap and restore, live weather and the lab → ghost-city deep link.

## Conventions

- **Classic scripts on `window.TWIN`**, one module per file, as an IIFE:
  `(function (root) { … root.TWIN.x = …; })(typeof window !== 'undefined' ? window : globalThis);`.
  The same files run in the browser, in the Web Worker (`self.window = self`) and in Node (`vm`).
- **Seeded randomness only** (`mulberry32`). The same scenario and seed always produce the same
  world, which is what lets summaries be cached and results be reproduced.
- **Typed arrays** in `[k * N + i]` layout (step-major); member trajectories in `[(m * K + k) * N + i]`.
- **No framework, no build step.** CSS custom properties hold the design tokens (`tokens.css`).
- **Comments explain why**, at the density of the surrounding code.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "Could not start the twin: … reading 'facilities'" | stale scripts from a service worker or cache. Use `tools/serve.py` and reload once with Ctrl+Shift+R. |
| Black map, markers only | WebGL disabled or blocked; enable hardware acceleration |
| Map tiles missing on `file://` | expected: it falls back to live OpenFreeMap tiles; serve over HTTP for the shipped tiles |
| Website pages stuck on "Running…" | workers blocked (`file://`); serve over HTTP |
| Live weather says "Offline" | no internet or Open-Meteo unreachable; replays still work |
| Hindi/Marathi shows boxes | the Noto Sans Devanagari web font did not load (offline); system fonts such as Nirmala UI or Mangal are used as fallbacks |
