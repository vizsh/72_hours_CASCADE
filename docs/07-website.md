# 7 · The website

Eight static pages around the operations room, in the same visual language: charcoal surfaces,
Barlow for words, Barlow Semi Condensed for display, IBM Plex Mono for measurements, steel blue
(`#79a7e3`) for interaction, and the risk ramp (green `#3fb27f`, amber `#e2b93b`, orange
`#ee8a2a`, red `#e5484d`) kept for risk alone. Every number on every page is computed in the
browser by the same engine, in a Web Worker ([Architecture](02-architecture.md#website-pages)).

| Page | File | Script | Engine operations used |
| --- | --- | --- | --- |
| Overview (home) | `index.html` | `home.js`, `citycanvas.js` | snapshot, summary, recommend, compare, catalog, evaluate, redteam, messages |
| Knowledge graph | `graph.html` | `graph.js` | snapshot, explain |
| Intervention lab | `lab.html` | `lab.js` | catalog, summary, evaluate, compare, deadline, recommend |
| Scenarios | `scenarios.html` | `scenarios.js` | summary (all scenarios, Nagpur + Raleigh) |
| Live | `live.html` | `forecast.js` | none (Open-Meteo ensemble and geocoding APIs) |
| My area | `citizen.html` | `citizen.js`, `citycanvas.js` | snapshot, advice |
| Method | `method.html` | `method.js` | snapshot, members |
| Operations room | `twin.html` | `src/js/ui/*` | the full engine on the main thread |

## Shared chrome (`site.js`)

- **Header:** sticky and translucent, with a hairline once you scroll. Brand (links home); nav:
  Knowledge graph, Intervention lab, Scenarios, Live, My area, Method (the current page
  underlined in steel blue); a **Search** button with `Ctrl K`; and **Open operations room**.
  Below 1080 px the nav collapses into a menu button.
- **Command palette:** `Ctrl K`, `⌘ K` or `/` on any page. Fuzzy search over the pages, a replay
  of every Nagpur scenario in the operations room, live weather, Raleigh, and all 57 Nagpur
  facilities (each opens `twin.html?select=<id>`). Arrow keys move, Enter opens, Esc closes.
- **Footer:** about, explore links, data credits, source link.
- **Themed browser surfaces:** text selection, scrollbars, focus rings (2 px steel blue), caret,
  tabular numerals.
- **Reduced motion:** count-ups, the hero autoplay and typewriter effects are skipped when the OS
  asks for reduced motion.

---

## Overview (`index.html`)

### Hero: the 2023 cloudburst, replayed
A full-bleed canvas shows **Nagpur as a city of light** (oblique view, rotated −22°):
- **1,790 population columns**, height by residents. Each warms from steel through amber and
  orange to red with the risk of the facility it depends on.
- **Streets and rivers etched in.** River segments glow pale blue, then red, as their gauges rise.
- **Facilities on stems** as hexagons coloured by state, with a pulsing halo when CRITICAL.
- **Pulses** travel along learned links that carry stress, coloured blue (water), amber (traffic)
  or red (cascade). **Rings** expand when a facility enters HIGH or CRITICAL.

The replay runs the monsoon scenario from T+30 to T+62 at 1.45 simulated hours per second, then
loops. A **ticker** shows play/pause, `T+`, the local date and time, a progress bar coloured by the
risk ramp (click to jump), the counts of critical and high facilities, and Cascade-R.

**Poke the city.** Click any facility. The twin walks the learned links downstream (status not
pruned, weight ≥ 0.05) and sends pulses with delays proportional to cumulative lag, ringing each
facility as stress arrives. The caption lists who it reaches and when, for example "Mobile sites,
Mankapur reaches 4 facilities through learned links: 112 Emergency Control Room +0.5 h, IGGMC
(Mayo Hospital) +1.5 h, GMC +2.0 h …".

**Predicted course panel.** The forecast issued at 06:00 on 22 Sep 2023 (T+24) from the data
available then: the first five CRITICAL crossings with what fails, when (local time), the
probability and the hours ahead. A footer gives the lead ("Issued 18.5 h before the first facility
actually went critical").

### Same morning, two warnings
A conventional district warning ("Heavy to very heavy rainfall is likely at isolated places…")
beside the sentence the twin issued that morning, built from the predicted course.

### One question, asked four ways
Hazard → Exposure → Cascade → Intervention, each with its question, what the twin does and a
Nagpur example.

### Inside the operations room (capability explorer)
Six tabs, each computed live on demand (↑/↓ keys move between tabs):

| Tab | Live content |
| --- | --- |
| Crisis registry | crises at the peak with ID, type, districts, systems, residents and stage |
| Cascade-R | the 72 h curve with the 1.0 line and the crossing time |
| Learned dependencies | confirmed/pruned counts, planted fakes neutralised, a system-level graph with animated confirmed arcs |
| Ghost city | the recommended plan within 5 crews, critical facilities over time with and without it, the actions |
| Red team | three attacks rebuilt and scored: raw feed vs twin bars against the hidden truth, flag times, bot posts held |
| Warnings that leave the room | a phone-style cell-broadcast card that types the SMS in English, Hindi and Marathi in turn, with encoding and segments |

### Seven crises, one engine
A horizontally scrolling strip of the seven Nagpur scenarios. Each card has the city risk curve
with HIGH and CRITICAL bands and a dashed Cascade-R line, first critical, peak critical,
self-sustaining time, **Replay** and **Details**.

### Scored on replays
A scorecard table (median lead, detection, false alarms, Brier, skill) for every scenario; the
reliability diagram of the monsoon replay; "0 reads from the future".

### Honest about what is real
Real vs simulated, labelled.

### Call to action
"The window is 72 hours. Use it." Operations room, My area, How it works.

---

## Knowledge graph (`graph.html`)

A full-height interactive graph of all **102 candidate links** between the 57 facilities.

| Control | Behaviour |
| --- | --- |
| Scenario | any Nagpur scenario (the learned structure differs per hazard) |
| Layout | **Force:** physics with system clustering; **Map:** real coordinates; **Systems:** columns by system, sorted north to south. Nodes glide between layouts. |
| Time slider | T+0 to T+72: link status, weights, flows and node risk at that time |
| **Watch it learn** | animates T+0 → T+72 in 14 s; links appear, thicken, turn dashed or get pruned |
| Reveal planted fakes | marks the 7 fake links: a white ⊗ when rejected, a red ⊗ if they fooled the learner |
| System chips | hide or show systems |
| Canvas | drag nodes (they pin in force mode; double-click releases), drag the background to pan, scroll to zoom, hover to highlight neighbours, click to select |

Drawing:
- **Nodes:** hexagons outlined in the system's colour, filled by risk state, with a halo when
  CRITICAL.
- **Edges:** curved, with arrowheads. Confirmed links are solid in the target system's colour,
  width by weight. Candidates are dashed grey; pruned links are dotted red.
- **Particles** move along links that are carrying stress.

**Side panel:**
- Counts of confirmed, pruned and awaiting links. A "Real links confirmed" bar, plus "Planted fakes
  rejected" when the fakes are revealed.
- With nothing selected: the links carrying stress now, or the strongest learned links, each
  clickable.
- With a facility selected:
  - name, ID, subtype, district, state and risk at the time;
  - **What drives it now** (live `explain()`: baseline, hazard, each link's share);
  - upstream and downstream links with mean ± sd, lag, status and mechanism;
  - **Open in the operations room**.

A deep link `graph.html?scenario=<id>&select=<facility id>` opens with a scenario and selection.

---

## Intervention lab (`lab.html`)

| Control | Behaviour |
| --- | --- |
| Scenario | any Nagpur scenario |
| Decide at | slider T+0 to T+60 (default: the scenario's "now"), with the local date and time |
| Crews | 3, 5 or 7 |
| Recommend within budget | greedy plan |
| Action cards | toggle; each shows crew pips, detail, side effect and the gain of that action alone (filled in progressively) |

Results update on every change:
1. **Verdict:** Doing nothing (baseline), *This plan breaks the cascade*, *Mitigated* or *Marginal*.
2. **Ledger:** critical facility-hours, hospital critical hours, P(a hospital goes critical) and
   facilities reaching critical, before → after with the change.
3. **Facilities at CRITICAL** over time, do nothing vs plan (the plan's curve morphs on change).
4. **Peak risk by system**, before and after.
5. **Decision deadline:** benefit vs start delay with "act by".
6. **Side effects** the plan creates.
7. **See it as a ghost city in the operations room:** opens `twin.html?scenario=…&plan=…&k=…`.

Deep link: `lab.html?scenario=<id>&plan=<ids>&k=<step>`.

---

## Scenarios (`scenarios.html`)

- **Filter:** All · Weather · Infrastructure · Industry and crowds.
- **Reach matrix:** scenario × system (drainage, roads, power, telecom, EMS, hospitals). Each cell
  shows when the system first reached HIGH RISK, shaded by its peak. A quiet cell shows only the
  peak; *n/a* means the city has no such system.
- **One dossier per scenario** (anchors `#monsoon2023`, `#chlorine` …):
  - tags, title and blurb;
  - **Replay in the operations room**, **Plan interventions** and **Learned graph** links;
  - a chart of city risk with HIGH and CRITICAL bands, critical counts as bars, Cascade-R ÷ 3
    dashed and the "live now" marker;
  - facts: first critical, peak critical, self-sustaining time, median lead, events warned and
    false alarms.
- **Unseen city:** Raleigh's tropical run on the same engine, with a link to
  `twin.html?city=raleigh`.

Summaries are computed in parallel workers and cached for the next visit; a status line counts
them.

---

## Live (`live.html`)

- **City search** through the Open-Meteo geocoding API (as you type), plus quick chips for Nagpur,
  Raleigh, Mumbai, Guwahati and Chennai.
- Fetches the **31-member GFS ensemble** (`gfs025`, past day + 3 days, hourly precipitation,
  temperature and wind, local time zone).
- **Verdict:** "Heavy rain is likely / possible / not expected in <city>", with the share of
  futures bringing ≥ 5 mm/h in 48 h, when it is most likely, the hottest member and the strongest
  wind.
- **Charts** from 12 h ago to 60 h ahead, with a "now" marker:
  - rain rate: 31 member lines, the ensemble mean and the 10–90% band;
  - chance of heavy rain per hour, as bars coloured by likelihood;
  - temperature: member range band and median;
  - wind: median and strongest member.
- **Hand-off:** for Nagpur and Raleigh, "Open the live twin" (`twin.html?scenario=live`). Elsewhere
  it explains that the twin covers those two cities and shows the hazard layer only.
- **Offline:** a clear error; the replays still work offline.

---

## My area (`citizen.html`)

For residents, in plain language.

| Element | Behaviour |
| --- | --- |
| Area search | the 15 Nagpur districts (datalist); also click the dot map (nearest district, or a facility's nearest district) |
| Situation | any Nagpur scenario (default: the monsoon replay) |
| Dot map | top-down city: population cells coloured by the forecast risk of the facility they depend on, facilities as hexagons, the chosen district circled. Horizon: Now, +6 h, +12 h, +24 h. "Forecast issued …" in local time. |
| Verdict | coloured by severity, with a pulsing dot when HIGH or CRITICAL. "Flooding likely in Dharampeth from about 01:30 Sat." plus "97% chance within 24 hours, starting at Nag River at West High Court Rd. Likely window 00:00–05:00." The scenario's primary hazard leads (a flood that also strains hospitals is a flood warning). |
| Next 36 hours near you | one row per system serving the area (facilities within 2.2 km, or the nearest three): a 72-cell strip coloured by forecast state, with a local time axis |
| What to do now | advice for that hazard family in English, हिन्दी or मराठी (switchable), using the city's helpline and ambulance numbers |
| Nearest hospital | name, distance, and forecast state now, at +6 h and at +12 h |
| Roads to avoid | junctions near you forecast to reach HIGH within 12 h, with the time |
| Link | the worst facility near you in the operations room |

Deep link: `citizen.html?area=Dharampeth&scenario=monsoon2023`. A footer repeats 112 and 108 and
states that it is decision support.

---

## Method (`method.html`)

1. **Pipeline:** seven stages (sensor streams → trust → ensemble → dependencies → cascade →
   interventions → warnings) with an animated pulse; each stage links to its section or page.
2. **Two hundred futures, reweighted every thirty minutes:** a particle-filter explorer.
   - Pick a facility (the lake spillway, river, junction, substation, telecom, EMS and hospital
     first) and drag the **issue time**.
   - All 200 member trajectories are drawn, brighter by weight at that time. Readings received so
     far are dots, and the analysis is drawn in amber.
   - **Reveal hidden truth** adds the truth as a dashed line.
   - Stats: effective members, heaviest member, P(critical in 24 h), sensor trust.
3. **Links nobody wrote down:** three links over 72 h with ±1 sd bands: a real link that gets
   confirmed, a planted fake, and a link never exercised.
4. **Sensors that lie:** one card per planted fault. Each shows the readings (dots), the truth
   (dashed), trust (filled line), the fault window, and when the sensor was quarantined.
5. **Is the cascade feeding itself?** Stacked hazard-borne and network-borne stress with Cascade-R
   on a right axis and the R = 1 line.
6. **Scored with the future locked away:**
   - lead time per critical event, as bars (missed events in red);
   - median lead, events warned, false alarms, Brier, skill, forecasts scored, reads from the
     future (0).
7. **Limits, stated plainly.**

---

## Responsive and accessible

- Layouts collapse to one column on phones, the header becomes a menu, tables scroll sideways,
  and the hero canvas becomes a fixed-height band under the copy.
- Every control is a real button, input or link with a visible focus ring and an accessible name.
  Canvases carry `aria-label` descriptions, and live regions announce verdict changes.
- Tested at 1440 × 900, 1600 × 900 and 390 × 844 with no horizontal overflow and no console errors.

Continue with [User flows](08-user-flows.md).
