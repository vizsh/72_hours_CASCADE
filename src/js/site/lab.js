/* Intervention lab: constrained counterfactuals compared on identical futures. */
(function () {
  const S = window.SITE, { $, $$, esc } = S;
  S.chrome('lab');
  const params = new URLSearchParams(location.search);
  let scen = params.get('scenario') || 'monsoon2023', budget = 5, k = null, chosen = new Set(), cat = [], summary = null;
  const DT = 0.5;

  const scenSel = $('#lScen');
  const list = Object.values(window.TWIN.scenarios).filter((s) => !s.cities || s.cities.includes('nagpur')).sort((a, b) => Number(!!b.cities) - Number(!!a.cities));
  scenSel.innerHTML = list.map((s) => `<option value="${s.id}" ${s.id === scen ? 'selected' : ''}>${esc(s.label)}</option>`).join('');
  scenSel.addEventListener('change', () => { scen = scenSel.value; chosen.clear(); k = null; boot(); });

  function boot() {
    $('#lActs').innerHTML = '<div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px"></div>';
    verdict('<span class="status-line"><i class="led"></i>Running the ensemble and generating actions from the dependency graph…</span>');
    Promise.all([S.call('catalog', { city: 'nagpur', scen }), S.summary('nagpur', scen)]).then(([c, sm]) => {
      cat = c; summary = sm;
      if (k == null) k = Math.round((+params.get('k') || sm.liveNow / DT));
      if (params.get('plan') && !chosen.size) params.get('plan').split(',').forEach((id) => cat.some((a) => a.id === id) && chosen.add(id));
      $('#lK').max = Math.round(60 / DT); $('#lK').value = k;
      drawActs(); run();
    }).catch((e) => verdict(`<span class="status-line err"><i class="led"></i>${esc(e.message)}</span>`));
  }
  const verdict = (html) => { $('#lVerdict').innerHTML = html; };
  const used = () => [...chosen].reduce((s, id) => s + (cat.find((a) => a.id === id) || { cost: 0 }).cost, 0);

  function drawActs() {
    const u = used();
    $('#lPips').innerHTML = `<span class="label">Crews used</span><span class="pips">${Array.from({ length: Math.max(budget, u) }, (_, n) => `<i class="${n < u ? (u > budget ? 'over' : 'on') : ''}"></i>`).join('')}</span><span class="mono ${u > budget ? 'risk-critical' : ''}">${u} / ${budget}</span>`;
    $('#lActs').innerHTML = cat.map((a) => `<button type="button" class="lact" data-id="${a.id}" aria-pressed="${chosen.has(a.id)}">
        <span class="lact-top"><b>${esc(a.label)}</b><span class="lact-cost">${Array.from({ length: a.cost }, () => '<i></i>').join('')}</span></span>
        <span class="lact-detail">${esc(a.detail)}</span>
        ${a.side ? `<span class="lact-side">Side effect: ${esc(a.side)}</span>` : ''}
        <span class="lact-gain mono" data-gain="${a.id}"></span></button>`).join('');
    $$('#lActs .lact').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.id; chosen.has(id) ? chosen.delete(id) : chosen.add(id); b.setAttribute('aria-pressed', String(chosen.has(id))); drawActs(); run(); }));
    singles();
  }
  // Each action alone, filled lazily so the list paints first.
  let singleToken = 0;
  function singles() {
    const token = ++singleToken;
    (async () => {
      for (const a of cat) {
        if (token !== singleToken) return;
        const r = await S.call('evaluate', { city: 'nagpur', scen, k, ids: [a.id], n: 16 }).catch(() => null);
        if (token !== singleToken || !r) return;
        const el = $(`[data-gain="${a.id}"]`);
        if (el) el.textContent = `alone: ${r.reduction >= 0 ? '−' : '+'}${Math.abs(r.reduction * 100).toFixed(Math.abs(r.reduction) < 0.1 ? 1 : 0)}% critical facility-hours`;
      }
    })();
  }

  $('#lK').addEventListener('input', (e) => { k = +e.target.value; label(); clearTimeout(runTimer); runTimer = setTimeout(() => { drawActs(); run(); }, 280); });
  function label() { const c = summary ? S.clock(summary.t0, k * DT, 'Asia/Kolkata') : null; $('#lKlabel').textContent = `T+${(k * DT).toFixed(1)}h${c ? ' · ' + c.day + ' ' + c.time : ''}`; }
  $('#lBudget').addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (!b) return; budget = +b.dataset.b; $$('#lBudget button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawActs(); run(); });
  $('#lRec').addEventListener('click', () => {
    const btn = $('#lRec');
    btn.disabled = true; btn.textContent = 'Searching plans…';
    S.call('recommend', { city: 'nagpur', scen, k, budget }).then((ids) => { chosen = new Set(ids); drawActs(); run(); })
      .finally(() => { btn.disabled = false; btn.textContent = 'Recommend within budget'; });
  });

  let runTimer = 0, runToken = 0, prevWith = null;
  function run() {
    label();
    const token = ++runToken, ids = [...chosen];
    verdict('<span class="status-line"><i class="led"></i>Re-simulating 32 futures from the decision time…</span>');
    Promise.all([S.call('evaluate', { city: 'nagpur', scen, k, ids, n: 32 }), S.call('compare', { city: 'nagpur', scen, k, ids })]).then(([ev, cmp]) => {
      if (token !== runToken) return;
      renderOutcome(ev, cmp, ids);
      if (!ids.length) { deadlineEmpty('Pick an action to see how long you can wait.'); return; }
      $('#lDl').textContent = 'Re-running the plan with crews starting later…';
      return S.call('deadline', { city: 'nagpur', scen, k, ids }).then((d) => { if (token === runToken) renderDeadline(d); });
    }).catch((e) => verdict(`<span class="status-line err"><i class="led"></i>${esc(e.message)}</span>`));
    $('#lGhost').href = `twin.html?scenario=${scen}${ids.length ? `&plan=${ids.join(',')}&k=${k}` : ''}`;
  }

  function renderOutcome(ev, cmp, ids) {
    const red = ev.reduction, care = ev.careReduction;
    const t0 = k * DT;
    let v;
    if (!ids.length) v = `<b>Doing nothing</b> from T+${t0.toFixed(1)}: about ${Math.round(ev.base.critHours)} critical facility-hours ahead, P(a hospital goes critical) ${S.pct(ev.base.hospCrit)}.`;
    else if (ev.cascadeBroken) v = `<b class="risk-normal">This plan breaks the cascade.</b> The chance a hospital goes critical falls from ${S.pct(ev.base.hospCrit)} to ${S.pct(ev.with.hospCrit)}.`;
    else if (red > 0.08) v = `<b class="accent">Mitigated.</b> ${Math.round(red * 100)}% fewer critical facility-hours; hospital and EMS critical hours ${care >= 0 ? 'down' : 'up'} ${Math.abs(Math.round(care * 100))}%.`;
    else v = `<b class="risk-high">Marginal.</b> This plan barely moves the city-wide outcome (${red >= 0 ? '−' : '+'}${Math.abs(Math.round(red * 100))}%). Try acting earlier, or on the facilities feeding the hospitals.`;
    verdict(`<p>${v}</p>`);
    const row = (label, b, w, fmt, better) => {
      const d = w - b, good = better === 'down' ? d <= 0 : d >= 0;
      return `<div class="led-row"><span class="label">${label}</span><span class="mono led-b">${fmt(b)}</span><span class="led-arrow">→</span><span class="mono led-w">${ids.length ? fmt(w) : '—'}</span><span class="mono led-d ${!ids.length || Math.abs(d) < 1e-6 ? '' : good ? 'risk-normal' : 'risk-critical'}">${ids.length && Math.abs(d) > 1e-6 ? (d > 0 ? '+' : '−') + fmt(Math.abs(d)) : ''}</span></div>`;
    };
    $('#lLedger').innerHTML = `<div class="led-head"><span></span><span>Do nothing</span><span></span><span>With plan</span><span>Change</span></div>
      ${row('Critical facility-hours', ev.base.critHours, ev.with.critHours, (x) => Math.round(x).toString(), 'down')}
      ${row('Hospital critical hours', ev.base.careHours, ev.with.careHours, (x) => x.toFixed(1), 'down')}
      ${row('P(a hospital goes critical)', ev.base.hospCrit, ev.with.hospCrit, (x) => S.pct(x), 'down')}
      ${row('Facilities reaching critical', ev.base.nCrit, ev.with.nCrit, (x) => x.toFixed(1), 'down')}`;
    // Chart with a short tween from the previous plan's curve
    const base = Array.from(cmp.baseCrit), target = Array.from(cmp.withCrit);
    const from = prevWith && prevWith.length === target.length ? prevWith : base;
    prevWith = target;
    const max = Math.max(4, ...base) * 1.12;
    const draw = (u) => {
      const mid = target.map((v, q) => from[q] + (v - from[q]) * u);
      S.chart($('#lChart'), { height: 240, xr: [t0, 72], yr: [0, max], yticks: [0, Math.round(max / 2), Math.round(max)], xticks: [t0, ...[24, 36, 48, 60, 72].filter((x) => x > t0 + 5)], xfmt: (x) => `T+${Math.round(x)}`, yfmt: (y) => String(Math.round(y)),
        series: [{ y: base, x0: t0, dx: DT, color: '#8a939e', width: 1.5 }, ...(ids.length ? [{ y: mid, x0: t0, dx: DT, color: '#b39af0', fill: '#b39af0', width: 2 }] : [])],
        marks: [{ x: t0, label: 'decision', color: 'rgba(121,167,227,0.7)' }] });
    };
    if (S.reduced || !ids.length) draw(1);
    else { const s0 = performance.now(); const step = (t) => { const u = Math.min(1, (t - s0) / 420); draw(1 - Math.pow(1 - u, 3)); if (u < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
    // Systems
    const sys = ['drainage', 'traffic', 'power', 'telecom', 'ems', 'hospital'].filter((x) => cmp.sysBase[x] != null);
    const col = (r) => window.TWIN.core.RISK_HEX[window.TWIN.core.stateOf(r).key];
    $('#lSys').innerHTML = sys.map((x) => `<div class="sys-row"><span>${S.SYS[x].label}</span><span class="sys-track"><i class="b" style="width:${cmp.sysBase[x] * 100}%"></i><i class="w" style="width:${cmp.sysWith[x] * 100}%;background:${col(cmp.sysWith[x])}"></i></span><span class="mono">${Math.round(cmp.sysBase[x] * 100)}${ids.length ? ' → ' + Math.round(cmp.sysWith[x] * 100) : ''}</span></div>`).join('');
    $('#lSide').innerHTML = ev.sideEffects.length ? `<span class="label">Side effects the plan creates</span><ul>${ev.sideEffects.map((s) => `<li><b>${esc(s.name)}</b><span class="mono risk-high">peak +${Math.round(s.delta * 100)} pts</span></li>`).join('')}</ul>` : ids.length ? '<span class="label">Side effects</span><p class="dim">No facility gets measurably worse under this plan.</p>' : '';
  }
  function deadlineEmpty(msg) {
    S.chart($('#lDead'), { height: 150, xr: [0, 24], yr: [0, 1], series: [], xticks: [0, 6, 12, 18, 24], xfmt: (x) => `+${x}h` });
    $('#lDl').textContent = msg;
  }
  function renderDeadline(d) {
    if (!d.pts.length || d.r0 <= 0.02) return deadlineEmpty('No measurable benefit at any start time for this plan.');
    const top = Math.max(0.05, ...d.pts.map((p) => p.reduction)) * 1.15;
    S.chart($('#lDead'), { height: 150, xr: [0, d.pts[d.pts.length - 1].h], yr: [0, top], yticks: [0, +(top / 2).toFixed(2)], yfmt: (y) => Math.round(y * 100) + '%', xticks: [0, 6, 12, 18, 24].filter((x) => x <= d.pts[d.pts.length - 1].h), xfmt: (x) => `+${x}h`,
      series: [{ y: d.pts.map((p) => p.reduction), x0: 0, dx: 2, color: '#79a7e3', fill: '#79a7e3', width: 1.8 }],
      marks: d.actBy != null ? [{ x: d.actBy, label: `act by +${d.actBy} h`, color: '#e2b93b' }] : [] });
    const t0 = k * DT;
    $('#lDl').innerHTML = d.actBy != null && d.actBy > 0
      ? `Start by <b class="mono">T+${(t0 + d.actBy).toFixed(1)}</b> to keep 80% of the benefit${d.half != null ? `; by T+${(t0 + d.half).toFixed(1)} it is worth less than half` : ''}.`
      : 'Most of the benefit is lost with any delay. <b>Act now.</b>';
  }
  boot();
})();
