/* Home: hero replay of the 2023 cloudburst, capability explorer, scenario strip, scorecard. */
(function () {
  const S = window.SITE, { $, $$, esc } = S;
  const geo = window.TWIN_GEOS.nagpur;
  const F = geo.facilities;
  S.chrome('home');

  const SCEN = 'monsoon2023', K_ISSUE = 48; // 22 Sep 2023, 06:00 IST
  const SCENARIOS = ['monsoon2023', 'chlorine', 'festival', 'blackout', 'tropical', 'flash', 'heat'];
  const VERB = {
    drainage: ['rising fast', 'over capacity'], pump: ['wet well rising', 'at capacity'], traffic: ['heavy congestion', 'gridlocked'], power: ['feeder stress', 'at risk of outage'],
    hospital: ['census rising', 'over capacity'], ems: ['response times rising', 'response failing'], telecom: ['sites on battery', 'sites off air'], weather: ['', ''],
  };
  const kindOf = (f) => (f.type === 'telecom' ? 'telecom' : f.subtype === 'EMS station' ? 'ems' : f.subtype === 'Pumping station' ? 'pump' : f.type);
  const flowKind = (i) => { const k = kindOf(F[i]); return k === 'drainage' || k === 'pump' ? 'water' : k === 'traffic' ? 'traffic' : 'cascade'; };

  // ── Hero city ──────────────────────────────────────────────────────────
  const canvas = $('#heroCity');
  const wide = () => innerWidth > 1100;
  const city = window.CITYCANVAS.create(canvas, geo, {
    tilt: 0.5, rotate: -22, zoom: 0.96, shiftX: wide() ? 0.11 : 0, shiftY: 0.05,
    pad: { l: 40, r: 40, t: 90, b: 110 },
    onPick: (i) => poke(i),
  });
  city.start();

  let snap = null, t = 30, playing = !S.reduced, k0 = 60, kEnd = 124, prevState = null;
  const T0 = 30, T1 = 62, SPEED = 1.45; // simulated hours per second
  const state = (r) => (r >= 0.75 ? 3 : r >= 0.55 ? 2 : r >= 0.35 ? 1 : 0);
  const R = new Float32Array(F.length);

  function riskAt(tt) {
    const k = Math.min(snap.K - 2, Math.floor(tt / snap.DT)), u = tt / snap.DT - k, N = snap.N;
    for (let i = 0; i < N; i++) R[i] = snap.now[k * N + i] * (1 - u) + snap.now[(k + 1) * N + i] * u;
    return R;
  }
  let lastK = -1, lastTick = 0;
  function tick(now) {
    const dt = lastTick ? Math.min(0.1, (now - lastTick) / 1000) : 0;
    lastTick = now;
    if (snap) {
      if (playing) { t += dt * SPEED; if (t > T1 + 2) { t = T0; lastK = -1; prevState = null; } }
      const tt = Math.min(t, T1);
      city.setRisk(riskAt(tt));
      const k = Math.round(tt / snap.DT);
      if (k !== lastK) { onStep(k); lastK = k; }
      drawTicker(tt);
    }
    requestAnimationFrame(tick);
  }
  function onStep(k) {
    const N = snap.N, NE = snap.NE;
    if (!prevState) prevState = new Int8Array(N).fill(-1);
    for (let i = 0; i < N; i++) {
      const s = state(snap.now[k * N + i]);
      if (prevState[i] >= 0 && s > prevState[i] && s >= 2 && kindOf(F[i]) !== 'weather') city.ring(i, s === 3 ? '#e5484d' : '#ee8a2a', 1.4);
      prevState[i] = s;
    }
    if (!playing) return;
    let budget = 6;
    for (let n = 0; n < NE && budget > 0; n++) {
      if (snap.eStat[k * NE + n] === 2) continue;
      const fl = snap.eFlow[k * NE + n];
      if (fl < 0.05 || Math.random() > Math.min(0.85, fl * 2.4)) continue;
      const ed = snap.E[n];
      city.pulse(ed.from, ed.to, { dur: 0.7 + ed.lag * 0.35, kind: flowKind(ed.to) });
      budget--;
    }
  }
  function drawTicker(tt) {
    const c = S.clock(snap.t0, tt, snap.tz);
    $('#heroT').textContent = `T+${tt.toFixed(1)}h`;
    $('#heroClock').textContent = `${c.day} · ${c.time} ${snap.tzLabel}`;
    $('#heroFill').style.width = (tt / 72) * 100 + '%';
    const k = Math.round(tt / snap.DT);
    $('#heroStats').innerHTML = `<span class="risk-critical">${snap.crit[k]} critical</span><span class="risk-high">${snap.high[k]} high</span><span>Cascade-R <b class="${snap.crR[k] >= 1 ? 'risk-critical' : ''}">${snap.crR[k].toFixed(2)}</b></span>`;
  }
  requestAnimationFrame(tick);

  $('#heroPlay').addEventListener('click', () => {
    playing = !playing;
    const b = $('#heroPlay');
    b.setAttribute('aria-pressed', String(playing));
    b.setAttribute('aria-label', playing ? 'Pause replay' : 'Play replay');
    b.innerHTML = playing
      ? '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="4" y="3" width="3" height="10" rx="0.8" fill="currentColor"/><rect x="9" y="3" width="3" height="10" rx="0.8" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 2.8v10.4L13 8z" fill="currentColor"/></svg>';
  });
  $('#heroTrack').addEventListener('click', (e) => {
    if (!snap) return;
    const r = e.currentTarget.getBoundingClientRect();
    t = Math.max(T0, Math.min(T1, ((e.clientX - r.left) / r.width) * 72));
    lastK = -1; prevState = null;
  });

  // Poke: send a pulse through everything that depends on facility i (learned links only).
  function poke(i) {
    if (!snap) return;
    const NE = snap.NE, kRef = snap.K - 1;
    const seen = new Map([[i, 0]]), queue = [i], reached = [];
    city.select(i);
    city.ring(i, '#79a7e3', 1.2);
    while (queue.length) {
      const a = queue.shift();
      for (const ed of snap.E) {
        if (ed.from !== a || snap.eStat[kRef * NE + ed.n] === 2 || snap.eMean[kRef * NE + ed.n] < 0.05) continue;
        const tArr = seen.get(a) + ed.lag;
        if (seen.has(ed.to) && seen.get(ed.to) <= tArr) continue;
        seen.set(ed.to, tArr);
        queue.push(ed.to);
        reached.push({ from: a, to: ed.to, t: tArr, w: snap.eMean[kRef * NE + ed.n] });
      }
    }
    reached.sort((x, y) => x.t - y.t);
    // Pulses leave each facility when stress reaches it: delay scales with cumulative lag.
    reached.slice(0, 24).forEach((r) => city.pulse(r.from, r.to, { delay: seen.get(r.from) * 0.45, dur: 0.6 + (r.t - seen.get(r.from)) * 0.3, kind: flowKind(r.to), onArrive: () => city.ring(r.to, '#e4e8ee', 0.9) }));
    const first = reached.slice(0, 4).map((r) => `${esc(F[r.to].name)} <span class="mono">+${r.t.toFixed(1)} h</span>`);
    $('#heroHint').innerHTML = reached.length
      ? `<b>${esc(F[i].name)}</b> reaches ${reached.length} facilit${reached.length > 1 ? 'ies' : 'y'} through learned links: ${first.join(', ')}${reached.length > 4 ? '…' : '.'}`
      : `<b>${esc(F[i].name)}</b> has no confirmed downstream links yet. Try a lake, a river crossing or a substation.`;
    setTimeout(() => city.select(-1), 4000);
  }

  // ── Forecast products from the worker ─────────────────────────────────
  S.call('snapshot', { city: 'nagpur', scen: SCEN, kIssue: K_ISSUE }).then((s) => {
    snap = s;
    window.TWIN.core.setTZ(s.tz, s.tzLabel);
    t = S.reduced ? 47 : T0;
    renderCourse(s);
    renderReliability(s);
    showCap('crises');
    setTimeout(loadScen, 1500); // warm the scenario summaries in the background
  }).catch((err) => {
    $('#courseFoot').textContent = 'The forecast engine could not start: ' + err.message;
  });

  function crit(s) {
    const c = s.course.filter((x) => x.level === 'CRITICAL' && x.prob >= 0.5 && kindOf(F[x.i]) !== 'weather');
    return c.length >= 3 ? c : s.course;
  }
  function phrase(s, e) { return `${F[e.i].name} ${VERB[kindOf(F[e.i])][e.level === 'CRITICAL' ? 1 : 0]}`; }
  function renderCourse(s) {
    const ev = crit(s).slice(0, 5);
    const tIssue = s.kIssue * s.DT;
    $('#courseList').innerHTML = ev.map((e, n) => {
      const c = S.clock(s.t0, e.t, s.tz);
      return `<li><span class="course-n ${e.level === 'CRITICAL' ? 'crit' : 'high'}">${n + 1}</span>
        <div><div class="course-what">${esc(phrase(s, e))}</div>
        <div class="course-when mono">${c.day} ${c.time} · ${S.pct(e.prob)} · in ${Math.round(e.t - tIssue)} h</div></div></li>`;
    }).join('');
    const firstCrit = Array.from(s.crit).findIndex((x) => x > 0);
    const lead = firstCrit >= 0 ? firstCrit * s.DT - tIssue : null;
    $('#courseFoot').innerHTML = lead != null ? `Issued <b class="mono">${lead.toFixed(1)} h</b> before the first facility actually went critical.` : '';
    const [a, b, c] = ev;
    if (a && b && c) {
      const ca = S.clock(s.t0, a.t, s.tz), cb = S.clock(s.t0, b.t, s.tz), cc = S.clock(s.t0, c.t, s.tz);
      $('#compareText').innerHTML = `"${esc(phrase(s, a))} around ${ca.time} on ${ca.day.slice(4)} (${S.pct(a.prob)}); then ${esc(phrase(s, b))} by ${cb.time}, and ${esc(phrase(s, c))} by ${cc.time}."`;
      $('#compareNote').textContent = `Issued ${lead != null ? lead.toFixed(0) + ' hours' : ''} before the first facility went critical. Every time and probability here comes from the engine running in your browser on data that had arrived by 06:00.`;
    }
  }

  // ── Capability explorer ───────────────────────────────────────────────
  const stage = $('#stage');
  const capCache = {};
  $$('.explorer-tabs [data-cap]').forEach((b) => b.addEventListener('click', () => showCap(b.dataset.cap)));
  $('.explorer-tabs').addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const tabs = $$('.explorer-tabs [data-cap]'), i = tabs.indexOf(document.activeElement);
    const n = tabs[(i + (e.key === 'ArrowDown' ? 1 : tabs.length - 1)) % tabs.length];
    n.focus(); showCap(n.dataset.cap);
  });
  let capToken = 0;
  function showCap(cap) {
    $$('.explorer-tabs [data-cap]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cap === cap)));
    if (!snap) { stage.innerHTML = '<div class="stage-wait"><span class="status-line"><i class="led"></i>Starting the engine…</span></div>'; return; }
    const token = ++capToken;
    const done = (html, after) => { if (token !== capToken) return; stage.innerHTML = html; stage.classList.remove('swap'); void stage.offsetWidth; stage.classList.add('swap'); if (after) after(); };
    const wait = (msg) => done(`<div class="stage-wait"><span class="status-line"><i class="led"></i>${msg}</span></div>`);
    const s = snap;
    const openLink = (href, label) => `<a class="text-link" href="${href}">${label} <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg></a>`;
    if (cap === 'crises') {
      const kPeak = Array.from(s.crit).indexOf(Math.max(...s.crit));
      const c = S.clock(s.t0, kPeak * s.DT, s.tz);
      const stageCls = { Precursor: 'r-watch', Emerging: 'r-high', Escalating: 'r-critical', Active: 'r-critical', Recovering: 'r-normal' };
      done(`<div class="stage-head"><h3 class="h3">${s.crisesPeak.length} crises at the peak, ${c.day} ${c.time}</h3><p>Connected sets of stressed facilities, joined where stress flows along a learned link. Each keeps its own type, stage and footprint, so a flood on the Nag and one on the Pili stay separate.</p></div>
        <div class="crisis-rows">${s.crisesPeak.map((x) => `<div class="crisis-row">
          <span class="mono cid">${x.id}</span><span class="ctype">${esc(x.type)}<small>${esc(x.districts.slice(0, 3).join(', '))}${x.districts.length > 3 ? ` +${x.districts.length - 3}` : ''}</small></span>
          <span class="csys">${Object.entries(x.sys).map(([k, r]) => `<i title="${S.SYS[k].label}" style="background:${window.CITYCANVAS.HEX[window.CITYCANVAS.stateKey(r)]}"></i>`).join('')}</span>
          <span class="mono cpeople">${S.fmtK(x.people)}</span><span class="pill ${stageCls[x.stage]}">${x.stage}</span></div>`).join('')}</div>
        <div class="stage-foot">${openLink('twin.html?scenario=monsoon2023', 'Open the crisis registry')}</div>`);
    } else if (cap === 'cascader') {
      const cross = Array.from(s.crR).findIndex((r) => r >= 1);
      done(`<div class="stage-head"><h3 class="h3">${cross >= 0 ? `The cascade became self-sustaining at T+${(cross * s.DT).toFixed(1)}` : 'The cascade never fed itself'}</h3><p>Cascade-R divides the stress arriving through dependencies by the stress arriving straight from the hazard. Below 1 the city is reacting to the storm; above 1 more stress is moving through the network than falling from the sky.</p></div>
        <canvas class="chart" id="crChart" style="height:230px"></canvas>
        <div class="legend-inline"><span><i style="border-color:#ef6b73"></i>Cascade-R</span><span><i style="border-color:rgba(255,255,255,.45);border-top-style:dashed"></i>1.0, self-sustaining</span></div>
        <div class="stage-foot">${openLink('method.html#cascade-r', 'How Cascade-R is computed')}</div>`, () => {
        const max = Math.max(2.2, ...s.crR);
        S.chart($('#crChart'), { height: 230, xr: [0, 72], yr: [0, max], yticks: [0, 1, 2], xticks: [0, 12, 24, 36, 48, 60, 72], xfmt: (x) => `T+${x}`, yfmt: (y) => y.toFixed(0),
          bands: [{ y0: 1, y1: max, color: 'rgba(229,72,77,0.05)' }],
          series: [{ y: [1, 1], x0: 0, dx: 72, color: 'rgba(255,255,255,0.45)', dash: [4, 4], width: 1 }, { y: Array.from(s.crR), dx: s.DT, color: '#ef6b73', fill: '#ef6b73', width: 1.8 }],
          marks: cross >= 0 ? [{ x: cross * s.DT, label: `crosses 1.0 at T+${(cross * s.DT).toFixed(1)}`, color: '#ef6b73' }] : [] });
      });
    } else if (cap === 'graph') {
      const NE = s.NE, kL = s.K - 1;
      const st = { 0: 0, 1: 0, 2: 0 };
      let spur = 0, spurPruned = 0;
      s.E.forEach((e) => { const x = s.eStat[kL * NE + e.n]; st[x]++; if (e.spurious) { spur++; if (x === 2 || s.eMean[kL * NE + e.n] < 0.05) spurPruned++; } });
      done(`<div class="stage-head"><h3 class="h3">${st[1]} links confirmed, ${st[2]} pruned, from the sensor streams alone</h3><p>No structure is given in advance. Each candidate link is a hypothesis that sparse Bayesian regression confirms, prunes or leaves waiting for evidence. ${spur} of the candidates were planted as fakes; ${spurPruned} of them carry no weight by T+72.</p></div>
        <div class="mini-graph" id="miniGraph"></div>
        <div class="stage-foot">${openLink('graph.html', 'Explore the knowledge graph')}</div>`, () => miniGraph($('#miniGraph'), s));
    } else if (cap === 'ghost') {
      const k = s.kLive;
      if (capCache.ghost) return renderGhost(capCache.ghost);
      wait('Searching for the best plan within 5 crews, then re-simulating 24 futures…');
      S.call('recommend', { city: 'nagpur', scen: SCEN, k, budget: 5 })
        .then((ids) => Promise.all([ids, S.call('compare', { city: 'nagpur', scen: SCEN, k, ids }), S.call('catalog', { city: 'nagpur', scen: SCEN }), S.call('evaluate', { city: 'nagpur', scen: SCEN, k, ids })]))
        .then(([ids, cmp, cat, ev]) => { capCache.ghost = { ids, cmp, cat, ev, k }; renderGhost(capCache.ghost); })
        .catch((err) => done(`<div class="stage-wait">Could not run the planner: ${esc(err.message)}</div>`));
      function renderGhost(G) {
        const t0 = G.k * s.DT;
        done(`<div class="stage-head"><h3 class="h3">${Math.round(G.ev.reduction * 100)}% fewer critical facility-hours, decided at T+${t0.toFixed(1)}</h3><p>The planner picks actions within a crew budget and re-runs them on the same futures as doing nothing. In the operations room the ghost city repaints the map with the plan applied.</p></div>
          <canvas class="chart" id="ghostChart" style="height:200px"></canvas>
          <div class="legend-inline"><span><i style="border-color:#8a939e"></i>Do nothing</span><span><i style="border-color:#b39af0"></i>With the plan</span></div>
          <ul class="plan-list">${G.ids.map((id) => { const a = G.cat.find((x) => x.id === id); return `<li><b>${esc(a.label)}</b><span class="mono">${a.cost} crew${a.cost > 1 ? 's' : ''}</span></li>`; }).join('')}</ul>
          <div class="stage-foot">${openLink('lab.html', 'Build your own plan in the lab')}</div>`, () => {
          const max = Math.max(4, ...G.cmp.baseCrit);
          S.chart($('#ghostChart'), { height: 200, xr: [t0, 72], yr: [0, max * 1.1], yticks: [0, Math.round(max / 2), Math.round(max)], xticks: [t0, 48, 60, 72].filter((x, n, a) => n === 0 || x > t0 + 4), xfmt: (x) => `T+${Math.round(x)}`, yfmt: (y) => String(Math.round(y)),
            series: [{ y: G.cmp.baseCrit, x0: t0, dx: s.DT, color: '#8a939e', width: 1.5 }, { y: G.cmp.withCrit, x0: t0, dx: s.DT, color: '#b39af0', fill: '#b39af0', width: 1.8 }] });
        });
      }
    } else if (cap === 'red') {
      if (capCache.red) return renderRed(capCache.red);
      wait('Poisoning three input streams and re-assimilating 200 members from scratch…');
      S.call('redteam', { city: 'nagpur', scen: SCEN, ids: ['freeze', 'spike', 'bots'], onset: 6, kNow: 94 }).then((r) => { capCache.red = r; renderRed(r); })
        .catch((err) => done(`<div class="stage-wait">Could not run the attack: ${esc(err.message)}</div>`));
      function renderRed(r) {
        const bar = (label, v, truth) => `<div class="rt-bar"><span>${label}</span><span class="rt-track"><i style="width:${Math.max(1, v * 100)}%;background:${window.CITYCANVAS.HEX[window.CITYCANVAS.stateKey(v)]}"></i><b style="left:${truth * 100}%"></b></span><span class="mono">${S.pct(v)}</span></div>`;
        done(`<div class="stage-head"><h3 class="h3">Three attacks from T+${r.tA.toFixed(0)}: ${r.extra === 0 ? 'no false alerts raised' : r.extra + ' false alert' + (r.extra > 1 ? 's' : '')}</h3><p>A frozen river gauge, a spoofed substation spike and twelve coordinated bot reports. The attacked twin is rebuilt on the poisoned streams and scored against the clean run. The white tick is the hidden truth.</p></div>
          <div class="rt-rows">${r.rows.map((x) => x.kind === 'sensor' && !x.masked && !x.harmless ? `<div class="rt-row"><div class="rt-head"><b>${esc(x.label)}</b><span class="mono dim">${esc(F[x.i].id)}</span><span class="pill ${x.flaggedAfter != null ? 'r-normal' : 'r-critical'}">${x.flaggedAfter != null ? `flagged in ${x.flaggedAfter.toFixed(1)} h` : 'not flagged'}</span></div>${bar('Raw feed', x.raw, x.truth)}${bar('Twin', x.twin, x.truth)}</div>`
            : x.kind === 'reports' ? `<div class="rt-row"><div class="rt-head"><b>${esc(x.label)}</b><span class="mono dim">${x.n} posts</span><span class="pill ${x.held === x.n ? 'r-normal' : 'r-watch'}">${x.held} of ${x.n} held</span></div><p class="dim">Scored against the severity each post claims; reports never drive the forecast directly.</p></div>` : '').join('')}</div>
          <div class="stage-foot">${openLink('twin.html?scenario=monsoon2023', 'Launch your own attack in the operations room')}</div>`);
      }
    } else if (cap === 'comms') {
      if (capCache.comms) return renderComms(capCache.comms);
      wait('Drafting public messages for the active crises…');
      S.call('messages', { city: 'nagpur', scen: SCEN, k: 90 }).then((m) => { capCache.comms = m; renderComms(m); })
        .catch((err) => done(`<div class="stage-wait">Could not draft messages: ${esc(err.message)}</div>`));
      function renderComms(m) {
        const c = m[0];
        if (!c) return done('<div class="stage-wait">No active crisis to warn about at this time.</div>');
        done(`<div class="stage-head"><h3 class="h3">${esc(c.type)} · ${esc(c.id)}</h3><p>Every crisis gets a CAP 1.2 alert with one block per language and a footprint polygon, and SMS text sized for the network: Devanagari forces UCS-2, 70 characters a segment.</p></div>
          <div class="phone"><div class="phone-bar"><span>CB · ${esc(geo.city)}</span><span class="mono" id="smsMeta"></span></div><div class="phone-msg" id="smsText" lang="en"></div></div>
          <div class="seg" id="smsLang">${c.sms.map((x, n) => `<button type="button" data-n="${n}" aria-pressed="${n === 0}">${esc(x.name)}</button>`).join('')}</div>
          <div class="stage-foot">${openLink('twin.html?scenario=monsoon2023', 'Open the communications desk')}</div>`, () => {
          let cur = 0, timer = 0, autoplay = true;
          const type = (n) => {
            cur = n; clearTimeout(timer);
            const msg = c.sms[n], el = $('#smsText');
            if (!el) return;
            el.lang = msg.lang;
            $$('#smsLang button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n === n)));
            $('#smsMeta').textContent = `${msg.encoding} · ${msg.chars} chars · ${msg.segments} seg`;
            const chars = [...msg.text];
            let q = 0;
            const step = () => { if (!document.body.contains(el)) return; el.textContent = chars.slice(0, q).join(''); q += 2; if (q <= chars.length + 1) timer = setTimeout(step, S.reduced ? 0 : 16); else if (autoplay) timer = setTimeout(() => type((cur + 1) % c.sms.length), 2600); };
            step();
          };
          $('#smsLang').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) { autoplay = false; type(+b.dataset.n); } });
          type(0);
        });
      }
    }
  }

  // System-level graph: nodes are systems, arcs carry the confirmed facility links between them.
  function miniGraph(el, s) {
    const NE = s.NE, kL = s.K - 1;
    const sys = ['drainage', 'traffic', 'power', 'telecom', 'ems', 'hospital'];
    const pos = {}, Wd = 560, Hd = 300, cx = Wd / 2, cy = Hd / 2 + 6;
    sys.forEach((k, n) => { const a = -Math.PI / 2 + (n / sys.length) * Math.PI * 2; pos[k] = [cx + Math.cos(a) * 200, cy + Math.sin(a) * 112]; });
    const sysOf = (i) => { const k = kindOf(F[i]); return k === 'pump' ? 'drainage' : k; };
    const agg = {};
    s.E.forEach((e) => {
      const a = sysOf(e.from), b = sysOf(e.to);
      if (a === b || !pos[a] || !pos[b]) return;
      const key = a + '>' + b;
      (agg[key] ||= { a, b, conf: 0, all: 0, w: 0 });
      agg[key].all++;
      if (s.eStat[kL * NE + e.n] === 1) { agg[key].conf++; agg[key].w += s.eMean[kL * NE + e.n]; }
    });
    const arcs = Object.values(agg).map((g) => {
      const [x1, y1] = pos[g.a], [x2, y2] = pos[g.b], mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
      const c = [mx - dy * 0.18, my + dx * 0.18];
      const on = g.conf > 0;
      return `<path d="M${x1},${y1} Q${c[0]},${c[1]} ${x2},${y2}" fill="none" stroke="${on ? S.SYS[g.b].hex : 'rgba(220,230,245,0.12)'}" stroke-width="${on ? 1 + Math.min(4, g.w * 3) : 1}" ${on ? 'class="flowline"' : 'stroke-dasharray="3 4"'} opacity="${on ? 0.85 : 1}"><title>${S.SYS[g.a].label} → ${S.SYS[g.b].label}: ${g.conf} of ${g.all} links confirmed</title></path>`;
    }).join('');
    const nodes = sys.map((k) => { const [x, y] = pos[k]; return `<g transform="translate(${x},${y})"><circle r="23" fill="#0b0e12" stroke="${S.SYS[k].hex}" stroke-width="1.6"/><text text-anchor="middle" dy="4" fill="#e4e8ee" font-size="10.5" font-family="var(--font-ui)" font-weight="600">${S.SYS[k].label}</text></g>`; }).join('');
    el.innerHTML = `<svg viewBox="0 0 ${Wd} ${Hd}" width="100%" role="img" aria-label="Systems and the learned links between them">${arcs}${nodes}</svg>`;
  }

  // ── Scenario strip and scorecard ──────────────────────────────────────
  const strip = $('#strip');
  strip.innerHTML = SCENARIOS.map((id) => `<article class="scard" data-id="${id}"><div class="scard-top"><h3 class="h3 skeleton" style="height:22px;width:70%"></h3></div><canvas class="chart" style="height:120px"></canvas><dl class="scard-facts"></dl><div class="scard-links"></div></article>`).join('');
  const tbody = $('#scoreTable tbody');
  tbody.innerHTML = SCENARIOS.map((id) => `<tr data-id="${id}"><td colspan="6"><span class="skeleton" style="display:block;height:16px;width:60%"></span></td></tr>`).join('');
  let started = false;
  const loadScen = () => {
    if (started) return; started = true;
    SCENARIOS.forEach((id) => S.summary('nagpur', id).then((x) => { fillCard(x); fillRow(x); }).catch(() => {}));
  };
  S.whenVisible($('#scenarios'), loadScen, '0px 0px 400px 0px');
  S.whenVisible($('#proof'), loadScen, '0px 0px 400px 0px');

  function fillCard(x) {
    const el = $(`.scard[data-id="${x.scen}"]`, strip);
    if (!el) return;
    el.querySelector('.scard-top').innerHTML = `<h3 class="h3">${esc(x.label)}</h3><p>${esc(x.blurb.split('. ')[0])}.</p>`;
    el.querySelector('.scard-facts').innerHTML = `
      <div><dt>First critical</dt><dd class="mono">${x.firstCrit != null ? 'T+' + x.firstCrit.toFixed(1) : '—'}</dd></div>
      <div><dt>Peak critical</dt><dd class="mono">${x.peakCrit}</dd></div>
      <div><dt>Self-sustaining</dt><dd class="mono">${x.crCross != null ? 'T+' + x.crCross.toFixed(1) : 'never'}</dd></div>`;
    el.querySelector('.scard-links').innerHTML = `<a class="text-link" href="twin.html?scenario=${x.scen}">Replay</a><a class="text-link dimlink" href="scenarios.html#${x.scen}">Details</a>`;
    const cv = el.querySelector('canvas');
    const draw = () => S.chart(cv, { height: 120, padL: 6, padR: 6, padT: 6, padB: 16, xr: [0, 72], yr: [0, 1], xticks: [0, 24, 48, 72], xfmt: (v) => `${v}h`,
      bands: [{ y0: 0.55, y1: 0.75, color: 'rgba(238,138,42,0.06)' }, { y0: 0.75, y1: 1, color: 'rgba(229,72,77,0.07)' }],
      series: [{ y: x.risk, dx: x.dt, color: '#e4e8ee', width: 1.4, fill: '#79a7e3', fillAlpha: 0.12 }, { y: x.cr.map((v) => Math.min(1, v / 3)), dx: x.dt * 2, color: '#ef6b73', width: 1.1, dash: [3, 3] }] });
    draw();
    new ResizeObserver(draw).observe(cv);
  }
  function fillRow(x) {
    const tr = $(`tr[data-id="${x.scen}"]`, tbody);
    if (!tr) return;
    const v = x.validation;
    const few = v.events < 3;
    tr.innerHTML = `<td><a class="row-link" href="scenarios.html#${x.scen}">${esc(x.label)}</a></td>
      <td class="n">${few ? '—' : v.lead.toFixed(1) + ' h'}</td><td class="n">${few ? '—' : S.pct(v.pod)}</td><td class="n">${few ? '—' : S.pct(v.far)}</td>
      <td class="n">${v.brier.toFixed(3)}</td><td class="n">${few || !isFinite(v.bss) ? '<span class="dim">too few events</span>' : (v.bss >= 0 ? '+' : '') + v.bss.toFixed(2)}</td>`;
  }

  function renderReliability(s) {
    const cv = $('#relChart');
    const draw = () => {
      const c = S.chart(cv, { height: 240, xr: [0, 1], yr: [0, 1], yticks: [0, 0.25, 0.5, 0.75, 1], xticks: [0, 0.25, 0.5, 0.75, 1], xfmt: (v) => v.toFixed(2), yfmt: (v) => v.toFixed(2),
        series: [{ y: [0, 1], x0: 0, dx: 1, color: 'rgba(255,255,255,0.3)', dash: [4, 4], width: 1 }] });
      const pts = s.validation.bins.filter((b) => b.n > 20);
      const g = c.g;
      g.strokeStyle = '#79a7e3'; g.lineWidth = 1.8; g.beginPath();
      pts.forEach((b, n) => (n ? g.lineTo(c.X(b.p), c.Y(b.o)) : g.moveTo(c.X(b.p), c.Y(b.o)))); g.stroke();
      for (const b of pts) { g.fillStyle = '#79a7e3'; g.beginPath(); g.arc(c.X(b.p), c.Y(b.o), 2.5 + Math.min(5, Math.sqrt(b.n) / 10), 0, Math.PI * 2); g.fill(); }
    };
    draw();
    new ResizeObserver(draw).observe(cv);
  }
})();
