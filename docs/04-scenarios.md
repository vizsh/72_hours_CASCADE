# 4 · Scenarios: every crisis you can simulate

**Nagpur has 8 scenarios: 7 replays plus live weather. Raleigh has 5: 4 replays plus live
weather.** Every scenario runs through the same engine, crisis tracker, planner, red team,
communications and validation.

| # | ID | Name | Hazard family | Cities | Clock origin (T+0) | "Now" in live mode | Storm heading |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `monsoon2023` | Monsoon cloudburst · 23 Sep 2023 | Weather: rain, lake overflow (**real event**) | Nagpur | 21 Sep 2023 06:00 IST | T+37 (22 Sep 19:00) | 62° |
| 2 | `chlorine` | Chlorine release at a water treatment plant | Industrial: toxic plume | Nagpur | 24 Oct 2026 00:00 IST | T+31 | 70° |
| 3 | `festival` | Immersion-day crowds meet an evening storm | Human: crowds + rain | Nagpur | 24 Oct 2026 00:00 IST | T+36 | 50° |
| 4 | `blackout` | Grid fault and telecom blackout | Infrastructure: grid fault | Nagpur, Raleigh | city default | T+30 | 90° |
| 5 | `tropical` | Tropical remnant rainfall | Weather: two rain bands | Nagpur, Raleigh | city default | T+34.5 | 40° |
| 6 | `flash` | Convective flash flood | Weather: stalled thunderstorms | Nagpur, Raleigh | city default | T+34.5 | 70° |
| 7 | `heat` | Heat wave and grid stress | Weather: heat dome + derecho | Nagpur, Raleigh | city default | T+34.5 | 110° |
| 8 | `live` | Live weather · GFS ensemble | Real-time weather (online) | Nagpur, Raleigh | the current hour − 24 h | T+24 (now) | from the mean wind |

City defaults: Nagpur `2026-10-24T00:00:00+05:30` (IST); Raleigh `2026-10-24T00:00:00-04:00`
(EDT). The traffic model knows the weekday of T+0, so weekend and weekday peaks differ.

How to open each one:

- **Operations room:** pick it in the scenario menu (top right of the map), or open
  `twin.html?scenario=<id>` (add `&city=raleigh` for Raleigh). Live weather is the last menu item.
- **Website:** the Scenarios page lists all of them. The lab, graph and My area pages each have a
  scenario menu. The command palette (Ctrl K) lists every replay.

Results for every scenario are in [reference/results.md](reference/results.md): scorecard,
cascade shape, crises at "now" and at the peak, action catalogue, recommended plan and deadline,
and red-team outcomes.

---

## How a scenario is defined

A scenario is a small plug-in in [`src/js/engine/scenarios.js`](../src/js/engine/scenarios.js):

```js
{
  id, label, blurb,
  cities: ['nagpur'],          // optional: restrict to cities
  t0: '2023-09-21T06:00:00+05:30', liveNow: 37, heading: 62,
  hazardLabel: { power: 'Grid fault', … },   // optional: names the hazard driver in explanations
  sample(rand, truth) { … },   // draw parameters for a member (prior) or the hidden truth
  rain(p, s, c, t),            // mm/h at along-track s, cross-track c (km), time t (h)
  heat(p, t),                  // 0–1
  wind(p, s, c, t),            // 0–1
  extra(p, facility, kind, site, t, i),   // optional: non-weather stress added to the target
}
```

Rain bands use an asymmetric pulse: a Gaussian rise and a tail 1.45× slower, the usual shape of a
band passing a gauge. `lognorm(s)` below means `exp(N(0, s))`, and `N(μ, σ)` is a normal draw.

---

## 1. Monsoon cloudburst · 23 Sep 2023 (`monsoon2023`, Nagpur)

A reconstruction of the pre-dawn cloudburst over Nagpur on 23 September 2023: about 106 mm in
four hours, with Ambazari Lake overflowing into the Nag River. Timing and totals follow
IMD-reported figures; city telemetry is modeled.

| Parameter | Truth | Members (prior) |
| --- | --- | --- |
| Band 1 (afternoon shower, 22 Sep) | T+32, 8.5 mm/h, width 1.4 h | T+32 ± 2.5, 8 × lognorm(0.4), width 1.2–2.0 |
| Band 2 (build-up) | T+41, 12 mm/h, width 1.6 h | T+41 ± 3, 11 × lognorm(0.45), width 1.3–2.2 |
| Band 3 (the cloudburst) | **T+44.5 (23 Sep 02:30 IST), 33 mm/h**, width 1.25 h | T+44.5 ± 3.5; 70% of members ~29 mm/h, 30% a weak 12 mm/h band, × lognorm(0.35); width 1.0–1.7 |
| Band speed | 30 km/h | 22–38 km/h |
| Spatial focus | cross-track −2.2 km, width 6.5 km | N(0, 3) km |
| Gradients | gx −0.25, gy +0.05 | N(0, 0.3), N(0, 0.25) |
| Wind | 0.45 × band-3 pulse × a3/30 | same form |

**What cascades:** Ambazari Lake spillway → Nag River gauges (Ambazari Rd, West High Court Rd,
Wardha Rd …) → flooded crossings and junctions (Jhansi Rani Square, Zero Mile, Ajni Square) →
ambulance delays (112 Control Room, EMS stations) → hospital load (GMC, Mayo) and substations in
the floodplain. The Pili River system (Gorewada, Gittikhadan, Mankapur) floods separately.

**Highlights** ([details](reference/results.md#nagpur--monsoon-cloudburst--23-sep-2023)):

- Issued at 06:00 on 22 Sep, the forecast lists the lake spillway going over capacity around
  23:30 that night. That is 18.5 h before the first facility actually went critical.
- Cascade-R crosses 1 at T+46. Forecast from T+37, it predicts the same crossing.
- 31 facilities are critical at the peak (T+47). There are 5 concurrent crises: the main Nag flood
  plus separate Ganeshpeth, Gorewada–Gittikhadan, Mahal and Mankapur crises.
- Replay skill: median lead 22.5 h, 85% of critical events warned, 0 false alarms, Brier skill +0.81.

## 2. Chlorine release at a water treatment plant (`chlorine`, Nagpur)

A chlorine cylinder fails at the Seminary Hills water treatment plant (79.0626, 21.1782). The
plume follows the wind. Closures and evacuation load the roads ambulances need, and breathing
complaints reach the nearest hospitals. This is a modeled release.

| Parameter | Truth | Members |
| --- | --- | --- |
| Release time | T+29.5 | T+29.5 ± 0.4 |
| Duration | 5 h (then 35% of the effect for 3 h) | 3–7 h |
| Source strength `q` | 1.0 | 0.5–1.4 |
| Wind from | 330° (north-north-west) | 330° ± 22° |
| Wind speed `u` | 3.0 m/s | 2–4.5 m/s |

**Dispersion:** ground-level Gaussian plume with Briggs open-country stability class C spreads
(lateral and vertical), normalised so 1.0 is the on-axis concentration 3 km downwind for the
nominal release, capped at 2.5.

**Stress added at each facility** (`extra`): traffic 0.62·min(1, c), EMS 0.5·min(1, 1.2c),
hospital 0.42·min(1, 1.4c), weather 0, others 0.15·min(1, c). Light afternoon heat; no rain.

**What cascades:** Civil Lines junctions and the 112 Emergency Control Room (EMS-PCR) reach HIGH
RISK first, followed by Zero Mile; hospitals are forecast to load later. The crisis registry types
it as a *Toxic release*. The best action is staging ambulances, and the decision deadline says to
act immediately: the benefit falls from 55% to 11% within four hours and to nothing by six. No facility reaches CRITICAL, so
the validation scores are "too few events".

## 3. Immersion-day crowds meet an evening storm (`festival`, Nagpur)

Processions converge on Gandhi Sagar (79.0995, 21.1468; weight 1.0) and Futala (79.0545,
21.1460; weight 0.7) for immersion while a thunderstorm builds. Crowds fill the streets that flood
first, ambulances slow, and exits near the ghats tighten. This is a modeled scenario.

| Parameter | Truth | Members |
| --- | --- | --- |
| Crowd start | T+40 | T+40 ± 0.6 |
| Crowd duration | 8 h | 6–10 h |
| Peak density | 0.6 | 0.4–0.75 |
| Storm | T+42.5, 24 mm/h, width 1.1 h, 18 km/h | T+43 ± 3, 18 × lognorm(0.45), width 0.8–1.5, 12–24 km/h |

**Crowd stress:** density `peak · sin(π·phase)^0.7` over the crowd window, weighted by the
nearest site: `weight · exp(−d²/(2·1.4²))` with d in km. Traffic gets density × weight, EMS
0.7×, hospitals 0.25×.

**What cascades:** two crises run side by side, which is the point of the scenario. A *Crowd
surge* crisis covers the Gandhibagh, Dharampeth, Civil Lines and Sitabuldi junctions with EMS and
hospitals, while an *Urban flood* crisis rises on the Nag at Ambazari.

## 4. Grid fault and telecom blackout (`blackout`, Nagpur and Raleigh)

A transmission fault drops a cluster of substations for most of a night. Mobile sites run down
their batteries, calls stop reaching dispatch, and hospitals burn diesel. This is a modeled
scenario.

| Parameter | Truth | Members |
| --- | --- | --- |
| Fault time | T+27 | T+27 ± 2.5 |
| Duration | 11 h, then 40% for 2 h during restoration | 8–14 h |
| Magnitude | 0.62 | 0.4–0.75 |
| Radius | 5.5 km around a point near the centre | 4–7 km |
| Light rain | 0.4 mm/h around T+50 | 0–0.6 |
| Heat | constant 0.15 | |

**Stress added:** power facilities only, `mag · exp(−d²/(2·rad²))` while the fault is on. The
rest is propagation: substations → telecom sites (battery hold-up delays the failure) → EMS
dispatch → hospitals on backup. Explanations name the driver "Grid fault" (power, telecom) and
"Signals dark" (traffic).

**Highlights:** Nagpur's Cascade-R goes from 0.68 at T+30 to 1.26 at T+34 and about 2 by T+40. The
cascade is self-sustaining shortly after the fault. The planner picks telecom backup, mobile
generation at GMC and ambulance staging. Raleigh has no telecom layer, so there the cascade never
becomes self-sustaining (peak Cascade-R 0.84): a direct demonstration that structure decides
outcomes.

## 5. Tropical remnant rainfall (`tropical`, Nagpur and Raleigh)

Two rain bands from a decaying tropical system moving south-west to north-east, on saturated soils.

| Parameter | Truth | Members |
| --- | --- | --- |
| Band 1 | T+21.5, 17 mm/h, width 2.5 h | T+23 ± 3.6, 16.5 × lognorm(0.33), width 2.3–3.3 |
| Band 2 | T+45, 13 mm/h, width 2.2 h, present | T+45 ± 4.5, 12 × lognorm(0.45), width 1.8–2.8, present in 78% |
| Background rain around T+30 | 1.0 | 0.6–1.5 |
| Speed | 28 km/h | 22–36 km/h |
| Gradients | 0.30, 0.18 | N(0, 0.25) each |
| Wind | 0.5 × band-1 pulse × a1/20 | |

The first critical facility appears at T+23.5 in Nagpur. Cascade-R is already above 1 by T+27,
and the cascade runs long (peak at T+57.5 with 24 critical).

## 6. Convective flash flood (`flash`, Nagpur and Raleigh)

Training thunderstorms stall over one basin for three hours. The blurb names Raleigh's Crabtree
basin; the same physics runs on Nagpur.

| Parameter | Truth | Members |
| --- | --- | --- |
| Cell 1 | T+15.5, 46 mm/h, width 1.15 h | T+17 ± 3.5, 34 × lognorm(0.38), width 0.9–1.5 |
| Cell 2 | T+39, 22 mm/h, width 0.9 h, present | T+40 ± 5, 16 × lognorm(0.5), width 0.7–1.3, present in 60% |
| Speed | 12 km/h (slow, so it trains) | 8–18 km/h |
| Focus | cross-track −3.5 km, width 4.5 km | N(0, 3) km |
| Gradients | 0.55, −0.1 | N(0, 0.35), N(0, 0.3) |

The fastest cascade of the set: first critical at T+16, Cascade-R above 1 at T+18.5, and 30
critical facilities by T+21 in Nagpur.

## 7. Heat wave and grid stress (`heat`, Nagpur and Raleigh)

A three-day heat dome, with a derecho line crossing the city late on day two.

| Parameter | Truth | Members |
| --- | --- | --- |
| Peak heat | 0.92 | 0.65–1.0 |
| Day-over-day ramp | 0.12 | 0.06–0.16 |
| Derecho time | T+41 | T+42 ± 5 |
| Derecho wind | 0.85, width 1.1 h, 55 km/h | 0.4–1.0, 0.7–1.5 h, 40–70 km/h |
| Derecho rain | 26 mm/h | 14–32 mm/h |

Heat follows a diurnal curve peaking at 15:30, ramps day over day, and breaks to 55% after the
storm. Heat loads power (+0.38·heat), hospitals (+0.2·heat illness), EMS and pumps. The derecho
adds wind damage on exposed substations and telecom.

## 8. Live weather · GFS ensemble (`live`, online)

Built at runtime by [`src/js/engine/live.js`](../src/js/engine/live.js) from the Open-Meteo
ensemble API (`models=gfs025`, `past_days=1`, `forecast_days=3`, hourly precipitation, 2 m
temperature, 10 m wind speed and direction, in the city's time zone):

- **Members:** each particle draws one of the 31 GFS members (control + 30 perturbed). It adds an
  intensity scale `lognorm(0.3)`, a timing shift `N(0, 1.2)` h, a speed of 18–40 km/h and spatial
  gradients `N(0, 0.25)` for sub-grid uncertainty.
- **Truth:** the control member. City sensor streams are synthesized from it until real feeds are
  connected, and the UI says so.
- **Hazards:** rain is the interpolated hourly precipitation. Heat is `clamp((T − 33 °C)/12, 0, 1)`.
  Wind is `clamp((speed·√scale − 28)/55, 0, 1)`.
- **Clock:** T+0 is the current hour minus 24 h, so the twin opens with a day of history and about
  48 h of forecast. "Now" is T+24 plus the minutes past the hour.
- **Heading:** opposite to the mean 10 m wind direction over the next 48 h.
- **Caching:** the fetch is reused for 30 minutes. With no connection the menu reverts and a toast
  explains that the replays still work offline.

## Sensor faults and false reports present in every scenario

These come from the city data and apply to every scenario in that city. The twin is never told
about them; see [Engine § 5](03-engine.md#5-sensor-trust).

| City | Sensor | Fault | Window |
| --- | --- | --- | --- |
| Nagpur | `DRN-NWH` Nag River at West High Court Rd | gauge reading frozen | T+18 to T+40 |
| Nagpur | `TRF-JRS` Jhansi Rani Square | camera feed offline | T+28 to T+38 |
| Nagpur | `WX-ITW` Rain Gauge, Itwari | reads +0.3 high (debris in funnel) | T+30 to T+72 |
| Raleigh | `DRN-CTL` Crabtree Creek at Lassiter Mill Rd | gauge reading frozen | T+18 to T+40 |
| Raleigh | `TRF-WOB` Wade Ave at Oberlin Rd | camera feed offline | T+28 to T+38 |
| Raleigh | `WX-NCS` Rain Gauge, Centennial Campus | reads +0.3 high (debris in funnel) | T+30 to T+72 |

| City | Time | False report |
| --- | --- | --- |
| Nagpur | T+12.5 | Explosion at Mankapur substation (`PWR-MNK`) |
| Nagpur | T+16.5 | Zero Mile junction submerged (`TRF-ZRM`) |
| Nagpur | T+40 | Gorewada dam breach (`LAK-GRW`) |
| Raleigh | T+12.5 | Explosion at the Wade Ave substation (`PWR-MRD`) |
| Raleigh | T+16.5 | Street flooding at Fayetteville St & Martin St (`TRF-FMS`) |

The exact wording of each fault and report is in the city references:
[Nagpur](reference/nagpur.md#planted-sensor-faults-3) and [Raleigh](reference/raleigh.md).

## Adding a scenario

1. Add an object to `SCENARIOS` in `scenarios.js` with `id`, `label`, `blurb`, `heading`,
   `sample`, `rain`, `heat`, `wind`, and optionally `cities`, `t0`, `liveNow`, `hazardLabel`,
   `extra`.
2. If it has a new hazard family, add it to `PRIORITY` and `FAMILY_LABEL` in `analytics.js` and to
   the message templates in `comms.js`.
3. Run `node tools/test/qc_regress.js` and `node tools/test/ops_probe.js <city> <id>`.
4. Re-generate the reference docs with `node tools/gen_docs.js`.

Nothing else changes: the operations room, website, planner, red team and validation pick it up
automatically.
