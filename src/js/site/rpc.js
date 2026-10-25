/* Engine RPC for the website pages.

   The pages never block on the 200-member ensemble: they ask a Web Worker (twin-worker.js)
   for compact, transferable products. This file holds the handlers; the worker imports it,
   and site.js loads it on the main thread as a fallback when workers are unavailable.
   Engines are cached per city × scenario (two at most; each holds ~30 MB of trajectories). */
(function (root) {
  const T = root.TWIN;
  const cache = new Map();

  function engine(city, scen) {
    const key = city + '|' + scen;
    if (cache.has(key)) { const e = cache.get(key); cache.delete(key); cache.set(key, e); return e; }
    const geo = root.TWIN_GEOS[city];
    if (!geo) throw new Error('Unknown city ' + city);
    T.core.setTZ(geo.tz, geo.tzLabel);
    const e = T.engine.create(geo, { scenario: scen });
    e.analytics = T.analytics.create(e);
    cache.set(key, e);
    while (cache.size > 2) cache.delete(cache.keys().next().value);
    return e;
  }
  const liveNow = (scen) => (T.scenarios[scen] && T.scenarios[scen].liveNow) || 34.5;
  const group = (k) => (k === 'pump' ? 'drainage' : k);
  const STATUS = { candidate: 0, confirmed: 1, pruned: 2 };

  function facilities(e) {
    return e.F.map((f, i) => ({
      i, id: f.id, name: f.name, type: f.type, subtype: f.subtype, kind: e.kinds[i], sys: group(e.kinds[i]),
      district: f.district, lngLat: f.lngLat, tier: f.tier, people: f.people || 0, beds: f.beds || null, sensor: f.sensor,
    }));
  }
  function edges(e) {
    return e.E.map((ed) => ({ n: ed.n, from: ed.from, to: ed.to, lag: ed.lag * e.DT, mechanism: ed.mechanism, kind: ed.kind, km: ed.km || null, spurious: ed.w === 0 }));
  }

  // Compact per-scenario summary for cards and matrices (cheap to cache).
  function summary({ city, scen }) {
    const e = engine(city, scen), an = e.analytics, K = e.K, N = e.N;
    const risk = [], crit = [], high = [], cr = [];
    for (let k = 0; k < K; k++) {
      const c = e.cityAt(k);
      risk.push(+c.risk.toFixed(3)); crit.push(c.counts.critical); high.push(c.counts.high);
      if (k % 2 === 0) cr.push(+an.cascadeR(k).r.toFixed(2));
    }
    const sysPeak = {}, sysFirst = {};
    for (let i = 0; i < N; i++) {
      const g = group(e.kinds[i]);
      if (g === 'weather') continue;
      for (let k = 0; k < K; k++) {
        const r = e.now[k * N + i];
        sysPeak[g] = Math.max(sysPeak[g] || 0, r);
        if (r >= 0.55 && (sysFirst[g] == null || k * e.DT < sysFirst[g])) sysFirst[g] = k * e.DT;
      }
    }
    let crCross = null;
    for (let k = 0; k < K; k++) if (an.cascadeR(k).r >= 1) { crCross = k * e.DT; break; }
    const V = e.validation();
    const peakCrit = Math.max(...crit);
    const firstCrit = crit.findIndex((x) => x > 0);
    const s = e.scen;
    return {
      city, scen, label: s.label, blurb: s.blurb, liveNow: liveNow(scen), t0: e.t0, hours: e.HOURS, dt: e.DT,
      hazardLabel: s.hazardLabel || null, risk, crit, high, cr, sysPeak, sysFirst, crCross, peakCrit,
      firstCrit: firstCrit >= 0 ? firstCrit * e.DT : null,
      validation: { brier: V.brier, bss: V.bss, pod: V.pod, far: V.far, lead: V.medianLead, events: V.events, alarms: V.alarms },
    };
  }

  // Full snapshot for interactive pages: arrays are transferable Float32/Uint8 buffers.
  function snapshot({ city, scen, kIssue }) {
    const e = engine(city, scen), an = e.analytics, K = e.K, N = e.N, NE = e.E.length;
    const eMean = new Float32Array(K * NE), eSd = new Float32Array(K * NE), eFlow = new Float32Array(K * NE), eStat = new Uint8Array(K * NE), eLearn = new Float32Array(K * NE);
    for (let k = 0; k < K; k++) {
      const eps = e.edgesAt(k);
      for (let n = 0; n < NE; n++) {
        const p = eps[n];
        eMean[k * NE + n] = p.mean; eSd[k * NE + n] = p.sd; eFlow[k * NE + n] = p.flow; eStat[k * NE + n] = STATUS[p.status]; eLearn[k * NE + n] = p.learned;
      }
    }
    const cityRisk = new Float32Array(K), crit = new Uint8Array(K), high = new Uint8Array(K), ess = new Float32Array(K), crR = new Float32Array(K), crNet = new Float32Array(K), crHaz = new Float32Array(K);
    for (let k = 0; k < K; k++) {
      const c = e.cityAt(k);
      cityRisk[k] = c.risk; crit[k] = c.counts.critical; high[k] = c.counts.high; ess[k] = c.ess;
      const r = an.cascadeR(k); crR[k] = r.r; crNet[k] = r.net; crHaz[k] = r.haz;
    }
    const kLive = e.kOf(liveNow(scen));
    const kI = kIssue != null ? Math.min(K - 1, Math.max(0, kIssue)) : kLive;
    const fut = e.cascade(kI).filter((c) => !c.observed);
    const course = fut.filter((c) => c.level === 'CRITICAL').slice(0, 14).concat(fut.filter((c) => c.level !== 'CRITICAL').slice(0, 14))
      .sort((a, b) => a.t - b.t).map((c) => ({ i: c.i, level: c.level, t: c.t, prob: c.prob }));
    const crisesAt = (k) => an.crises(k).list.map((c) => ({ id: c.id, type: c.type, family: c.family, stage: c.stage, root: c.root, members: c.members, maxR: c.maxR, people: c.people, districts: c.districts, sys: c.sys, nextCrit: c.nextCrit && { i: c.nextCrit.i, t: c.nextCrit.t, prob: c.nextCrit.prob } }));
    const V = e.validation();
    const alerts = e.alerts.map((a) => ({ k: a.k, t: a.t, i: a.i, sev: a.sev, kind: a.kind, title: a.title, text: a.text, conf: a.conf ?? null, planted: !!a.planted, eta: a.eta ?? null, p: a.p ?? null }));
    // Forecast issued at the live step for every facility (mean, p10, p90) for the public view.
    const KF = K - kLive;
    const fMean = new Float32Array(N * KF), fLo = new Float32Array(N * KF), fHi = new Float32Array(N * KF), pCrit = new Float32Array(N * KF);
    const ttc = [];
    for (let i = 0; i < N; i++) {
      const fc = e.forecast(kLive, i);
      fc.series.forEach((s, q) => { fMean[i * KF + q] = s.mean; fLo[i * KF + q] = s.p10; fHi[i * KF + q] = s.p90; pCrit[i * KF + q] = s.pCrit; });
      ttc.push({ prob: fc.ttc.prob, median: isFinite(fc.ttc.median) ? fc.ttc.median : null, p10: fc.ttc.p10 ?? null, p90: fc.ttc.p90 ?? null, p24: fc.p24 });
    }
    const crossing = an.crossing(kLive);
    const out = {
      city, scen, label: e.scen.label, blurb: e.scen.blurb, t0: e.t0, tz: e.geo.tz, tzLabel: e.geo.tzLabel, K, N, NE, DT: e.DT, HOURS: e.HOURS, M: e.M,
      kLive, kIssue: kI, F: facilities(e), E: edges(e),
      now: e.now.slice(), truth: e.truth.slice(), obs: e.obs.slice(), trust: e.trust.slice(), nowSd: e.nowSd.slice(),
      eMean, eSd, eFlow, eStat, eLearn, cityRisk, crit, high, ess, crR, crNet, crHaz,
      course, crisesLive: crisesAt(kLive), crisesPeak: crisesAt(crit.indexOf(Math.max(...crit))), alerts,
      validation: { brier: V.brier, bss: V.bss, pod: V.pod, far: V.far, lead: V.medianLead, events: V.events, hits: V.hits, alarms: V.alarms, falseAlarms: V.falseAlarms, bins: V.bins, leads: V.leads, pairs: V.pairs },
      fc: { k0: kLive, KF, mean: fMean, lo: fLo, hi: fHi, pCrit, ttc }, crossing, faults: e.FAULTS,
      thr: e.thr.slice(),
    };
    return out;
  }
  const transferOf = (o) => {
    const t = [];
    const walk = (x) => { if (!x || typeof x !== 'object') return; if (ArrayBuffer.isView(x)) { t.push(x.buffer); return; } for (const v of Object.values(x)) walk(v); };
    walk(o);
    return [...new Set(t)];
  };

  // Ensemble members for one facility: trajectories and their weights at every step.
  function members({ city, scen, i }) {
    const e = engine(city, scen), K = e.K, M = e.M, N = e.N;
    const traj = new Float32Array(M * K), w = new Float32Array(K * M), ess = new Float32Array(K);
    for (let m = 0; m < M; m++) for (let k = 0; k < K; k++) traj[m * K + k] = e.R(m, k, i);
    for (let k = 0; k < K; k++) { w.set(e.wAt(k, i), k * M); ess[k] = e.ESS[k * N + i]; }
    return { i, M, K, traj, w, ess };
  }

  function explain({ city, scen, k, i }) {
    const e = engine(city, scen);
    const ex = e.explain(k, i);
    return { risk: ex.risk, trust: ex.trust, drivers: ex.drivers.map((d) => ({ kind: d.kind, label: d.label || null, value: d.value, share: d.share, from: d.from ?? null, weight: d.weight ?? null, sd: d.sd ?? null, status: d.status || null, lag: d.lag ?? null, mechanism: d.mechanism || null, upstreamRisk: d.upstreamRisk ?? null, upstreamTrust: d.upstreamTrust ?? null })) };
  }

  // Interventions
  const planners = new Map();
  function planner(e) { if (!planners.has(e)) planners.set(e, T.interventions.create(e)); return planners.get(e); }
  function catalog({ city, scen }) {
    const e = engine(city, scen);
    return planner(e).CATALOG.map((a) => ({ id: a.id, label: a.label, detail: a.detail, cost: a.cost, side: a.side || null }));
  }
  function evaluate({ city, scen, k, ids, n }) {
    const e = engine(city, scen), r = planner(e).evaluate(k, ids, n || 32);
    const strip = (x) => ({ critHours: x.critHours, careHours: x.careHours, nCrit: x.nCrit, hospPeak: x.hospPeak, hospCrit: x.hospCrit });
    return { base: strip(r.base), with: strip(r.with), cost: r.cost, reduction: r.reduction, careReduction: r.careReduction, cascadeBroken: r.cascadeBroken, sideEffects: r.sideEffects.map((s) => ({ i: s.i, name: e.F[s.i].name, delta: s.delta })) };
  }
  function recommend({ city, scen, k, budget }) { const e = engine(city, scen); return planner(e).recommend(k, budget); }
  function deadline({ city, scen, k, ids }) { const e = engine(city, scen); return planner(e).deadline(k, ids, 24, 2); }
  // City trajectories without and with the plan, from the decision step on.
  function compare({ city, scen, k, ids }) {
    const e = engine(city, scen), pl = planner(e), K = e.K, N = e.N;
    const tr = ids.length ? pl.trajectory(k, ids, 24) : null;
    const len = K - k;
    const baseCrit = new Float32Array(len), withCrit = new Float32Array(len), baseIdx = new Float32Array(len), withIdx = new Float32Array(len);
    const sysBase = {}, sysWith = {};
    for (let q = 0; q < len; q++) {
      const kk = k + q, R = e.project(k, kk);
      let bc = 0, wc = 0, bs = 0, ws = 0, n = 0;
      for (let i = 0; i < N; i++) {
        if (e.kinds[i] === 'weather') continue;
        const b = R[i], w = tr ? Math.min(1, Math.max(0, b + tr.delta[kk * N + i])) : b, tw = 4 - e.F[i].tier;
        if (b >= 0.75) bc++; if (w >= 0.75) wc++;
        bs += b * tw; ws += w * tw; n += tw;
        const g = group(e.kinds[i]);
        sysBase[g] = Math.max(sysBase[g] || 0, b); sysWith[g] = Math.max(sysWith[g] || 0, w);
      }
      baseCrit[q] = bc; withCrit[q] = wc; baseIdx[q] = bs / n; withIdx[q] = ws / n;
    }
    return { k0: k, baseCrit, withCrit, baseIdx, withIdx, sysBase, sysWith };
  }

  // Red team: rebuild the twin on poisoned streams and score it against the clean run.
  function redteam({ city, scen, ids, onset, kNow }) {
    const clean = engine(city, scen);
    const list = T.redteam.attacks(clean);
    const k = kNow ?? clean.kOf(liveNow(scen));
    const tA = Math.max(0.5, k * clean.DT - (onset || 6));
    const att = T.engine.create(clean.geo, { scenario: scen, script: T.redteam.merge(list, ids, tA) });
    const s = T.redteam.score(clean, att, list, ids, tA, k);
    return {
      tA, k, maeClean: s.maeClean, maeAtt: s.maeAtt, maxShift: s.maxShift, extra: s.extraAlerts.length, delayed: s.delayedAlerts.length, detected: s.detected, sensors: s.sensors,
      rows: s.rows.map((r) => ({ id: r.a.id, label: r.a.label, kind: r.kind, i: r.i ?? null, flaggedAfter: r.flaggedAfter ?? null, masked: !!r.masked, harmless: !!r.harmless, raw: r.raw ?? null, twin: r.twin ?? null, control: r.control ?? null, truth: r.truth ?? null, n: r.n ?? null, held: r.held ?? null, median: r.median ?? null })),
    };
  }

  // Public messages for the top crisis at the live step.
  function messages({ city, scen, k }) {
    const e = engine(city, scen), kk = k ?? e.kOf(liveNow(scen));
    const list = e.analytics.crises(kk).list;
    const cfg = T.comms.cityCfg(e.geo);
    return list.slice(0, 4).map((c) => ({ id: c.id, type: c.type, family: c.family, districts: c.districts, sms: cfg.langs.map((l) => ({ lang: l, name: T.comms.LANG_NAME[l], ...T.comms.sms(e.geo, e.t0, c, kk * e.DT, l) })) }));
  }
  function advice({ city }) {
    const geo = root.TWIN_GEOS[city], cfg = T.comms.cityCfg(geo);
    const out = {};
    for (const l of cfg.langs) out[l] = Object.fromEntries(Object.entries(T.comms.TXT[l]).map(([fam, [h, a]]) => [fam, [h, a.replace('{ems}', cfg.ems)]]));
    return { langs: cfg.langs, names: cfg.langs.map((l) => T.comms.LANG_NAME[l]), help: cfg.help, ems: cfg.ems, txt: out };
  }

  const OPS = { summary, snapshot, members, explain, catalog, evaluate, recommend, deadline, compare, redteam, messages, advice };
  root.TWIN_RPC = { handle: (op, args) => { if (!OPS[op]) throw new Error('Unknown op ' + op); return OPS[op](args || {}); }, transferOf };
})(typeof self !== 'undefined' ? self : globalThis);
