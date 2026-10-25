# 6 · The operations layer

Instruments built on top of the forecast: Cascade-R, the crisis registry, interventions (with
decision deadlines and the ghost city), the red-team console and the communications desk.

- [Cascade-R](#cascade-r)
- [Crisis registry](#crisis-registry)
- [Interventions](#interventions)
- [Red team](#red-team)
- [Communications](#communications)
- [People at risk](#people-at-risk)

---

## Cascade-R

**Question:** is the cascade still driven by the hazard, or is it now feeding itself?

Every facility's target decomposes into a baseline, the hazard's direct push and what each
upstream link delivers ([Engine § 8](03-engine.md#8-explanations)). Summed over the non-weather
facilities:

```
Cascade-R(t) = Σ positive link contributions / (Σ positive hazard contributions + 0.05)      clamped to [0, 9]
```

- **Below 1:** the city is reacting to the hazard. Stopping the rain stops the crisis.
- **Above 1:** more stress moves through the network than arrives from outside. You have to cut
  links (close a crossing, back up a feeder, stage ambulances), not just wait out the weather.

Code: `analytics.js` → `cascadeR(k, kView)`.

| Variant | When | How |
| --- | --- | --- |
| Nowcast | `kView = k` | from `explain(k, i)` for every facility |
| Forecast | `kView > k` (you scrubbed ahead in live mode; the chip shows `~`) | hazard part from `forcingEstimate(k, i, kView)`; link part from the projected upstream state at `kView − lag`. Link weights are the learned posterior once it has evidence, otherwise the evidence-weighted mean of the members' weights (what the forecast itself uses). |
| Crossing | `crossing(k)` | the first forecast hour (scanned hourly from k) at which Cascade-R reaches 1 |
| Per system | `bySys` | network and hazard parts per system, shown as bars in the crisis registry |

Examples (replays): the Nagpur monsoon crosses 1 at **T+46.0**, and a forecast issued at T+37
predicts the same hour. Nagpur's grid blackout crosses at T+32.5. Raleigh's blackout never crosses
(no telecom layer to carry it). The full table is in
[reference/results.md](reference/results.md#cascade-shape).

## Crisis registry

**Question:** how many separate crises are there, what is each one, and how do they interact?

Code: `analytics.js` → `crises(k)`; drawn by `ops.js` and as map footprints by `layers.js`.

### Algorithm

1. **Stressed set.** From `cascade(k)`, every facility whose HIGH RISK crossing either has already
   happened and is still live (analysis ≥ 0.35 now), or is forecast within 24 h with probability
   ≥ 0.5.
2. **Joining.** Two stressed facilities belong to the same crisis when a non-pruned link joins
   them and either stress is flowing along it now (learned weight ≥ 0.06 and flow ≥ 0.02), or the
   downstream facility is forecast to be hit after its upstream (the forecast ensemble carries
   candidate links with their prior weights). Union-find gives connected components.
3. **Type (hazard family).** The first system, in the scenario's priority order, that the crisis
   involves:

   | Scenario group | Priority (system → family) |
   | --- | --- |
   | Rain (monsoon, tropical, flash, live) | drainage → *Urban flood*, power → *Grid outage*, telecom → *Communications loss*, traffic → *Mobility gridlock*, EMS/hospital → *Health system surge* |
   | Heat | power → Grid outage, hospital → Health system surge, telecom, drainage, traffic, EMS |
   | Blackout | power → Grid outage, telecom → Communications loss, drainage, traffic, EMS, hospital |
   | Chlorine | traffic / EMS / hospital → *Toxic release*, then power, telecom, drainage |
   | Festival | traffic / EMS → *Crowd surge*, drainage → Urban flood, power, telecom, hospital |

   A flood that also jams roads and loads hospitals is still a flood. The same jam caused by a
   chlorine plume is a toxic release.
4. **Root.** The earliest member in the crisis's own system: where the hazard entered.
5. **ID.** `CR-<first three letters of the city>-<1000–9999>`, a stable hash of scenario + root
   facility, e.g. `CR-NAG-5627`. The ID survives across time steps while the root stays the same.
6. **Stage.**

   | Stage | Rule |
   | --- | --- |
   | Precursor | no member observed at HIGH yet (forecast only) |
   | Emerging | observed, peak < 0.75, or still adding forecast members |
   | Escalating | peak ≥ 0.75 and (rising more than 0.025 per member over 2 h, or forecast members still to come) |
   | Active | peak ≥ 0.75 and stable |
   | Recovering | observed, falling more than 0.02 per member over 2 h, no forecast members left |

7. **Footprint:** districts of its members; **people:** residents whose nearest facility is a
   member (population layer); **systems:** peak risk per system; **next CRITICAL:** the earliest
   forecast CRITICAL crossing among members, with time and probability.
8. **Interactions between crises:**
   - **Couples:** a live link runs from a member of one crisis to a member of another (one can
     propagate into the other), with lag and weight.
   - **Contends:** two crises both load the same non-member facility, a shared resource such as a
     hospital or substation.

### On screen

- **Crises drawer:** Cascade-R block, crisis cards, crisis × system matrix (peak risk %),
  interactions.
- **Map:** dashed convex-hull footprints (650 m around members) coloured by peak state, with ID and
  type labels. Focusing a crisis fits the camera to it.
- **CAP alerts and SMS** are issued per crisis (below).

Example: the Nagpur monsoon has 1 precursor crisis at T+37 (39 facilities, about 1.0 M residents
in the footprint). At T+47 there are 5: the main Nag flood (33 facilities), plus Ganeshpeth,
Gorewada–Gittikhadan (Pili river), Mahal and Mankapur.

## Interventions

**Question:** with limited crews, which actions break the chain, what do they cost elsewhere, and
by when must we start?

Code: `interventions.js`. UI: Interventions drawer, Intervention lab page.

### Action catalogues

**Raleigh** has a hand-written catalogue of 7 actions: pumps at the Pigeon House culvert, early
Capital Blvd closure, ambulances north of Crabtree Creek, mobile generation at WakeMed, flood
barriers at Peace St, Crabtree Valley evacuation, and EMS load balancing.

**Every other city (Nagpur)** gets a catalogue **generated from its own dependency graph**
(`generate(e)`), so the decision layer works on a city it has never seen. The rules:

| # | Action | Chosen where | Model effect | Side effect |
| --- | --- | --- | --- | --- |
| 1–2 | Mobile pumps (2 crews each) | the two drainage points with the most downstream consequence (Σ link weight × (4 − tier) of targets) | that gauge's excess × 0.55, downstream gauges × 0.8 | — |
| 3 | Early closure with signed detour (1 crew) | the junction most exposed to flooding | flooding links into it × 0.3; its links to EMS × 0.5 | +0.1 load on neighbouring junctions |
| 4 | Pre-stage ambulances outside the flood zone (2) | all EMS stations | road → EMS links × 0.4 | +0.05 at the least central station |
| 5 | Mobile generation at a hospital (2) | the most important hospital fed by power | its power feeds × 0.3 | — |
| 6 | Flood barriers at a substation (1) | the substation most exposed to water | drainage → substation links × 0.25 | — |
| 7 | Diesel and batteries to mobile sites (1) | all telecom sites | power → telecom links × 0.35 | — |
| 8 | Evacuate a floodplain (2) | the drainage catchment with the most residents that feeds hospitals | its links to hospitals × 0.35 | +0.16 on nearby roads for 6 h |
| 9 | Regional load balancing of transports (1) | hospital ↔ hospital links | × 0.5 | +0.1 census at the smallest hospital |

Nagpur's generated catalogue has nine actions, for example "Mobile pumps at Nag River at Ambazari
Rd", "Close Jhansi Rani Square, Sitabuldi early, signed detour", "Flood barriers at Vasant Nagar
Substation" and "Evacuate the floodplain at Nandanvan". The full lists with single-action gains are
in [reference/results.md](reference/results.md).

### Evaluation

`evaluate(k, ids, n = 32)`:
1. Take the n members with the highest storm-level posterior at the decision step k.
2. Re-simulate each from k with the plan's modifiers.
3. Compare with the same members without the plan.

Metrics:

| Metric | Definition |
| --- | --- |
| Critical facility-hours | Σ over facilities and steps from k of (4 − tier) × 0.5 h while risk ≥ 0.75 |
| Hospital critical hours | hours hospitals spend ≥ 0.75 |
| Facilities reaching critical | expected count |
| P(a hospital goes critical) | weighted share of members where any hospital peaks ≥ 0.75 |
| Reduction | 1 − with/base on critical facility-hours |
| Cascade broken | P(hospital critical) from > 0.4 to < 0.3 |
| Side effects | facilities whose expected peak rises by more than 3 points, ranked |

Verdicts in the UI: **Cascade broken**, **Mitigated** (> 8% reduction), **Marginal**.

### Recommendation

`recommend(k, budget)` is greedy. It adds the action with the largest marginal reduction of
critical facility-hours per crew (16 members per trial) until the budget is spent or no action
gains more than 0.05 per crew.

### Decision deadline

`deadline(k, ids)` re-runs the plan with crews starting 0, 2, 4 … 24 h later (still deciding at
k with information up to k only). It reports the benefit curve:

- **Act by:** the last start time that keeps 80% of the benefit of starting now;
- **Half:** the first start time at which the plan is worth less than half.

Examples: the monsoon plan decided at T+37 can start as late as T+47. The chlorine plan has to
start immediately: its benefit falls from 55% to 11% within 4 h and to nothing by 6 h. The
blackout plan decided at T+30 must start by T+34.

### Ghost city

`trajectory(k, ids)` returns the weighted mean difference (with − without) for every facility and
step after k. The operations room adds it to the view, so the whole twin (markers, overlays,
flows, strip, chips) repaints as the city would look with the plan. A mode bar offers **Exit**.
The lab hands plans to the operations room with `?plan=…&k=…`.

## Red team

**Question:** what happens when the twin's own inputs are attacked?

Code: `redteam.js`. UI: Red team drawer; the home page demo. Targets are chosen from the city's
graph, so the console works on any city.

| Attack | Target selection | Injection |
| --- | --- | --- |
| Frozen river gauge | drainage sensor with the most downstream consequence (not already faulted) | `stuck` for 14 h |
| Spoofed SCADA spike | substation with the most downstream consequence | reading forced to 0.95 for 1.5 h |
| Tampered rain gauge | weather station with the most downstream consequence | +0.35 from the attack to T+72 |
| Bot burst of false reports | largest hospital and most consequential junction | 12 posts in 2 h claiming "evacuating, roof caved in" and "bridge collapsed", scored as CRITICAL claims |
| Telemetry blackout (60%) | all feeds | 60% of channels missing for 6 h |

The onset is 12, 6 or 3 h before the decision time. Pressing Launch rebuilds the whole twin from
scratch on the poisoned streams (`engine.create(geo, { scenario, script })`, about 1.5 s) and
scores it against the clean run, with the hidden truth used only for scoring:

| Score | Meaning |
| --- | --- |
| Sensors flagged | attacked sensors whose trust fell below 0.5, and how long it took. Injections that never moved a reading by 6 points are reported as *no effect*; sensors dark during a blackout as *masked*. |
| Raw / attacked / control vs truth | at the worst moment of the injection |
| Nowcast error | mean absolute error against the truth at the decision time, attacked vs clean |
| Max shift | the largest difference between the attacked and clean nowcasts |
| False alerts | alerts the attacked twin raised that the clean twin never raised |
| Delayed alerts | alerts the clean twin raised that the attacked twin raised more than 1 h later, or not at all |
| Bot posts | held vs corroborated, median corroboration |
| Blackout | dark feeds and effective sample size, attacked vs clean |

Monsoon examples:
- A spike from a calm state is caught on the first reading by the step test: the raw feed says
  95%, the twin says 31% against a truth of 29%.
- A frozen gauge during the rise is caught after 3.5–5.5 h.
- 12 of 12 bot posts are held when the places are calm.

Honest limits are shown, not hidden:
- A spike close to a plausible level is not flagged.
- A tampered gauge during heavy rain is caught only after about 5 h.

**Show attacked twin on the map** swaps the operations room onto the attacked engine (quarantined
sensors badged, rejected reports in the feed) with a **Restore clean** mode bar.

## Communications

**Question:** how does the warning leave the room?

Code: `comms.js`. UI: Comms drawer; home page demo; My area advice. Every product is generated
from the twin at the issue time, so a message issued at T+30 h in a replay is exactly what the
twin could have sent then. Templates, configuration and generated samples (SMS, CAP XML, SITREP)
are reproduced in [reference/messages.md](reference/messages.md).

### Situation report (SITREP)

Plain text with a numbered header ("SITUATION REPORT No. n · NAGPUR, MAHARASHTRA"), the issue time
in local time and T+, the issuing desk, the scenario and *Status: EXERCISE*, then seven sections:

1. **Situation:** city state and index, counts per state, people at risk, Cascade-R with its
   meaning.
2. **Active crises:** ID, type, stage, area, residents, systems with states, root and start time,
   next CRITICAL; then coupling and contention between crises.
3. **Forecast:** the next CRITICAL crossings within 48 h, with median time, probability and
   time-to.
4. **System status:** the worst facility per system.
5. **Information integrity:** quarantined feeds with trust; citizen reports received,
   corroborated and held.
6. **Recommended actions:** the plan from the Interventions drawer if one is chosen, otherwise the
   planner's own recommendation within 5 crews, with expected effect and decision deadline.
7. **Next report:** +3 h or on any change of city state.

### CAP 1.2 alert

One OASIS Common Alerting Protocol 1.2 document per crisis:

- `identifier` `CASCADE72-<CITY>-<crisis id>-<yyyymmddThhmm>`, `sender`, `sent` (ISO 8601 with
  the city's UTC offset, as CAP requires), `status` **Exercise**, `msgType` Alert, `scope` Public,
  and a `note` stating the issue time and data cut-off.
- One `<info>` block per city language (Nagpur: `en-IN`, `hi-IN`, `mr-IN`; Raleigh: `en-US`,
  `es-US`), each with:
  - `category` and `event`;
  - `responseType` (Evacuate for extreme floods);
  - `urgency`: Immediate if critical now or within 6 h, Expected within 24 h or once observed,
    else Future;
  - `severity`: Extreme with ≥ 3 critical members or more than 250k residents, Severe with ≥ 1
    critical or a likely next CRITICAL, else Moderate;
  - `certainty`: Observed, Likely (≥ 60%) or Possible;
  - `effective`, `onset`, `expires` (+12 h) and `senderName`;
  - `headline`, `description` and `instruction` in that language, and `contact` (112 or 911);
  - parameters `CrisisID`, `Stage`, `PeopleExposed`, `CascadeR`;
  - an `<area>` with the districts and a closed `polygon` (the crisis footprint, lat,lon pairs).

### Public SMS / cell broadcast

```
<HEADLINE> - <up to 3 districts +n more>: <in effect now | expected from HH:MM, DD/MM>. <first sentence of the advice> <Helpline n>
```

The headline is upper-cased in English and Spanish, and Hindi ends sentences with the danda (।).
The segment counter checks the GSM 03.38 alphabet: GSM-7 allows 160 characters (153 per segment
when concatenated). Anything else, including Devanagari and most accents, forces UCS-2 at 70
(67). The card shows encoding, characters and segments per language.

Hazard families and languages: flood, grid, comms, toxic, crowd, gridlock and health, in English,
हिन्दी, मराठी (Nagpur) and Español (Raleigh). Ambulance and helpline numbers come from the city:
108 and 112 in Nagpur, 911 in Raleigh.

## People at risk

The population layer links each 450 m cell to its nearest exposed (non-weather) facility within
1.5 km. *People at risk* counts residents whose linked facility, blended with distance
(`r·e^(−d/900 m) + 0.2·(1 − e^(−d/900 m))`), is at HIGH RISK (≥ 0.55) or CRITICAL (≥ 0.75). Crisis
footprints count residents whose nearest facility is a member. Facility `people` (in the
inspector) is the population within 1.2 km.

Continue with [The website](07-website.md).
