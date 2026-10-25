/* Scenarios: reach matrix and one dossier per crisis, filled as background threads finish. */
(function () {
  const S = window.SITE, { $, $$, esc } = S;
  S.chrome('scenarios');
  const C = window.TWIN.core;
  const SYS = ['drainage', 'traffic', 'power', 'telecom', 'ems', 'hospital'];
  const META = {
    monsoon2023: { group: 'weather', tags: ['Real event, 2023', 'Rain', 'Lake overflow'] },
    tropical: { group: 'weather', tags: ['Rain', 'Two bands'] },
    flash: { group: 'weather', tags: ['Rain', 'Convective'] },
    heat: { group: 'weather', tags: ['Heat', 'Wind'] },
    blackout: { group: 'infrastructure', tags: ['Grid fault', 'Telecom'] },
    chlorine: { group: 'human', tags: ['Toxic release', 'Gaussian plume'] },
    festival: { group: 'human', tags: ['Crowds', 'Storm'] },
  };
  const order = ['monsoon2023', 'chlorine', 'festival', 'blackout', 'tropical', 'flash', 'heat'];
  const sc = window.TWIN.scenarios;

  // Skeletons
  $('#reach thead tr').innerHTML = '<th>Scenario</th>' + SYS.map((s) => `<th><i style="background:${S.SYS[s].hex}"></i>${S.SYS[s].label}</th>`).join('');
  $('#reach tbody').innerHTML = order.map((id) => `<tr data-id="${id}" data-g="${META[id].group}"><th><a href="#${id}">${esc(sc[id].label)}</a></th>${SYS.map(() => '<td><span class="skeleton" style="display:block;height:26px"></span></td>').join('')}</tr>`).join('');
  $('#dossiers').innerHTML = order.map((id) => `<article class="dossier" id="${id}" data-g="${META[id].group}">
      <div class="dossier-text">
        <div class="dossier-tags">${META[id].tags.map((t) => `<span class="chip static">${esc(t)}</span>`).join('')}</div>
        <h2 class="h2">${esc(sc[id].label)}</h2>
        <p class="body">${esc(sc[id].blurb)}</p>
        <div class="actions"><a class="btn primary sm" href="twin.html?scenario=${id}">Replay in the operations room →</a><a class="btn sm" href="lab.html?scenario=${id}">Plan interventions</a><a class="btn ghost sm" href="graph.html?scenario=${id}">Learned graph</a></div>
      </div>
      <div class="dossier-chart panel"><div class="skeleton" style="height:220px"></div></div>
      <dl class="dossier-facts"><div class="skeleton" style="height:180px"></div></dl>
    </article>`).join('');

  $('#sFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    $$('#sFilter button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const f = b.dataset.f;
    $$('[data-g]').forEach((el) => { el.hidden = f !== 'all' && el.dataset.g !== f; });
  });

  let done = 0;
  order.forEach((id) => S.summary('nagpur', id).then((x) => { fill(x); if (++done === order.length) { const st = $('#sStatus'); st.className = 'status-line done'; st.innerHTML = '<i class="led"></i>7 scenarios computed · cached for your next visit'; } })
    .catch((e) => { const st = $('#sStatus'); st.className = 'status-line err'; st.innerHTML = `<i class="led"></i>${esc(e.message)}`; }));
  S.summary('raleigh', 'tropical').then((x) => chartInto($('#raleigh'), x, true));

  function fill(x) {
    const tr = $(`#reach tr[data-id="${x.scen}"]`);
    tr.innerHTML = `<th><a href="#${x.scen}">${esc(x.label)}</a></th>` + SYS.map((s) => {
      const pk = x.sysPeak[s], ft = x.sysFirst[s];
      if (pk == null) return '<td class="na">n/a</td>';
      if (ft == null) return `<td class="quiet"><span class="mono">${Math.round(pk * 100)}%</span></td>`;
      const col = C.RISK_HEX[C.stateOf(pk).key];
      return `<td class="hit" style="--c:${col}"><span class="mono">T+${ft.toFixed(1)}</span><small>peak ${Math.round(pk * 100)}%</small></td>`;
    }).join('');
    const art = $('#' + x.scen);
    chartInto(art.querySelector('.dossier-chart'), x);
    const v = x.validation, few = v.events < 3;
    art.querySelector('.dossier-facts').innerHTML = `
      <div><dt>First facility critical</dt><dd class="mono">${x.firstCrit != null ? 'T+' + x.firstCrit.toFixed(1) : 'none'}</dd></div>
      <div><dt>Peak facilities at critical</dt><dd class="mono">${x.peakCrit}</dd></div>
      <div><dt>Cascade self-sustaining</dt><dd class="mono">${x.crCross != null ? 'T+' + x.crCross.toFixed(1) : 'never'}</dd></div>
      <div><dt>Median warning lead</dt><dd class="mono">${few ? '—' : v.lead.toFixed(1) + ' h'}</dd></div>
      <div><dt>Critical events warned</dt><dd class="mono">${few ? 'too few events' : S.pct(v.pod)}</dd></div>
      <div><dt>False alarms</dt><dd class="mono">${few ? '—' : S.pct(v.far)}</dd></div>`;
  }
  function chartInto(el, x, raleigh) {
    el.innerHTML = `<canvas class="chart" style="height:220px"></canvas><div class="legend-inline"><span><i style="border-color:#e4e8ee"></i>City risk</span><span><i class="box" style="background:rgba(229,72,77,.55)"></i>Facilities critical</span><span><i style="border-color:#ef6b73;border-top-style:dashed"></i>Cascade-R ÷ 3</span>${raleigh ? '<span class="dim">Raleigh · tropical rainfall</span>' : ''}</div>`;
    const cv = el.querySelector('canvas');
    const draw = () => {
      const c = S.chart(cv, { height: 220, xr: [0, 72], yr: [0, 1], yticks: [0, 0.35, 0.55, 0.75, 1], yfmt: (y) => (y === 0.35 ? 'watch' : y === 0.55 ? 'high' : y === 0.75 ? 'crit' : y.toFixed(0)), padL: 40, xticks: [0, 12, 24, 36, 48, 60, 72], xfmt: (v) => `T+${v}`,
        bands: [{ y0: 0.55, y1: 0.75, color: 'rgba(238,138,42,0.05)' }, { y0: 0.75, y1: 1, color: 'rgba(229,72,77,0.06)' }],
        series: [{ y: x.risk, dx: x.dt, color: '#e4e8ee', width: 1.6, fill: '#79a7e3', fillAlpha: 0.1 }, { y: x.cr.map((v) => Math.min(1, v / 3)), dx: x.dt * 2, color: '#ef6b73', width: 1.2, dash: [4, 3] }],
        marks: x.liveNow ? [{ x: x.liveNow, label: 'live now', color: 'rgba(121,167,227,0.55)' }] : [] });
      const max = Math.max(1, ...x.crit), g = c.g, bw = Math.max(1, (c.X(x.dt) - c.X(0)) - 0.6);
      g.fillStyle = 'rgba(229,72,77,0.5)';
      x.crit.forEach((n, q) => { if (!n) return; const h = (n / max) * (c.Y(0) - c.Y(0.32)); g.fillRect(c.X(q * x.dt) - bw / 2, c.Y(0) - h, bw, h); });
    };
    draw();
    new ResizeObserver(draw).observe(cv);
  }
  if (location.hash) setTimeout(() => { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }, 300);
})();
