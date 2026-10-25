# 1 · Overview and approach

## The problem

Cities warn about hazards: "heavy rain likely in Nagpur district". People and responders act on
consequences: which road floods, when the substation fails, whether the hospital can still take
patients, how ambulances get there. Between the two sits a chain of dependencies nobody wrote
down. Lakes feed rivers, rivers flood crossings, crossings delay ambulances, substations feed
hospitals and mobile sites, and mobile sites carry calls to dispatch. A failure in one system
propagates into others with delays of minutes to hours, and the chain can feed itself.

CASCADE '26 (IIIT Nagpur) Theme 2, Problem 2, *The 72-Hour Warning*, asks for a system that:

1. predicts cascading urban crises up to **72 hours** ahead, with **NORMAL / WATCH / HIGH RISK /
   CRITICAL** states per zone and city-wide;
2. **discovers dependencies** from data instead of assuming them;
3. predicts the **cascade** itself, including branching, feedback loops and interacting crises;
4. **learns online** as conditions drift;
5. copes with **uncertainty** and **adversarial or faulty inputs**;
6. **explains** each prediction with evidence per link;
7. recommends **constrained counterfactual interventions** with their side effects;
8. **generalises** to a city not seen during development;
9. is **validated temporally** on replayed streams with strict future-data isolation.

## Who it is for

| User | Needs | Where they work |
| --- | --- | --- |
| Emergency operations centre (EOC) duty officer | What is failing now, what fails next, how sure, by when | Operations room |
| Planner or incident commander | Which actions to take with limited crews, what they cost elsewhere, the deadline to start | Intervention lab, operations room |
| Infrastructure analyst | Why a facility is at risk, which links carry the stress | Knowledge graph, inspector |
| Communications officer | A situation report, a CAP alert and SMS in local languages | Communications desk |
| Security and data-quality reviewer | How the system behaves when its inputs are attacked | Red-team console |
| Resident | Is my area at risk, when, and what should I do, in my language | My area |
| Evaluator or judge | Proof it works and is honest | Home, method, validation, scenarios |

## What CASCADE 72 is

A **digital twin of Nagpur**. It has real geography (OpenStreetMap streets, rivers, lakes,
buildings, substations, hospitals, junctions) and 57 monitored facilities across drainage, roads,
power, telecom, emergency response and hospitals, joined by 102 candidate dependency links. On top
sits a **cascade intelligence layer** that runs entirely in the browser:

- a 200-member **ensemble** of possible futures, assimilated every 30 minutes with a **localized
  particle filter**;
- **sensor trust** from four independent checks, so faulty or spoofed feeds degrade gracefully;
- **online dependency learning** by sparse Bayesian regression with automatic relevance
  determination;
- forecasts, **time to critical**, **Cascade-R** (is the cascade feeding itself?) and a **crisis
  registry** of concurrent crises with their own identities;
- a **planner** that tests actions on the same futures as doing nothing, with side effects,
  **decision deadlines** and a **ghost-city** view;
- a **red-team console**, a **communications desk** (SITREP, CAP 1.2, SMS in English, Hindi and
  Marathi), **live weather** from the GFS ensemble, and **replay validation**;
- a **multi-page website** around the operations room that explains, demonstrates and exposes all
  of it to non-specialists.

**Raleigh, North Carolina** ships as the unseen-city test: 44 facilities, a different river system,
grid, language set and time zone, with nothing retuned.

## Key numbers

| | |
| --- | --- |
| Cities | 2 (Nagpur default, Raleigh as the unseen city) |
| Scenarios | 8 in Nagpur (7 replays + live), 5 in Raleigh (4 replays + live) |
| Nagpur facilities | 57: 13 drainage (incl. 1 pump station), 13 junctions, 9 substations, 5 telecom, 4 EMS, 6 hospitals, 7 weather |
| Nagpur candidate links | 102, of which 7 are planted fakes |
| Nagpur modeled population | 2,935,456 on 1,790 cells of 450 m |
| Ensemble | 200 members, 145 steps of 30 minutes (72 h) |
| Monsoon replay | 18.5 h warning before the first critical facility; median lead 22.5 h; 85% of critical events warned; 0 false alarms; Brier skill +0.81 |
| Website pages | 8 (home, knowledge graph, intervention lab, scenarios, live, My area, method, operations room) |
| Build step | none: static files, vanilla JavaScript, no framework, works offline |

## Design principles

1. **Real geography, honest telemetry.** Locations and networks are real. City sensor streams are
   simulated and labelled, because Indian cities do not publish live drain, feeder or bed data. The
   forecaster is scored against a hidden world model it never reads.
2. **Probabilities, not a single line.** Every forecast is an ensemble. Every number carries a
   spread, a probability or both.
3. **Learn the structure, don't assume it.** Links start as hypotheses with zero weight and must
   earn their place from evidence.
4. **Strict future-data isolation.** A forecast issued at step k sees readings at steps ≤ k only.
   Validation enforces it.
5. **Explain everything.** Every risk decomposes into baseline, hazard and each upstream link, with
   the evidence behind it.
6. **Compare actions on identical futures.** The difference you see is the action, not luck.
7. **Degrade, don't break.** Faulty sensors are quarantined rather than trusted or ignored;
   missing feeds widen the forecast instead of blinding it.
8. **Hazard-agnostic core.** A hazard is a plug-in that says how it stresses facilities. Everything
   downstream is shared, which is what makes a new city or a new crisis cheap.
9. **Runs anywhere.** Static files, offline tiles, no server-side compute, no build step. A judge
   can open it on a laptop with no network.

## Requirement-by-requirement

| Brief requirement | How it is met | Code | Where to see it |
| --- | --- | --- | --- |
| 72 h prediction with four states, per zone and city-wide | 200-member ensemble over 145 half-hour steps; facility states from fixed thresholds; city state from a tier-weighted index that escalates with the number of critical facilities | `engine.js` (`forecast`, `project`, `cityAt`) | Operations room map, timeline, top bar; My area |
| Dependency discovery | ARD regression per facility over candidate links: confirmed / pruned / awaiting evidence; model-free raw-stream screen at system level; 7 planted fakes to test it | `engine.js` §6, `discover` | Knowledge graph page; Dependency graph drawer |
| Cascade prediction: branching, feedback, interacting crises | Lagged propagation through the learned network with feedback loops; forecast crossing sequence; crisis registry with coupling and contention between crises; Cascade-R | `engine.js` (`cascade`), `analytics.js` | Cascade strip, Crises drawer, home predicted course |
| Online learning under drift | Particle filter with forgetting (λ = 0.985, about 23 h memory) and adaptive tempering; link learner with forgetting 0.995 | `engine.js` §4, §6 | Trigger cascade; Method page |
| Uncertainty and adversarial inputs | Ensemble spread and calibrated probabilities; four sensor-trust checks; quarantine; severity-aware corroboration of citizen reports; red-team console | `engine.js` §5, `redteam.js` | Inspector (trust, ±), alerts feed, Red team drawer |
| Explanations with evidence per link | `explain()`: baseline, hazard and each link with posterior weight ± sd, lag, mechanism, upstream reading and trust | `engine.js` §8 | Inspector causal trace; graph side panel |
| Constrained counterfactual interventions with side effects | Action catalogue generated from each city's graph; re-simulation from the decision step on the most probable members; greedy planner under a crew budget; side effects; decision deadlines; ghost city | `interventions.js` | Interventions drawer, Intervention lab |
| Generalisation to an unseen city | Raleigh runs on the same engine, catalogue generator, analytics and UI with no retuning | `tools/build_data.py`, `spec*.py` | `twin.html?city=raleigh`; Scenarios page |
| Temporal validation with future-data isolation | Replay scoring: Brier, skill, reliability, lead time, detection, false alarms against the hidden truth | `engine.js` §12 | Validation drawer, Method page, home scorecard |

Beyond the brief: people exposed, crisis identities and footprints, Cascade-R, CAP 1.2 alerts,
multilingual SMS, live GFS weather, a public "My area" view, and a red-team console.

## How the pieces fit

```
           real geography (OSM)            hazard plug-in (scenario)
                    │                               │
          facilities + candidate links        rain / heat / wind / extra stress
                    └──────────────┬────────────────┘
                                   ▼
                 200 simulated futures  ─────►  hidden truth (separate seed)
                                   │                     │
                                   │              sensor streams + faults + attacks
                                   ▼                     ▼
             localized particle filter  ◄── sensor trust (residual, flatline, buddy, step)
                                   │
         ┌──────────────┬──────────┼───────────────┬─────────────────┐
         ▼              ▼          ▼               ▼                 ▼
   nowcast + spread  forecasts  ARD link      explanations      alerts + reports
                     + TTC      learning                        (corroboration)
         └──────────────┴──────────┬───────────────┴─────────────────┘
                                   ▼
          Cascade-R · crisis registry · planner (deadlines, ghost city)
                                   ▼
          operations room · website · SITREP / CAP / SMS · validation
```

Continue with [Architecture](02-architecture.md).
