# 5 · The operations room (`twin.html`)

The full-screen 3D twin, built for an emergency operations centre: dark control-room surfaces,
glass instruments docked around a live city, and colour reserved for risk. Open it from any
website page ("Open operations room"), or directly:

| URL | Opens |
| --- | --- |
| `twin.html` | Nagpur, the first Nagpur scenario (monsoon 2023), live mode |
| `twin.html?scenario=<id>` | a scenario: `monsoon2023`, `chlorine`, `festival`, `blackout`, `tropical`, `flash`, `heat`, `live` |
| `twin.html?city=raleigh` | Raleigh (the unseen city) |
| `twin.html?select=<facility id>` | flies to and inspects a facility, e.g. `?select=HSP-GMC` |
| `twin.html?scenario=<id>&plan=<action ids>&k=<step>` | applies a plan from the lab as a ghost city, e.g. `?scenario=monsoon2023&plan=barrier-pwr-vsn,stage-ems&k=74` |

The brand mark (top left) links back to the website.

## Screen layout

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ☰ ⬡ NAGPUR DIGITAL TWIN   [● Live | Historical]  T+37.0h FRI 22 SEP · 19:00 IST  LIVE   │
│                                          [City ▾] ● status  Cascade-R 0.00  People 0  CITY│
├──────────────┬───────────────────────────────────────────────────────────┬───────────────┤
│ 57 Monitored │ Nagpur › All districts      [graph][plan][valid]|[crises][red][comms][▾]│
│ assets       │            HAZARD → DRAINAGE → TRAFFIC → POWER → TELECOM → EMS → HOSPITAL│
│ [search]     │                                                            │   Inspector   │
│ LAYERS       │                     3D city map                            │  (when a      │
│ ☑ Drainage … │                                                            │   facility is │
│ ASSETS       │  legend                                       [+][−][N][3D]│   selected)   │
│ ALERTS       │                      [mode bar: ghost city / red team]     │               │
├──────────────┴───────────────────────────────────────────────────────────┴───────────────┤
│ ▶ 2×   72-HOUR PREDICTIVE TIMELINE ─────────NOW──────────▲──────────  [Trigger][Reset][Orbit]│
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

## Top bar

| Element | Behaviour |
| --- | --- |
| Menu button (narrow screens) | shows or hides the left panel |
| Brand | city name and region; links to the website home |
| **Live / Historical** | *Live*: the clock runs at "now" for the scenario; the future is forecast. *Historical*: the whole 72 h window is a replay with the truth available for scoring; switching opens the Validation drawer. |
| Clock | `T+h` since the scenario's clock origin, the local date and time in the city's time zone (IST or EDT), and a tag: **LIVE**, **STREAMING** (during Trigger cascade), **FORECAST +x h** (scrubbed into the future), **PAST −x h**, or **REPLAY**. Clicking a non-live tag returns to now. |
| City menu | Nagpur, MH or Raleigh, NC; reloads with `?city=` |
| Status | LED plus "N feeds assimilated · ESS x/200 · k sensors degraded" (amber when any sensor is degraded). The tooltip names the renderer. The text hides below 1720 px; the LED and tooltip remain. |
| **Cascade-R** | network-borne ÷ hazard-borne stress. Red at ≥ 1 (self-sustaining), amber at ≥ 0.5. Prefixed `~` when it is a forecast (scrubbed ahead). Click it to open the crisis registry. |
| **People at risk** | residents whose nearest exposed facility is HIGH RISK or worse; the tooltip splits CRITICAL vs HIGH out of the modeled total |
| **City** | city state pill (NORMAL / WATCH / HIGH RISK / CRITICAL) from the tier-weighted city index |

## Left panel

### Search
Filters the asset list by name, street, district or sensor ID.

### Layers
Toggles; **Show all** turns everything on except dependency arcs.

| Layer | What it draws |
| --- | --- |
| Drainage | river and drain channels coloured by capacity, pond basins, AR flood footprints and road flooding overlays |
| Traffic | street corridors coloured by congestion (time of day plus nearby stress), AR congestion overlays |
| Power grid | every OSM substation, Voronoi service areas tinted by risk, outage hatching |
| Hospitals & EMS | hospital rings sized by beds, coloured by state |
| Telecom | mobile-site markers (present when the city has telecom) |
| Population | extruded 450 m population cells coloured by the risk of the facility they depend on (off by default) |
| Weather radar | animated rain field: truth up to now, the most probable member beyond |
| Cascade flows | animated arrows along links that are carrying stress (blue water, amber traffic, red cascade) |
| Dependency arcs | every candidate link as an arc: confirmed (blue, width by weight), candidate (dashed), pruned (red dotted) |
| 3D buildings | extruded OSM buildings |

### Assets
Grouped by system (Drainage, Traffic, Power grid, Telecom, Hospitals & EMS, Weather), sorted by
tier then name. Each row shows the name, district, sensor ID, risk % and state dot, plus a
**SENSOR** badge when trust is degraded. Group headers show their critical count and collapse on
click. Click a row to select and fly to the facility.

### Alerts
A time-ordered feed of the last 6 h (relative to the view time), generated from information
available at each step:

- **CRITICAL / HIGH**: a facility entered that state, with a plain description ("Channel over
  capacity, roadway overtopping likely").
- **Predicted CRITICAL**: P(critical within 24 h) ≥ 60%, with probability and ETA.
- **Sensor reliability low**: names the fault when known and the influence remaining.
- **Citizen report**: text, with a **Corroborated** or **Unverified** tag from the twin's own
  estimate; planted false reports stay unverified unless the place really is in that state.

Click an alert to fly to the facility and outline the ground footprint it drives.

## The map

- **Hex markers on stems**, coloured by state; CRITICAL markers pulse; a "!" badge marks a degraded
  sensor. Hover shows the name and risk. Click to inspect.
- **Breadcrumbs** (top left): `Nagpur › All districts`, or `Nagpur › district › facility` with a
  **City overview** button.
- **Cascade strip** (top centre): one stage per system (Hazard, Drainage, Traffic, Power, Telecom,
  EMS, Hospital). A stage lights up when the system reaches HIGH, with the time it did; it shows
  `~time` outlined when forecast with ≥ 50% probability. **Critical cascade** appears when three
  or more systems are CRITICAL.
- **Legend** (bottom left): the risk ramp plus entries for the visible layers.
- **Map controls** (bottom right): zoom in and out, reset bearing (compass needle), toggle 3D tilt.
- **Mode bar** (bottom, beside the legend): appears in ghost-city mode ("Ghost city · n actions from
  T+x · expected y% fewer critical facility-hours · Exit") and red-team mode ("Red team · Poisoned
  streams: … · Restore clean").
- **Toasts** (top): first CRITICAL facility per system during playback, scenario blurbs, red-team
  and live-weather status.

## Inspector (right panel)

Opens when a facility is selected; Esc closes it.

| Section | Content |
| --- | --- |
| Header | name, ID, subtype, district, coordinates and hemisphere, residents within 1.2 km |
| Live sensor feed | procedural feed by type: traffic camera (vehicles slow and bunch with congestion), culvert camera with a staff gauge, SCADA one-line, hospital bed board, EMS unit board, mobile-site board, radar scope. Film grain and scanlines; the tag reads LIVE, ARCHIVE, LAST FRAME or OFFLINE. |
| State | ring gauge with the risk % and an uncertainty arc, state pill, 2 h trend and +6 h forecast |
| Readings | a capacity measure per type (channel capacity, pump duty, volume/capacity, transformer load, bed occupancy, units committed, battery hold-up used, rain rate) · ETA to critical with p10–p90 and probability · P(critical within 24 h) · sensor trust · the raw reading (stage, wet well, average speed, bus voltage, ED wait, response time, sites on air) · uncertainty ± pts and active upstream links |
| Inbound cascade sources | compass (N, E, S, W): active / total candidate links per quadrant, strongest source and flow |
| Multi-horizon forecast | fan chart: past analysis (24 h), mean with p10–p90 forward (36 h); in historical mode the dotted line is the actual. Horizon tiles +1, +6, +12, +24 and +48 h, with mean, band and P(critical). |
| Hourly peak risk · last 12 h | bar chart |
| Why this risk · causal trace | ranked drivers: baseline, hazard ("Rainfall on catchment", "Chlorine plume" …) and each upstream link with mechanism, lag, weight ± sd, status, the upstream sensor's reading and trust. Click a driver to jump to that facility. The strongest chain back to the hazard is shown, e.g. Rainfall → Ambazari Lake spillway → Nag River at Ambazari Rd → … |

## Timeline (bottom)

- **Play / pause** (or Space) and **speed** cycling 1×, 2×, 4× and 8× (simulated hours per second
  during playback).
- **Track**: a 72 h canvas of city risk (past in colour, forecast hatched), CRITICAL event ticks, a
  red dashed **NOW** marker and a draggable thumb. Arrow keys step 30 min; Shift + arrow steps 6 h.
- Range label with the start and end dates in local time.
- **Trigger cascade**: switches to live mode and streams the sensors from T+0 at the chosen speed.
  The camera follows the first critical facility per system and toasts announce each one, so you
  watch the filter and the learner work in real time.
- **Reset**: back to live "now", closes drawers and the inspector, stops orbit, overview camera.
- **Auto-orbit**: slow camera orbit (stops on any interaction).

In live mode the clock advances one simulated minute per real second (0.1 h every 6 s), and the
view follows if you are at "now".

## Toolbar drawers

Six drawers (one open at a time; Esc closes):

| Drawer | Contents |
| --- | --- |
| **Dependency graph** | *Systems*: a hexagon per system, with arcs lit and numbered in propagation order, confirmed/candidate counts and mean lag, plus a "Replay propagation" animation. Also the raw-stream screen (system pairs, correlation, lag) with the weather partialled out. *Facility links*: every link filterable by status, with mean ± sd, lag, evidence %, status and "carrying stress"; click to fly. |
| **Interventions** | Crew budget (3, 5, 7) with pips. The action catalogue with cost, detail, side effect and the gain of each action alone. **Recommend within budget** runs the greedy planner. The outcome shows critical facility-hours, hospital and EMS hours and P(hospital critical) against doing nothing, a verdict (Cascade broken / Mitigated / Marginal) and side effects. The **decision deadline** chart shows benefit against start delay, with "Start by T+x to keep 80% of the benefit". **Ghost city** repaints the twin with the plan. |
| **Validation** | Median lead, detection, false alarms, Brier and skill; the reliability diagram; the longest lead times; the isolation statement |
| **Crises** | Cascade-R with per-system network vs hazard shares and the forecast crossing time; crisis cards (ID, stage, type, districts, systems, people, facilities, since, next CRITICAL); crisis × system matrix; interactions (coupling, contention). Click a crisis to focus it and fit the map to its footprint. Footprints and labels are drawn on the map while the drawer is open. |
| **Red team** | Five attacks (frozen gauge, spoofed SCADA spike, tampered rain gauge, bot burst of 12 reports, 60% telemetry blackout), an onset of 12, 6 or 3 h before the decision time, and **Launch**. The outcome shows sensors flagged, nowcast error against the control, max shift, false and delayed alerts, and per attack raw feed / attacked twin / control twin against the hidden truth. **Show attacked twin on the map** swaps the twin; **Restore clean streams** swaps it back. |
| **Comms** | *SITREP*: copy or download as `.txt`. *CAP 1.2*: crisis picker, a summary (severity, urgency, certainty, info blocks, polygon vertices), syntax-highlighted XML, copy or download as `.xml`. *Public alerts*: SMS per crisis area in each language with encoding, characters and segments. |

## Scenario menu and live weather

The scenario menu lists the city's scenarios (city-specific first) plus **Live weather · GFS
ensemble (online)**. Choosing a scenario re-runs the ensemble behind a loading veil and keeps the
selected facility. Choosing live weather fetches the ensemble (15 s timeout) and switches to live
mode. Offline, the menu reverts with an explanation.

## Keyboard

| Key | Action |
| --- | --- |
| Space | play / pause (when focus is not on a button) |
| Esc | close the open drawer, otherwise close the inspector |
| ← / → on the timeline | step 30 min |
| Shift + ← / → | step 6 h |
| Tab | moves through every control; focus rings are always visible |

## Responsive behaviour

- Below 1320 px of map width, toolbar labels collapse to icons.
- Below 1180 px the left panel becomes a drawer (menu button).
- Below 960 px the cascade strip, legend and some status items hide, and the toolbar moves under
  the top bar.
- The inspector takes the full width on narrow screens.

Continue with [The operations layer](06-operations-layer.md).
