# 3 · The cascade engine

The engine is one file, [`src/js/engine/engine.js`](../src/js/engine/engine.js), plus the hazard
plug-ins in [`scenarios.js`](../src/js/engine/scenarios.js). It runs entirely in the browser
(main thread in the operations room, a Web Worker on the website) and in Node for tests. One call
builds a complete 72-hour world:

```js
const e = TWIN.engine.create(geo, { scenario: 'monsoon2023' });   // ~1.5–2 s, 200 members
```

This page documents every stage, with the constants used in the code.

- [Time grid and facility kinds](#time-grid-and-facility-kinds)
- [1. Simulation model](#1-simulation-model)
- [2. Ensemble and hidden truth](#2-ensemble-and-hidden-truth)
- [3. Observations, faults and attacks](#3-observations-faults-and-attacks)
- [4. Assimilation: localized particle filter](#4-assimilation-localized-particle-filter)
- [5. Sensor trust](#5-sensor-trust)
- [6. Online dependency learning (ARD)](#6-online-dependency-learning-ard)
- [7. Forecast products](#7-forecast-products)
- [8. Explanations](#8-explanations)
- [9. Cascade sequence and type-level discovery](#9-cascade-sequence-and-type-level-discovery)
- [10. Alerts and citizen reports](#10-alerts-and-citizen-reports)
- [11. City state](#11-city-state)
- [12. Replay validation](#12-replay-validation)
- [Engine object reference](#engine-object-reference)

---

## Time grid and facility kinds

| Constant | Value | Meaning |
| --- | --- | --- |
| `DT` | 0.5 h | assimilation and simulation step |
| `HOURS` | 72 | horizon |
| `K` | 145 | steps, T+0.0 … T+72.0 |
| `M` | 200 | ensemble members (overridable with `opts.members`) |
| `CRIT` | 0.75 | CRITICAL threshold on the 0–1 risk scale |
| `HIGH` | 0.55 | HIGH RISK threshold |
| WATCH | 0.35 | WATCH threshold (`core.stateOf`) |

Every facility has a risk value between 0 and 1. States: **NORMAL** < 0.35 ≤ **WATCH** < 0.55 ≤
**HIGH RISK** < 0.75 ≤ **CRITICAL**.

Facility kinds come from the facility's `type` and `subtype`:

| Kind | From | Examples |
| --- | --- | --- |
| `weather` | type `weather` | rain gauges, IMD observatory |
| `drainage` | type `drainage` | river gauges at road crossings, lake spillway gauges |
| `pump` | subtype `Pumping station` | Gandhi Sagar outfall pumps, Lake Boone pumping station |
| `traffic` | type `traffic` | junction cameras, underpass |
| `power` | type `power` | substations |
| `telecom` | type `telecom` | mobile-site clusters, telephone exchange |
| `ems` | subtype `EMS station` | fire and EMS stations, 112 control room |
| `hospital` | type `hospital` | hospitals with bed counts |

## 1. Simulation model

Each facility's risk follows a first-order response towards a **target**:

```
target_i(k) = forcing_i(t, hazard) + Σ_upstream  w_e · scale_e · g(r_from(k − lag_e)) + noise
r_i(k)      = r_i(k−1) + a · (target − r_i(k−1))        a = rise rate if target > r, else fall rate
```

Response rates per step (`DYN`):

| Kind | Rise | Fall | Character |
| --- | --- | --- | --- |
| weather | 0.85 | 0.85 | follows the hazard almost instantly |
| drainage | 0.42 | 0.10 | rises fast, drains slowly |
| pump | 0.50 | 0.20 | |
| traffic | 0.55 | 0.32 | |
| power | 0.50 | 0.22 | |
| hospital | 0.16 | 0.08 | census builds and clears slowly |
| ems | 0.50 | 0.28 | |
| telecom | 0.32 | 0.18 | battery hold-up: slow to fail, slow to recover |

**Only stress above normal propagates.** An upstream facility contributes
`g(r) = ((r − thr)/(1 − thr))^1.15` when `r > thr`, else 0, with `thr = max(0.3, base + 0.12)`.
Lags are at least one step, so feedback loops (hospital → EMS → hospital, substation ↔ substation)
resolve in a single forward pass.

**Exogenous forcing by kind** (`forcing()`), with `base = p.base + member offset`, `rain` in mm/h,
`heat` and `wind` in 0–1 from the scenario:

| Kind | Target before upstream links |
| --- | --- |
| weather | `max(rain/28, 0.9·wind, 0.85·heat)^0.9` |
| drainage | `base + (1 − base) · sigmoid((API − cap·capMul) / scale)` where API is antecedent precipitation with memory `tau` |
| pump | as drainage, `+ 0.25·heat` |
| traffic | `1.25·base·diurnal(t) + 0.14·min(1, rain/14) + 0.05·heat` (weekday-aware: AM/PM peaks on weekdays, a midday hump at weekends, 0.62× before 05:00) |
| power | `base·(0.85 + 0.25·bump(18:30)) + 0.38·heat + 0.5·wind·exposure` |
| hospital | `base + 0.03·bump(14:00) + 0.2·heat` |
| ems | `base·(0.85 + 0.3·bump(17:00)) + 0.12·min(1, rain/15) + 0.12·heat` |
| telecom | `base + 0.08·heat + 0.35·wind·exposure` |

Non-weather hazards (grid faults, plumes, crowds) add stress through the scenario's `extra()` hook;
see [Scenarios](04-scenarios.md). Process noise per kind (`NOISE`): weather 0.01, drainage 0.012,
pump 0.02, traffic 0.045, power 0.02, hospital 0.012, ems 0.035, telecom 0.015.

Site coordinates are rotated into the storm's frame (`heading`), giving each facility an
along-track distance `s` and a cross-track offset `c` (km). Scenarios use them for storm arrival
lags (`s / v`) and spatial gradients.

**Interventions** reuse `simulate()` with modifiers: a facility modifier scales the excess target
(`base + (target − base)·scale`) or adds load; an edge modifier scales a link's weight; both run
from a start step, optionally to an end step. A counterfactual branches from an existing member
trajectory at the decision step (`init = { k0, from }`).

## 2. Ensemble and hidden truth

`drawParams(rand, truth)` samples one world:

| Parameter | Members (prior) | Truth |
| --- | --- | --- |
| hazard parameters | `scen.sample(rand, false)`: timing, size, speed, gradients per scenario | `scen.sample(rand, true)`: fixed reconstruction |
| link weights `ew` | uniform in `[0, hi]`, `hi = 2w` (0.3 for planted fakes) | `w · U(0.8, 1.2)` (planted fakes stay 0) |
| capacity multiplier | `exp(N(0, 0.12))` | `exp(N(0, 0.05))` |
| base offset | `N(0, 0.025)` | `N(0, 0.01)` |
| exposure to wind | `U(0.5, 1)` | 0.8 |

Members use seeds `seed·1000 + m + 1` (seed 7); the truth uses `seed·7919 + 17` and its own noise
seed. **The forecaster never reads the truth.** It exists only to generate observations and to
score forecasts.

## 3. Observations, faults and attacks

```
obs_i(k) = clamp(truth_i(k) + N(0, 0.8·SIGMA_kind), 0, 1)
```

Reading noise `SIGMA`: weather 0.06, drainage 0.04, pump 0.05, traffic 0.07 (camera-derived),
power 0.035 (SCADA), hospital 0.02 (bed census), ems 0.035 (CAD), telecom 0.04.

Faults then corrupt the stream (city faults from the geodata, plus red-team scripts):

| Fault kind | Effect on readings in the window |
| --- | --- |
| `stuck` | repeats the first reading of the window |
| `dropout` | missing (NaN) |
| `bias` | `+ value` |
| `spike` | replaced with `value` |
| `blackout` (red team) | a random share of all channels go missing |

## 4. Assimilation: localized particle filter

For every step `k`, using only readings at steps ≤ k:

1. **Prior.** One-step-ahead prediction = weighted mean of members at k using weights from k−1,
   with its ensemble spread.
2. **Trust** for each sensor (next section).
3. **Likelihoods with forgetting.** For member m and sensor i:
   `L(k) = λ·L(k−1) − ½·((y − r_m)/σ)²·trust`, with `λ = 0.985` (about a 23 h memory). A
   quarantined sensor (trust < 0.5) forgets fast (`λ = 0.82`). Rain-gauge and drainage evidence
   also accumulates into a storm-level score `G`.
4. **Local weights.** `log w_m = 0.35·G_m + L_m(i) + 0.5·Σ L_m(upstream of i)`. Each facility is
   weighted by its own evidence and its upstream neighbours', so a storm that fits the east of the
   city is not forced on the west.
5. **Adaptive tempering.** The smallest temperature `T ≥ 1` that keeps the effective sample size
   ≥ 12% of M (`ESS_FLOOR`), found by warm-started bisection. The ensemble never collapses onto
   one over-confident member.
6. **Analysis.** Weighted member mean, blended with the reading by a Kalman-style gain
   `sd²/(sd² + (σ/trust)²)`. This is the risk the map shows (`now`), with its spread (`nowSd`).

## 5. Sensor trust

Updated every step for every sensor and clamped to [0.03, 0.99]. It starts at 0.92.

| Signal | Rule |
| --- | --- |
| Residual | `res = |y − prior| / sqrt(σ² + spread²)`. A sensor that disagrees with an uncertain forecast is not evidence of failure. EWMA 0.85/0.15; target trust `exp(−max(0, res − 1.6)/1.1)` |
| Flatline | reading unchanged (< 1e-6) while the prior moves > 0.004 for 4+ steps: target × 0.25 |
| Buddy check (rain gauges) | the gauge's anomaly against the median of other gauges, compared with the difference the ensemble expects: `rb = |Δobs − Δprior| / sqrt(2σ² + 0.08²)`, EWMA 0.6/0.4; target × `exp(−max(0, rb − 1.6)/0.7)` |
| Step test | a jump larger than the facility's own response allows (`rise·(1 − y_prev)` up or `fall·y_prev` down) plus 5σ is physically impossible: trust capped at 0.3 for that step |
| Offline | missing reading: trust drifts towards 0.35 |

Trust moves 25% of the way to its target each step. Trust scales each sensor's likelihood and its
weight in the analysis. A sensor below 0.5 raises a "reliability low" alert (once per episode;
re-armed when trust recovers above 0.75).

Effect on the planted Nagpur faults (monsoon replay): the frozen gauge DRN-NWH is quarantined at
about T+34, when the river starts rising. The camera dropout TRF-JRS is quarantined at T+33.5, and
the biased rain gauge WX-ITW at T+34.5. None of the checks raised a false flag in any replay
(`node tools/test/qc_regress.js`).

## 6. Online dependency learning (ARD)

No structure is given. Every candidate link is a hypothesis. For each facility the engine runs a
recursive Bayesian linear regression over its incoming links:

```
y  = obs(k) − (1 − a)·obs(k−1) − a·forcing_hat(k)        (what the hazard does not explain)
x_e = a · g(now_from(k − lag_e))                           (stress offered by each upstream link)
```

- Zero-mean priors with precision `α0 = 3 / hi²` (prior sd = hi/√3): no link is assumed to exist.
- Forgetting 0.995 per step on the sufficient statistics.
- Updates only when both readings exist, trust > 0.5 and the reading is not saturated.
- **Automatic relevance determination:** once a link has evidence, its prior precision is
  re-estimated by EM, `λ = 1/(mean² + sd²)`. Redundant links that move together get pruned.
  Without evidence the precision relaxes back towards the prior.
- Solved per facility by Gauss–Jordan on a small SPD system every step.

Link status at each step:

| Status | Rule |
| --- | --- |
| confirmed | mean ≥ 0.08, mean/sd ≥ 2.5, and more than half the posterior comes from data |
| pruned | mean < 0.05 and more than 60% of the posterior from data |
| candidate | otherwise: the upstream never left its normal band, so there is no evidence either way |

`edgePosterior(k, e)` returns `{ mean, sd, learned, status, active, flow }`, where `flow =
mean · g(upstream now)` is the stress the link is carrying.

## 7. Forecast products

| Function | Returns |
| --- | --- |
| `forecast(k, i)` | Perturbation forecast issued at k: each member starts from the analysis (offset decaying with a 6 h scale) and follows its own dynamics. Series of mean, p10, p90 and P(≥ CRIT) for every later step; horizons +1/6/12/24/48/72 h; time to critical (probability of reaching it and p10/median/p90 of the first crossing); `p24`. |
| `project(kFrom, kTo)` | Bias-corrected mean of every facility at kTo issued at kFrom. Drives the map when you scrub into the future. |
| `forcingEstimate(k, i, kAt)` | Weighted hazard forcing at kAt using evidence at k (used for forecast Cascade-R). |
| `edgesAt(k)` | Posterior of every link. |
| `cityAt(k)` | City summary (below). |

## 8. Explanations

`explain(k, i)` decomposes a facility's risk into ranked drivers:

- `base`: the normal operating level, labelled by kind ("Baseflow", "Baseline demand (time of day)" …);
- `hazard`: weighted forcing, labelled per kind or per scenario ("Rainfall on catchment",
  "Chlorine plume", "Grid fault" …);
- one `edge` driver per upstream link: value = posterior mean × g(upstream), with weight ± sd,
  status, lag, mechanism, and the upstream reading and its trust.

Shares are each positive driver's fraction of the total. The inspector shows these as the causal
trace; `inbound(k, i)` groups the same links by compass quadrant.

## 9. Cascade sequence and type-level discovery

- `cascade(k)`: for every non-weather facility, the HIGH RISK and CRITICAL crossings. Crossings
  already observed (analysis at or above the level at some step ≤ k) come first. Forecast
  crossings follow, with the median crossing time over members (weighted at k), listed when at
  least 30% of the weight crosses. Sorted by time.
- `discover(k)`: a model-free screen on the raw streams. Each system's mean reading (last value
  carried forward) is second-differenced, the weather signal is partialled out by distributed-lag
  regression over the trailing 24 h, and lagged correlation (1–10 steps) is computed between every
  pair of systems. A system link counts as found when r > 0.35 and it beats the reverse direction
  by 0.03. It checks the structure at system level, independently of the ARD learner.

## 10. Alerts and citizen reports

Built in one pass, each from information available at its step only:

| Alert | Rule |
| --- | --- |
| State | a facility enters HIGH RISK or CRITICAL (with hysteresis: it must fall two levels, or to NORMAL from HIGH, to re-arm) |
| Sensor | trust falls below 0.5 (after the first two hours); the text names the fault if one is known |
| Forecast | checked hourly: P(CRITICAL within 24 h) ≥ 60% for a facility still below HIGH; reports probability and ETA |
| Citizen report | genuine: 70% chance of a report 0.5–2 h after a drainage or junction truly reaches 0.62; planted: the city's false reports and red-team bots |

**Corroboration** scores each report against the twin's own estimate at that place (which already
discounts failed sensors) and against the severity it claims:
`conf = sigmoid((r − (level − 0.1)) / 0.09)·0.95 + 0.02`, where level = 0.55 for "water over the
road" and 0.75 for claims such as "the bridge collapsed". Planted reports score low unless the
place really is in that state.

## 11. City state

```
index    = Σ r_i·(4 − tier_i) / Σ (4 − tier_i)            (non-weather facilities)
cityRisk = clamp(0.5·index + 0.5·max_i r_i − (critical < 2 ? 0.08 : 0) + 0.04·max(0, critical − 2), 0, 1)
```

The city escalates with the number of critical facilities, not just the worst one. `cityAt(k)`
also returns counts per state and the mean ESS.

## 12. Replay validation

`validation()` replays the whole window (computed lazily, about 0.3 s):

- **Brier score and skill.** Every hour, for each facility and horizon of 6, 12 and 24 h:
  P(CRITICAL within the horizon) from the weights at that hour, against whether the truth crossed.
  Skill is `1 − Brier / Brier(climatology)`.
- **Reliability.** The same pairs in ten probability bins.
- **Warnings.** The first hour at which P(CRITICAL within 24 h) ≥ 60% is the warning. A warning
  is a false alarm if the truth does not go critical within 24 h + 6 h of it. Lead time is the
  time from warning to the truth crossing; an event with no prior warning is missed.
- Returns `brier, bss, base rate, bins, leads, medianLead, pod, far, alarms, falseAlarms, events,
  hits, pairs`.

**Strict future-data isolation:** observations at step k are only ever combined with steps ≤ k,
forecasts use the weights at their issue step, and the truth comes from a separate seed and never
enters the filter.

## Engine object reference

`TWIN.engine.create(geo, opts)` returns:

| Field / method | Description |
| --- | --- |
| `geo, scen, t0, F, E, N, M, K, DT, HOURS, idx, kinds, inEdges, outEdges` | world description |
| `FAULTS` | faults applied (city + red-team script) |
| `members, traj, truth, obs, now, nowSd, trust, prior, ESS` | arrays (`traj` is M×K×N, the rest K×N) |
| `kOf(t)` | hours → step |
| `stateAt(k)` | `{ risk, sd, trust, obs }` views at step k |
| `forecast, project, explain, forcingEstimate, edgesAt, edgePosterior, inbound, cascade, discover` | products above |
| `alerts` | alert list |
| `validation()` | replay scores |
| `cityAt(k)` | city summary |
| `radarParams(t, kNow), rainField(sp, lng, lat, t)` | rain field for the radar overlay (truth up to now, best member beyond) |
| `simulate, drawParams, R(m,k,i), wAt(k,i), g(r,j), thr` | internals used by interventions, analytics and the website |
| `diurnal(t)` | traffic diurnal factor |
| `truthParams` | the hidden storm (used only by validation and the radar's past) |

Options: `{ scenario, members, seed, faults, falseReports, script }`, where `script` is a red-team
injection `{ faults, reports, blackout }`.
