# 72 Hours · CASCADE: gap analysis and build plan

This repository started as an import of [`shreyascoder2006/72_UI`](https://github.com/shreyascoder2006/72_UI). That is a dark, 3D digital twin of Raleigh, NC, with an in-browser cascade engine. This document compares it with the problem statement (CASCADE '26 · Theme 2 · *The 72-Hour Warning*) and with the parallel build in [`vizsh/CASCADE_72_Hours`](https://github.com/vizsh/CASCADE_72_Hours), then sets out what to add.

## What 72_UI already does well

| Area | What exists |
|---|---|
| Look and feel | 3D OSM building massing on a charcoal CIM basemap; hex facility markers on stems; animated water, traffic and cascade flows; weather radar; glass panels; cascade stage strip; 72 h timeline with scrubbing and playback; auto-orbit |
| Live views | Procedural sensor feeds per facility: traffic camera, culvert staff gauge, SCADA one-line, bed board, EMS unit board, radar scope |
| Engine | 44 facilities, 200-member ensemble, localized particle filter with forgetting and adaptive tempering, sensor trust from residuals and flatlines, ARD dependency learning (confirm / prune / candidate), type-level discovery from raw streams, cascade sequence, alerts, citizen-report corroboration, replay validation (Brier, reliability, lead, FAR) |
| Decisions | 7 hand-authored interventions with crew costs and side effects; greedy planner |
| Engineering | Runs as static files (offline tiles, no bundler); single-file CSP-safe build; Playwright smoke tests |

## What is missing

| # | Gap | Why it matters |
|---|---|---|
| 1 | **Wrong city.** Everything is Raleigh, NC. | The judges are at IIIT Nagpur. The statement also asks for generalisation "on a city not seen during development"; one city cannot show that. |
| 2 | **Hard-coded to one city.** Interventions, sensor faults, false reports, time zone (EDT), labels and camera are all wired to Raleigh IDs. | Blocks a second city. Makes the decision layer look scripted. |
| 3 | **Weather-only hazards.** Tropical rain, flash flood, heat + derecho. | The brief says "cascading urban crises". No grid fault, telecom blackout, industrial release or crowd event. |
| 4 | **Missing systems.** No telecom, no water supply. | The comms-blackout and water-outage cascades in the brief cannot be expressed. |
| 5 | **Abstract risk index only.** No people, no exposure, no equity. | A risk number without "how many people, where" is not consequence-first. |
| 6 | **No crisis identity.** One undifferentiated cascade. | Multiple concurrent crises, each with its own ID, footprint, lifecycle and the links between them. |
| 7 | **Interventions are a fixed list.** No decision deadline, no before/after view, no resource inventory. | "Recommend preventive actions under limited resources … estimate how each would break the cascade" needs deadlines and a visible counterfactual. |
| 8 | **Adversity is scripted.** Faults are hard-coded. | A judge should be able to attack the system live and watch it cope. |
| 9 | **No city-wide propagation metric.** | The city state is a weighted index, not a measure of whether the cascade is self-sustaining. |
| 10 | **No outward communication.** No situation report, no CAP alerts, no Hindi or Marathi. | Warnings that never leave the dashboard do not reach the people at risk. |
| 11 | **No real-time input.** Purely synthetic weather. | The live mode should be able to run on today's real forecast. |
| 12 | **Lingering weak spots.** Sparse OSM buildings in Indian cities make the 3D view look empty. | Needs a population or massing layer derived from data. |

## What gets built (in this order)

1. **Multi-city twin with real Nagpur.**
   - Pipeline: the tile fetch takes any extent; `build_data.py --city`; per-city specs.
   - `tools/spec_nagpur.py` places gauges at real river × road crossings on the Nag, Pili and Pohara, and the Ambazari and Gorewada lake spillways. It adds real junctions (Chhatrapati, Ajni, Jhansi Rani, Zero Mile, Agrasen, Indora, Automotive and Mankapur squares, Ambazari T-point, the Ring Road railway underpass), real substations (Mankapur, Besa, Pardi, Uppalwadi, Hingna and 33/11 kV), and real hospitals (GMC, IGGMC Mayo, Wockhardt, Care, Orange City).
   - City switcher, per-city time zone and camera; Raleigh stays as the unseen-city generalisation test.
2. **Generic decision layer.** The intervention catalogue is generated from the dependency graph for any city, with Raleigh's hand-written catalogue kept. Faults and false reports move into the city specs.
3. **All-hazard engine.**
   - New scenarios: Nagpur monsoon cloudburst (the 23 Sep 2023 reconstruction), grid fault with telecom blackout, chlorine release from a water-treatment plant (Gaussian plume on the real wind axis), and immersion-day crowds meeting a storm.
   - Telecom becomes a system: mobile sites with battery hold-up, fed by substations, feeding EMS dispatch.
4. **Consequence metrics.** People exposed per facility catchment (from population density), and Cascade-R (propagated stress per unit of recent stress; above 1 the cascade feeds itself).
5. **Crisis registry.** Concurrent crises identified from the live state (connected stressed components of the dependency graph). Each has an ID, type, stage, footprint, people exposed and affected assets. A crisis × system matrix shows where crises interact.
6. **Intervention upgrades.** Resource inventory, decision deadlines (benefit as a function of start time), and a ghost-city toggle that repaints the twin with the counterfactual.
7. **Red-team console.** Inject a frozen gauge, a spoofed spike, a bot burst of false reports, or a 60% feed blackout. The ensemble re-runs, and trust, corroboration and the forecast respond.
8. **Communications.** Situation report generated from the engine state, CAP 1.2 XML export, and citizen alert previews in English, Hindi and Marathi.
9. **Live weather.** Open-Meteo's GFS ensemble for the selected city drives the hazard in live mode (dev server; the single-file CSP build stays offline).
10. **Population massing.** An extruded H3 population layer, so Indian cities with sparse building footprints still read in 3D.
