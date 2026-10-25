# 8 · User flows

Step-by-step journeys through the product, with what you should see at each step. Times and
numbers refer to the Nagpur monsoon replay unless stated.

- [Flow 1 · The five-minute demo (judge or first-time visitor)](#flow-1--the-five-minute-demo)
- [Flow 2 · EOC duty officer: monitoring a developing crisis](#flow-2--eoc-duty-officer)
- [Flow 3 · Planner: choosing actions under a crew budget](#flow-3--planner)
- [Flow 4 · Analyst: why is this hospital at risk?](#flow-4--analyst)
- [Flow 5 · Communications officer: issuing the warning](#flow-5--communications-officer)
- [Flow 6 · Red-team evaluator: attacking the twin](#flow-6--red-team-evaluator)
- [Flow 7 · Resident: is my area at risk?](#flow-7--resident)
- [Flow 8 · Meteorologist: today's real forecast](#flow-8--meteorologist)
- [Flow 9 · Comparing hazards and the unseen city](#flow-9--comparing-hazards-and-the-unseen-city)
- [Flow 10 · Watching the twin learn from scratch](#flow-10--watching-the-twin-learn)
- [Flow 11 · Engineer: adding a city](#flow-11--engineer-adding-a-city)

---

## Flow 1 · The five-minute demo

1. Open **http://localhost:8000**. The hero shows Nagpur as columns of light, calm at T+30.
   Within seconds the **Predicted course** panel fills: "Ambazari Lake spillway over capacity, Fri
   22 Sep 23:30, 100%, in 18 h…", issued 18.5 h before the first facility went critical.
2. Watch the ticker run to T+46: columns along the Nag turn orange, then red; pulses run from the
   lake to the river gauges, junctions, EMS and hospitals. Cascade-R passes 1.
3. **Click a facility** in the city. Pulses run downstream and the caption lists who it reaches and
   when.
4. Scroll to **Same morning, two warnings** and compare the district warning with the twin's
   sentence.
5. In **Inside the operations room**, click through the tabs: crises at the peak, the Cascade-R
   crossing at T+46, 48 confirmed links, the ghost-city plan (−16%), the red team (no false alerts)
   and the SMS typing in Hindi and Marathi.
6. Scroll to **Scored on replays**: median lead 22.5 h, 85% warned, 0% false alarms, skill +0.81,
   and the reliability diagram.
7. Click **Open the operations room**, then **Trigger cascade**. Watch the 72 h stream from T+0
   with toasts as each system goes critical.
8. Press **Ctrl K**, type "GMC" and press Enter. The twin flies to Government Medical College and
   opens the inspector.

## Flow 2 · EOC duty officer

1. Open `twin.html?scenario=monsoon2023`. Live mode, T+37 (22 Sep 19:00 IST), city NORMAL,
   Cascade-R 0.00.
2. Read the **cascade strip**: Drainage ~T+41.5, Power ~T+43, EMS ~T+42, Hospital ~T+44.5 are
   outlined as forecast.
3. Read the **alerts**: "Predicted CRITICAL" entries for the lake spillway and Nag River gauges,
   with probability and ETA. Sensor alerts flag the frozen gauge (HYD-2104), the offline Jhansi
   Rani Square camera and the biased Itwari rain gauge.
4. Drag the timeline right of **NOW** to T+47. The tag reads **FORECAST +10 h**, the map shows the
   projected city, and Cascade-R shows `~1.6`.
5. Open **Crises**: one precursor *Urban flood* crisis, CR-NAG-5627, about 1.0 M residents in its
   footprint, next CRITICAL: the lake spillway at T+42.5 (100%). Click it; the footprint is drawn
   and the camera fits it.
6. Click **LIVE** in the clock tag to return to now.

## Flow 3 · Planner

1. In the operations room open **Interventions** (or the **Intervention lab** page).
2. Read each action's gain alone, e.g. "Pre-stage ambulances outside the flood zone: alone −6.6%".
3. Choose **5 crews** and press **Recommend within budget**. You get flood barriers at Vasant Nagar
   Substation, the early Jhansi Rani Square closure, staged ambulances and regional load balancing.
4. Read the outcome: −16% critical facility-hours (1494 → 1255), hospital critical hours 138.5 →
   72.2, verdict *Mitigated*. Side effect: Zero Mile peak +4 pts.
5. Read the **decision deadline**: "Start by T+47.0 to keep 80% of the benefit; by T+55.0 it is
   worth less than half."
6. Press **Ghost city**. The whole twin repaints as the city would look with the plan; scrub
   forward to compare. **Exit** in the mode bar.
7. In the lab, drag **Decide at** earlier or later and watch the curve and ledger change. Press
   **See it as a ghost city in the operations room** to hand the plan over.

## Flow 4 · Analyst

1. Select **Government Medical College & Hospital** (asset list, map, or `?select=HSP-GMC`).
2. In the inspector read:
   - the ring gauge and trend;
   - **ETA to critical** with its range and probability;
   - **P(critical · 24 h)**;
   - **Sensor trust**;
   - the raw reading (ED wait).
3. Read the **Multi-horizon forecast** fan and the +1 to +48 h tiles.
4. Read **Why this risk**: baseline census, the heat or rain push, and each upstream link (EMS
   stations, substations, other hospitals) with weight ± sd, lag, status and the upstream reading
   and its trust. Click a driver to walk upstream.
5. On the **Knowledge graph** page, select the same hospital to see the live drivers, every
   upstream and downstream link, and how those links were learned over time (move the slider).

## Flow 5 · Communications officer

1. Open **Comms** in the operations room at T+47 (Historical mode, scrubbed).
2. **SITREP:** read the seven sections, including the recommended actions with the decision
   deadline. **Copy** it, or **Download .txt** (`SITREP-nagpur-<time>.txt`).
3. **CAP 1.2:** pick crisis CR-NAG-5627 and check the summary: Extreme severity, Immediate urgency,
   Observed certainty, 3 info blocks (English, हिन्दी, मराठी), a closed footprint polygon.
   **Download .xml** for a CAP gateway or cell-broadcast centre.
4. **Public alerts:** read each crisis area's SMS in three languages with encoding and segment
   counts (Hindi and Marathi are UCS-2).

## Flow 6 · Red-team evaluator

1. Open **Red team**. Keep frozen gauge, spoofed spike and bot burst selected; choose **6 h before**.
2. Press **Launch**. In about 1.5 s the twin is rebuilt on the poisoned streams.
3. Read the outcome: sensors flagged, nowcast error vs the control, max shift, false and delayed
   alerts. Per attack:
   - **Spoofed spike:** flagged in under an hour. The raw feed says 95%, the twin about 31–47%,
     the truth about 29–35%.
   - **Frozen gauge:** flagged after a few hours, once the river starts to rise.
   - **Bot posts:** all held when the places are calm, scored against the severity they claim.
4. Add **Telemetry blackout** and launch again. Sensors dark during the blackout show as
   *masked*; the effective sample size and nowcast error show the twin widening rather than going
   blind.
5. Press **Show attacked twin on the map**. Quarantined sensors are badged and rejected reports
   stay in the feed. **Restore clean streams** swaps back.

## Flow 7 · Resident

1. Open **My area** (or `citizen.html?area=Dharampeth`).
2. Type your neighbourhood, or click it on the dot map.
3. Read the verdict: "Flooding likely in Dharampeth from about 01:30 Sat. 97% chance within 24
   hours…".
4. Read **Next 36 hours near you**: drainage, roads, power, EMS and hospitals turn red overnight.
5. Switch **What to do now** to हिन्दी or मराठी.
6. Check **Nearest hospital** (now, +6 h, +12 h) and **Roads to avoid**.
7. Move the map horizon to **+12 h** to see the city forecast.

## Flow 8 · Meteorologist

1. Open **Live**. Nagpur loads by default: 31 rain futures, chance of heavy rain, temperature and
   wind.
2. Search "Guwahati" or tap **Mumbai**. The charts reload for that city.
3. For Nagpur, press **Open the live twin**. The operations room fetches the same ensemble, maps the
   31 members onto its 200 particles, and forecasts drains, roads, power and hospitals from it.

## Flow 9 · Comparing hazards and the unseen city

1. Open **Scenarios**. The reach matrix fills as workers finish:
   - the monsoon reaches drainage at T+41.5 and hospitals at T+44.5;
   - the chlorine release reaches roads and EMS;
   - the blackout reaches power at T+27 and telecom at T+34.
2. Filter **Industry and crowds** to compare the chlorine and festival dossiers.
3. Scroll to **The same engine on a city it has never seen** and open Raleigh: 44 facilities,
   English and Spanish alerts, 911, and a hand-written action catalogue.

## Flow 10 · Watching the twin learn

1. Open **Knowledge graph**, pick a scenario, press **Watch it learn**.
2. At T+0 every link is a dashed candidate. As stress arrives, links confirm (solid, thickening) or
   prune (dotted red).
3. Tick **Reveal planted fakes**. Rejected fakes show a white ⊗.
4. On **Method → Links nobody wrote down**, see the same thing as posterior mean ± sd over time.

## Flow 11 · Engineer: adding a city

See [Development § Adding a city](09-development.md#adding-a-city). In short:
1. Write `tools/spec_<city>.py`.
2. Fetch tiles for its extent.
3. Run `build_data.py --city <city>`.
4. Add the city to the city list in `app.js` and the `<script>` tags.

The engine, catalogue generator, analytics, red team, comms (add its languages) and website work
unchanged.
