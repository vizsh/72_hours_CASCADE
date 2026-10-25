# 2 · Architecture and repository map

## Stack

| Layer | Technology | Why |
| --- | --- | --- |
| Pages | Static HTML, vanilla JavaScript (classic scripts on a `window.TWIN` namespace), CSS custom properties | No build step; opens offline; nothing to install |
| 3D map | MapLibre GL JS 4.7.1 (cdnjs, with a vendored fallback), optional Mapbox GL JS v3 with a token | Open-source; renders the shipped vector tiles |
| Tiles | OpenMapTiles vector tiles (OpenFreeMap) baked into `data/tiles`, served through a custom `twin://` protocol | Works offline and inside sandboxed frames |
| Engine | Plain JavaScript typed arrays (`Float32Array`, `Int16Array`) | ~1.5–2 s for 200 members × 145 steps × 57 facilities |
| Website compute | Web Worker pool with a main-thread fallback | Pages stay at 60 fps while the ensemble runs |
| Fonts | Barlow, Barlow Semi Condensed, IBM Plex Mono, Noto Sans Devanagari (Google Fonts) | Words, display, measurements, Hindi/Marathi |
| Live data | Open-Meteo ensemble and geocoding APIs (CORS, no key) | Free, real-time GFS ensemble |
| Data pipeline | Python 3 standard library (own MVT decoder) | No GIS dependencies |
| Tests | Node probes; Playwright-core against an installed Edge or Chrome | Headless verification |

## Runtime architecture

### Operations room (`twin.html`)

```
twin.html
 ├─ config.js                    runtime config (Mapbox token, tile mode, data base URL)
 ├─ MapLibre GL JS               cdnjs, falls back to src/vendor/
 ├─ ?city= picker                sets window.TWIN_CITY
 ├─ src/js/data/geodata_nagpur.js, geodata.js     → window.TWIN_GEOS.{nagpur, raleigh}
 ├─ src/js/core.js               risk vocabulary, RNG, geo helpers, time zones
 ├─ src/js/engine/*.js           scenarios, engine, interventions, analytics, comms, redteam, live
 ├─ src/js/map/*.js              icons, geometry, style, layers, markers, radar, twinmap
 └─ src/js/ui/*.js               charts, feed, sidebar, inspector, timeline, drawers, ops, app
```

`app.js` boots in order:
1. Set the city's time zone.
2. Build the engine for the chosen scenario.
3. Create the map (`twinmap.create`), install the infrastructure layers, radar and markers, and
   precompute link geometry.
4. Create the panels and drawers and wire the controls.
5. Fly the camera in.

From then on a render loop advances the live clock (one simulated minute per real second, or
faster during playback). On each change it computes a **view** `{ k, kNow, kInfo, R, trust }` and
pushes it to every panel. `R` is the analysis up to "now" and the projection beyond it, plus the
ghost-city delta when a plan is applied.

### Website pages

```
index.html, graph.html, lab.html, scenarios.html, live.html, citizen.html, method.html
 ├─ geodata_nagpur.js, core.js, scenarios.js       (for names, menus and the city canvas)
 ├─ src/js/site/site.js          engine client, header, footer, command palette, charts
 ├─ src/js/site/citycanvas.js    (home, My area) map-free city renderer
 └─ src/js/site/<page>.js        one script per page
                      │  postMessage({ id, op, args })
                      ▼
   src/js/site/twin-worker.js  ── importScripts(geodata, core, scenarios, engine,
                                   interventions, analytics, comms, redteam, rpc.js)
   src/js/site/rpc.js          ── handlers; engines cached per city × scenario (two at most)
```

RPC operations, each returning compact, transferable products:

| Op | Arguments | Returns |
| --- | --- | --- |
| `summary` | city, scen | city risk series, critical counts, Cascade-R series, per-system peaks and first HIGH times, validation (cached in `localStorage`) |
| `snapshot` | city, scen, kIssue? | facilities, links, analysis/truth/readings/trust arrays, link posteriors per step, city series, Cascade-R parts, predicted course, crises at "now" and at the peak, alerts, validation, per-facility forecasts at "now" |
| `members` | city, scen, i | the 200 trajectories for one facility, their weights at every step, ESS |
| `explain` | city, scen, k, i | ranked drivers |
| `catalog` | city, scen | the action catalogue |
| `evaluate` | k, ids, n | outcome with and without the plan, side effects |
| `recommend` | k, budget | greedy plan |
| `deadline` | k, ids | benefit by start delay, act-by and half-life |
| `compare` | k, ids | critical counts and index over time with and without the plan, per-system peaks |
| `redteam` | ids, onset, kNow | attack outcome scored against the clean run |
| `messages` | k | SMS in every language for the top crises |
| `advice` | city | advice templates per hazard family and language |

The client (`SITE.call`) routes stateful work to worker 0, which keeps the engine warm. Stateless
summaries go across a pool of up to three workers. If workers are unavailable (for example on
`file://`), it loads the same scripts on the main thread and calls the handlers directly.

## Repository map

```
72_Hours/
├── index.html                 website home
├── graph.html                 knowledge graph
├── lab.html                   intervention lab
├── scenarios.html             scenario library
├── live.html                  live GFS ensemble for any city
├── citizen.html               "My area" public view
├── method.html                interactive method explainers
├── twin.html                  the operations room
├── config.js                  runtime configuration for the operations room
├── README.md                  index of everything
├── data/
│   ├── tiles/{z}/{x}/{y}.pbf  OpenMapTiles vector tiles for Raleigh and Nagpur (z10–14)
│   └── fonts/                 label glyph PBFs
├── docs/                      this documentation (+ screenshots, reference/ generated tables)
├── src/
│   ├── css/
│   │   ├── tokens.css         design tokens: surfaces, text, accent, risk ramp, type, geometry
│   │   ├── base.css           reset, pills, risk helpers, scroll areas
│   │   ├── layout.css         operations-room shell: top bar, left/right panels, bottom bar
│   │   ├── panels.css         sidebar, inspector, drawers, buttons, tables
│   │   ├── map.css            markers, overlays, cascade strip, legend, timeline
│   │   ├── ops.css            operations layer: crises, red team, comms, mode bar, Cascade-R chip
│   │   ├── site.css           website foundations: type scale, buttons, header, footer, palette
│   │   └── pages.css          website page compositions
│   ├── js/
│   │   ├── core.js            states and thresholds, risk colours, seeded RNG (mulberry32), noise,
│   │   │                      quantiles, haversine/bearing, path measure, formatting, time zones
│   │   ├── data/
│   │   │   ├── geodata_nagpur.js   generated Nagpur twin (TWIN_GEOS.nagpur)
│   │   │   └── geodata.js          generated Raleigh twin (TWIN_GEOS.raleigh)
│   │   ├── engine/
│   │   │   ├── scenarios.js   hazard plug-ins (8 scenarios incl. the live builder's contract)
│   │   │   ├── engine.js      simulation, ensemble, assimilation, trust, ARD, products, alerts, validation
│   │   │   ├── interventions.js  catalogues (Raleigh hand-written, generator for any city), evaluate,
│   │   │   │                  recommend, deadline, trajectory
│   │   │   ├── analytics.js   Cascade-R (nowcast, forecast, crossing) and the crisis registry
│   │   │   ├── comms.js       SITREP, CAP 1.2, SMS templates and segmentation, footprint polygons
│   │   │   ├── redteam.js     attack definitions from the graph, scripts, scoring
│   │   │   └── live.js        Open-Meteo GFS ensemble → live scenario
│   │   ├── map/
│   │   │   ├── icons.js       facility glyphs and UI icons (SVG)
│   │   │   ├── geom.js        local frames, arcs, buffers, metre expressions
│   │   │   ├── style.js       dark CIM basemap style over OpenMapTiles
│   │   │   ├── layers.js      drainage, basins, corridors, AR flood/congestion overlays, substations,
│   │   │   │                  outage hatching, hospitals, flows, arcs, population, crisis footprints
│   │   │   ├── markers.js     hex facility markers on stems (HTML markers)
│   │   │   ├── radar.js       canvas rain radar
│   │   │   └── twinmap.js     map bootstrap, twin:// tile protocol, camera, renderer selection
│   │   ├── ui/
│   │   │   ├── charts.js      ring gauge, forecast fan, sparkline helpers
│   │   │   ├── feed.js        procedural live sensor feeds per facility type
│   │   │   ├── sidebar.js     layer toggles, asset list, search, alerts feed
│   │   │   ├── inspector.js   facility inspector
│   │   │   ├── timeline.js    72 h timeline, playback, keyboard scrubbing
│   │   │   ├── drawers.js     dependency graph, interventions (deadline, ghost city), validation
│   │   │   ├── ops.js         crisis registry, red team, communications drawers
│   │   │   └── app.js         orchestrator: state, view, render loop, controls, deep links
│   │   └── site/
│   │       ├── rpc.js         worker RPC handlers
│   │       ├── twin-worker.js Web Worker bootstrap
│   │       ├── site.js        engine client, chrome, command palette, count-up, chart helper
│   │       ├── citycanvas.js  oblique/flat city renderer with pulses and rings
│   │       ├── home.js, graph.js, lab.js, scenarios.js, forecast.js, citizen.js, method.js
│   └── vendor/                MapLibre fallback
└── tools/
    ├── serve.py               dev server (no-cache, service-worker kill switch)
    ├── fetch_tiles.py         download OpenFreeMap tiles for an extent
    ├── mvt.py                 dependency-free Mapbox Vector Tile decoder
    ├── build_data.py          tiles + spec → geodata_<city>.js
    ├── spec.py                Raleigh knowledge base (facilities, links, faults, reports)
    ├── spec_nagpur.py         Nagpur knowledge base
    ├── osm/                   raw OSM facility extracts used by the builder
    ├── build_dist.py          single-file build of the operations room (dist/, git-ignored)
    ├── gen_docs.js            regenerates docs/reference/*.md from code and engine runs
    └── test/                  probes and browser tests (see Development)
```

## Data model (geodata)

`tools/build_data.py` writes one object per city to `window.TWIN_GEOS[id]`:

| Key | Content |
| --- | --- |
| `id, city, region, tz, tzLabel, overview, extent, center, t0` | identity, time zone, camera, clock origin |
| `facilities[]` | `{ id, type, subtype, name, district, sensor, tier, stem, creek?, p: { base, cap?, scale?, tau?, wx? }, beds?, lngLat, source, people }` |
| `edges[]` | `{ from, to, w, lag, mechanism, kind, path, km }` (`w` is used only by the hidden truth) |
| `corridors[]` | street segments `{ n, c, g, i }` with class and linked facilities |
| `drainage[]` | channel segments `{ n, m, g, i }` (main channel flag, linked gauges) |
| `basins[]` | pond polygons linked to gauges |
| `substations[]` | every OSM substation with voltage, monitored flag and Voronoi service area |
| `districts[]` | label points |
| `population` | `{ cell: 450, cells: [[lng, lat, residents], …] }` |
| `faults[]`, `falseReports[]` | planted sensor faults and false citizen reports |
| `attribution` | data credits |

The complete Nagpur and Raleigh contents are listed in [reference/nagpur.md](reference/nagpur.md)
and [reference/raleigh.md](reference/raleigh.md).

## Rendering the operations room map

- **Basemap:** a dark CIM style over OpenMapTiles with land use, water, roads, 3D building
  extrusion (OSM heights) and labels. Road labels prefer English names (`name:en`, `name_en`,
  `name:latin`) so Indian cities read correctly.
- **Infrastructure layers** (`layers.js`): static GeoJSON built once. Each feature carries the
  indices and weights of the facilities that drive it, so a time change only swaps one literal
  array of risks into the paint expressions; nothing is re-uploaded except the small flows and arcs
  sources.
- **Markers** (`markers.js`): HTML hexagons on stems, coloured by state, with fault badges and a
  pulse on CRITICAL.
- **Radar** (`radar.js`): a canvas source drawing the rain field (truth up to now, the most
  probable member beyond).
- **Crisis footprints:** convex hulls of member facilities (650 m buffers), shown while the crisis
  registry is open.

## Performance notes

- Engine creation is the only heavy step. Everything after it is incremental: per-step products
  are cached, and the crisis registry and Cascade-R are cached per engine.
- Counterfactuals simulate only from the decision step, on the 16–32 most probable members.
- The website never runs the ensemble on the main thread when workers are available.
- Scenario summaries are deterministic (seeded) and cached across visits (`localStorage`, key
  `cascade72:v3:summary:<city>:<scenario>`).
- The city canvas projects geometry once and only recolours cells and moves pulses per frame.

Continue with [The cascade engine](03-engine.md).
