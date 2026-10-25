/* Red team: adversarial injections into the sensor and report streams.

   Each attack is a script the engine applies to the observation stream before
   assimilation (the hidden truth is untouched). The attacked twin is rebuilt from
   scratch with the poisoned streams and compared with the clean run: was each attack
   detected, and how far did it move the nowcast, the alerts and the forecast?
   Targets are chosen from the city's own dependency graph, so the console works on
   any city: the gauge with the most downstream consequence, the substation feeding
   the most links, and so on. */
(function (root) {
  const T = root.TWIN;

  function attacks(e) {
    const F = e.F, kinds = e.kinds, all = F.map((_, i) => i);
    const faulted = new Set(e.FAULTS.map((f) => f.id));
    const reach = (i) => e.outEdges[i].reduce((s, n) => s + e.E[n].w * (4 - F[e.E[n].to].tier), 0);
    const pick = (pred) => all.filter((i) => pred(i) && !faulted.has(F[i].id)).sort((a, b) => reach(b) - reach(a))[0];
    const drn = pick((i) => kinds[i] === 'drainage');
    const pwr = pick((i) => kinds[i] === 'power');
    const wx = pick((i) => kinds[i] === 'weather');
    const trf = pick((i) => kinds[i] === 'traffic');
    const hosp = all.filter((i) => kinds[i] === 'hospital').sort((a, b) => (F[b].beds || 0) - (F[a].beds || 0))[0];
    const list = [];
    if (drn != null) list.push({ id: 'freeze', label: 'Frozen river gauge', targets: [drn],
      detail: `Replay the last good reading from ${F[drn].name} so a rising channel looks flat.`,
      make: (tA) => ({ faults: [{ id: F[drn].id, kind: 'stuck', from: tA, to: tA + 14, note: 'Reading frozen (red team)' }] }) });
    if (pwr != null) list.push({ id: 'spike', label: 'Spoofed SCADA spike', targets: [pwr],
      detail: `Inject a 95% load reading at ${F[pwr].name} for 90 minutes to provoke a false trip.`,
      make: (tA) => ({ faults: [{ id: F[pwr].id, kind: 'spike', value: 0.95, from: tA, to: tA + 1.5, note: 'Spoofed telemetry (red team)' }] }) });
    if (wx != null) list.push({ id: 'bias', label: 'Tampered rain gauge', targets: [wx],
      detail: `Add 35 points to ${F[wx].name} from the attack onward, like a blocked or tampered funnel.`,
      make: (tA) => ({ faults: [{ id: F[wx].id, kind: 'bias', value: 0.35, from: tA, to: 72, note: 'Gauge biased high (red team)' }] }) });
    if (hosp != null && trf != null) list.push({ id: 'bots', label: 'Bot burst of false reports', targets: [hosp, trf],
      detail: `Twelve coordinated posts in 2 h claim ${F[hosp].name} is evacuating and a bridge at ${F[trf].name} has collapsed.`,
      make: (tA) => ({ reports: Array.from({ length: 12 }, (_, n) => ({
        t: tA + n * 0.17, near: n % 2 ? F[trf].id : F[hosp].id, bot: true, claim: 'critical',
        text: n % 2 ? `Bridge collapsed near ${F[trf].name}, cars in the water` : `${F[hosp].name} evacuating patients, roof caved in`,
      })) }) });
    list.push({ id: 'blackout', label: 'Telemetry blackout (60%)', targets: [],
      detail: 'Cut 60% of all telemetry channels for six hours, as in a ransomware hit on the SCADA historian.',
      make: (tA) => ({ blackout: { from: tA, to: tA + 6, share: 0.6 } }) });
    return list;
  }

  function merge(list, ids, tA) {
    const s = { faults: [], reports: [] };
    for (const a of list) if (ids.includes(a.id)) {
      const x = a.make(tA);
      if (x.faults) s.faults.push(...x.faults);
      if (x.reports) s.reports.push(...x.reports);
      if (x.blackout) s.blackout = x.blackout;
    }
    return s;
  }

  // Compare the attacked twin with the clean control at decision step kNow.
  function score(clean, att, list, ids, tA, kNow) {
    const N = clean.N, F = clean.F, kA = clean.kOf(tA);
    const nonWx = F.map((_, i) => i).filter((i) => clean.kinds[i] !== 'weather');
    const mae = (e) => nonWx.reduce((s, i) => s + Math.abs(e.now[kNow * N + i] - e.truth[kNow * N + i]), 0) / nonWx.length;
    // Worst nowcast error over the attack window, for clean and attacked twins.
    let worstClean = 0, worstAtt = 0;
    for (let k = kA; k <= kNow; k++) for (const i of nonWx) {
      worstClean = Math.max(worstClean, Math.abs(clean.now[k * N + i] - clean.truth[k * N + i]));
      worstAtt = Math.max(worstAtt, Math.abs(att.now[k * N + i] - att.truth[k * N + i]));
    }
    const rows = [];
    for (const a of list) {
      if (!ids.includes(a.id)) continue;
      if (a.id === 'bots') {
        const reps = att.alerts.filter((x) => x.kind === 'report' && x.planted && x.k >= kA && x.k <= kNow && x.t >= tA - 0.01 && x.t <= tA + 2.2);
        const conf = reps.map((x) => x.conf).sort((p, q) => p - q);
        const held = conf.filter((c) => c < 0.5).length;
        rows.push({ a, kind: 'reports', n: reps.length, held, median: conf.length ? conf[Math.floor(conf.length / 2)] : 0 });
        continue;
      }
      if (a.id === 'blackout') {
        let dark = 0;
        const kb = Math.min(kNow, kA + 2);
        for (let i = 0; i < N; i++) if (Number.isNaN(att.obs[kb * N + i])) dark++;
        rows.push({ a, kind: 'blackout', dark, total: N, maeClean: mae(clean), maeAtt: mae(att), essClean: clean.cityAt(kNow).ess, essAtt: att.cityAt(kNow).ess });
        continue;
      }
      for (const i of a.targets) {
        let kFlag = -1;
        for (let k = kA; k <= kNow; k++) if (att.trust[k * N + i] < 0.5) { kFlag = k; break; }
        // Moment the injected reading was furthest from the truth.
        let kStar = kA, dev = -1, dark = 0;
        for (let k = kA; k <= kNow; k++) {
          const y = att.obs[k * N + i];
          if (Number.isNaN(y)) { dark++; continue; }
          const d = Math.abs(y - att.truth[k * N + i]);
          if (d > dev) { dev = d; kStar = k; }
        }
        rows.push({
          a, kind: 'sensor', i, flaggedAfter: kFlag >= 0 ? (kFlag - kA) * clean.DT : null,
          masked: dev < 0, harmless: dev >= 0 && dev < 0.06, dev, darkSteps: dark,
          trustNow: att.trust[kNow * N + i], kStar,
          raw: att.obs[kStar * N + i], twin: att.now[kStar * N + i], control: clean.now[kStar * N + i], truth: att.truth[kStar * N + i],
        });
      }
    }
    // Spurious: alerts the attacked twin raised that the clean twin never raised (same
    // facility, kind and severity anywhere from the attack to the end of the run).
    // Delayed: alerts the clean twin raised that the attacked twin raised over 1 h later or not yet.
    const key = (x) => `${x.i}|${x.kind}|${x.sev}`;
    const real = (x) => x.kind !== 'report' && x.kind !== 'sensor';
    const cleanAll = clean.alerts.filter((x) => real(x) && x.k >= kA);
    const attAll = att.alerts.filter((x) => real(x) && x.k >= kA);
    const extra = attAll.filter((x) => x.k <= kNow && !cleanAll.some((y) => key(y) === key(x)));
    const delayed = cleanAll.filter((y) => y.k <= kNow).filter((y) => {
      const m = attAll.find((x) => key(x) === key(y));
      return !m || m.k - y.k > 2;
    });
    const maxShift = nonWx.reduce((m, i) => Math.max(m, Math.abs(att.now[kNow * N + i] - clean.now[kNow * N + i])), 0);
    const cityClean = clean.cityAt(kNow).risk, cityAtt = att.cityAt(kNow).risk;
    // Only injections that actually moved a reading away from reality count as detectable.
    const sensors = rows.filter((r) => r.kind === 'sensor' && !r.masked && !r.harmless);
    return {
      rows, extraAlerts: extra, delayedAlerts: delayed, maxShift, cityClean, cityAtt,
      maeClean: mae(clean), maeAtt: mae(att), worstClean, worstAtt,
      detected: sensors.filter((r) => r.flaggedAfter != null).length, sensors: sensors.length,
    };
  }

  T.redteam = { attacks, merge, score };
})(typeof window !== 'undefined' ? window : globalThis);
