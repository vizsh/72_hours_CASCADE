# 10 · Glossary, FAQ and limits

## Glossary

| Term | Meaning here |
| --- | --- |
| **Twin / digital twin** | a live model of the city's facilities, networks and population, driven by sensor streams |
| **Facility** | a monitored asset with a risk value: a river gauge, lake spillway, junction, substation, telecom site, EMS station, hospital or rain gauge |
| **Risk** | a facility's stress on a 0–1 scale; states NORMAL < 0.35 ≤ WATCH < 0.55 ≤ HIGH RISK < 0.75 ≤ CRITICAL |
| **Tier** | importance 1–3; weights the city index (×3, ×2, ×1) and critical facility-hours |
| **T+h** | hours since the scenario's clock origin (T+0); the window is T+0 to T+72 |
| **Now (live mode)** | the scenario's current time; everything after it is forecast |
| **Ensemble / member / particle** | one of 200 simulated futures with its own hazard, link weights and sensitivities |
| **Hidden truth** | a separate simulated world that generates the sensor streams; the forecaster never reads it and it is used only for scoring |
| **Analysis / nowcast** | the twin's best estimate of each facility now, blending the weighted ensemble with the readings |
| **Localized particle filter** | reweights members per facility by how well they explain that facility's and its upstream neighbours' readings |
| **Forgetting (λ)** | old evidence decays (λ = 0.985 per 30 min, about a 23 h memory) so the model follows drift |
| **Tempering / ESS** | effective sample size = how many members effectively carry weight; tempering keeps it ≥ 12% of 200 |
| **Sensor trust** | 0–1 confidence in a feed from residuals, flatline detection, the buddy check and the step test; a feed below 0.5 is quarantined |
| **Buddy check** | compares a rain gauge with its neighbours against the spatial difference the ensemble expects |
| **Step test** | rejects a reading that changed faster than the facility physically can in 30 minutes |
| **Candidate link** | a possible dependency between two facilities, with a mechanism and lag; a hypothesis until data confirms or prunes it |
| **ARD** | automatic relevance determination: Bayesian regression whose per-link prior precision is learned, which prunes links that carry no information |
| **Planted fake** | a candidate link absent in the hidden world, included to test the learner (7 in Nagpur, 7 in Raleigh) |
| **Flow** | stress a link is carrying now = learned weight × upstream excess over its normal level |
| **Time to critical (TTC)** | when a facility is expected to reach CRITICAL: the probability it will, and p10/median/p90 of when |
| **Cascade-R** | stress arriving through links ÷ stress arriving from the hazard; above 1 the cascade is self-sustaining |
| **Crisis** | a connected set of stressed facilities, with an ID, type (hazard family), stage, footprint, residents and systems |
| **Coupling / contention** | a link from one crisis into another / two crises loading the same facility |
| **Counterfactual** | the same futures re-simulated with an action applied from the decision time |
| **Critical facility-hours** | Σ (4 − tier) × hours at CRITICAL: the planner's objective |
| **Decision deadline / act by** | the latest start that keeps 80% of a plan's benefit |
| **Ghost city** | the operations room repainted with a plan's effect applied |
| **Red team** | deliberate attacks on the twin's inputs, scored against a clean run |
| **SITREP** | situation report for responders |
| **CAP 1.2** | OASIS Common Alerting Protocol, the XML standard for public alerts |
| **GSM-7 / UCS-2** | SMS encodings: 160 or 70 characters per message (153 or 67 when concatenated) |
| **GFS ensemble** | NOAA's Global Forecast System run 31 times (control + 30 perturbed), via Open-Meteo |
| **Brier score / skill** | mean squared error of probability forecasts / improvement over always forecasting the base rate |
| **Reliability** | whether forecast probabilities match observed frequencies |
| **POD / FAR** | probability of detection (critical events warned in advance) / false-alarm ratio |
| **Future-data isolation** | a forecast issued at step k uses readings at steps ≤ k only |

## FAQ

**Is the city data real?**
The geography is: streets, rivers, lakes, buildings, substations, hospitals, fire stations and
junctions from OpenStreetMap. So are the 2023 storm timing and totals (IMD-reported) and live
weather (GFS via Open-Meteo). Sensor readings, bed counts, feeder loads and link weights are
simulated and labelled as such, because Indian cities do not publish that telemetry.

**Then how can you claim it works?**
The forecaster is scored against a hidden world it never reads, with strict future-data isolation.
That proves the pipeline works end to end and is not leaking the future. It is not proof of
real-world skill, and the docs say so everywhere. Connecting real feeds means replacing the
synthetic observation stream; nothing downstream changes.

**How many scenarios can I simulate?**
Nagpur has 8: the 2023 monsoon cloudburst, a chlorine release, festival crowds with a storm, a grid
and telecom blackout, tropical rain, a flash flood, a heat wave, and live GFS weather. Raleigh has
5: tropical, flash, heat, blackout and live. See [Scenarios](04-scenarios.md).

**What facilities does Nagpur have?**
57, at real locations:
- **Drainage (13):** Ambazari and Gorewada lake spillways; the Nag River at Ambazari Rd, West High
  Court Rd, Wardha Rd, Ghat Rd, Panchpaoli, Nandanvan Rd and Ring Rd (east); the Pili River at
  Katol Rd and Koradi Rd; the Pohara River at Wardha Rd; the Gandhi Sagar outfall pumps.
- **Junctions (13):** Ambazari T-point, Shankar Nagar Square, Jhansi Rani Square (Sitabuldi), Zero
  Mile, the Ring Road railway underpass, Ajni Square, Chhatrapati Square, Ring Rd at West High Court
  Rd, Agrasen Square, Indora Square, Automotive Square, Mankapur Square, Umred Rd at Nandanvan Rd.
- **Substations (9):** Mankapur, Uppalwadi, Besa, Pardi, Hingna-1, Gayatri Nagar, Vasant Nagar,
  Shree Nagar, Bidipeth.
- **Telecom (5):** the Central Avenue telephone exchange and mobile-site clusters in Dharampeth,
  Ambazari, Mankapur and Besa.
- **EMS (4):** the 112 Emergency Control Room (Civil Lines) and the Sakkardara, Bhim Nagar and Agne
  Layout fire and EMS stations.
- **Hospitals (6):** Government Medical College & Hospital, IGGMC (Mayo), the GMC Super Speciality
  Hospital, Wockhardt, Care, Orange City.
- **Weather (7):** the IMD Observatory at Sonegaon, the Sitabuldi weather station, and rain gauges
  at Ambazari, Dharampeth, Itwari, Pardi and Gorewada.

Every one, with coordinates, sensors and parameters, is in
[reference/nagpur.md](reference/nagpur.md).

**Does it need the internet?**
No, except for Live weather, the Live page and web fonts. Tiles, glyphs, geodata and the engine all
ship with the repository.

**Does it need a GPU or a server?**
A browser with WebGL for the 3D map. There is no server-side compute: the engine runs in your
browser, in about 2 s per scenario.

**Why are some units imperial in the inspector?**
The inspector's illustrative readings (river stage in ft, speeds in mph) come from the original
Raleigh build. Risk, probabilities, times and the model itself are unit-free; the readings
are a presentation layer.

**Can I add my city?**
Yes: write a spec, fetch tiles and build geodata. See [Development § Adding a city](09-development.md#adding-a-city).

**Can it be fooled?**
Sometimes, and the red-team console shows exactly when:
- A spoofed reading close to a plausible value is not flagged.
- A tampered rain gauge during heavy rain is caught only after about 5 h.

Gross spikes, frozen gauges during a rise, dropouts and bot reports about calm places are caught or
held.

**Who decides?**
People. It is decision support: it proposes, quantifies and explains.

## Limits, stated plainly

- Skill is measured against a synthetic truth from the same model family.
- Intervention effects are modeled (scaled link weights and facility loads), not engineering
  studies of each action.
- The candidate link list is authored per city (the learner decides which are real, but it cannot
  discover a link nobody listed).
- Population is distributed from urban density and scaled to census totals, not census blocks.
- Inspector readings use illustrative units; CAP alerts are marked `Exercise`.
- Live weather maps grid-scale GFS rain onto the city with sub-grid perturbations; there is no
  radar nowcasting.

## Credits

Map data © OpenStreetMap contributors (ODbL). Tiles © OpenMapTiles, served by OpenFreeMap. Weather
ensemble © Open-Meteo (CC BY 4.0), GFS by NOAA. Rendering by MapLibre GL JS (BSD-3). Fonts: Barlow,
IBM Plex Mono, Noto Sans Devanagari (SIL OFL). Built for CASCADE '26 (IIIT Nagpur, TantraFiesta),
Theme 2 · Problem 2, *The 72-Hour Warning*.
